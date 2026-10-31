# Phase 1 — Office MVP (văn phòng 3D, bàn = team = terminal)

Status: đã duyệt hướng (Tailscale, CEO, lead hỏi ý kiến) · Ngày: 2026-10-31

## Mục tiêu

Mở trình duyệt (PC, laptop, điện thoại) là thấy văn phòng 3D. Mỗi cụm bàn là một **team**,
tương ứng một pane herdr chạy Claude Code (leader). Click vào bàn thì mở terminal thật của team,
có nút tạo team mới, có đèn trạng thái. App phải nhẹ và mượt dù có nhiều team.

**Mô phỏng văn phòng thật:** bạn là **CEO**, có nhân vật riêng đi lại trong văn phòng. Khi Claude
hỏi ý kiến, **team lead đứng dậy giơ tay xin ý kiến sếp**. CEO đi tới hoặc bấm vào bong bóng để
trả lời ngay trong game.

Ngoài phạm vi Phase 1: nhân viên subagent (Phase 2), lead tự đi tới phòng CEO xếp hàng chờ
(Phase 2), Resource Governor và cho team ngủ đông (Phase 3), push notification, Tauri, bảng trắng
và phòng họp (Phase 4).

## Kiến trúc đã chốt

```
[Browser]  apps/web: Vite + React + React Three Fiber + drei + xterm.js + zustand
    │  WebSocket (token auth): sự kiện trạng thái; stream terminal CHỈ cho team đang mở
[apps/server]  Bun, 1 process
    ├─ herdr-client   → socket herdr (session.snapshot, events.subscribe, pane.*, agent.*, worktree.*)
    ├─ team-registry  → map herdr pane ↔ team (dự án, worktree, slot bàn)
    └─ ws-hub         → fan-out sự kiện cho nhiều thiết bị cùng lúc
[herdr server]  workspace = dự án, pane = team (leader Claude Code)
```

Nguyên tắc:
- **herdr là nguồn sự thật.** Server không giữ trạng thái team riêng. Khởi động lại thì dựng lại
  từ `session.snapshot`. Chỉ lưu vị trí bàn (UI) trong `data/office.json`.
- **Đẩy sự kiện, không polling:** `events.subscribe` (`pane.agent_status_changed`, `pane.created`,
  `pane.closed`, `pane_output_changed`, `worktree.created`...).
- **Trạng thái agent lấy từ herdr:** `idle | working | blocked | done | unknown`.

### Dữ liệu đã kiểm tra trên máy (herdr 0.9.3, protocol 22)

Các method/event dưới đây có trong `herdr api schema --json`: `session.snapshot`, `events.subscribe`,
`workspace.create`, `pane.split`, `pane.read` (format `ansi`), `pane.send_input`, `pane.send_keys`,
`pane.process_info`, `agent.start`, `agent.prompt`, `agent.list`, `worktree.create/list/remove`,
event `pane_output_changed`. Socket: `%APPDATA%\herdr\herdr.sock`. Lúc kiểm tra, herdr server
đang ở trạng thái `not running`.

## Ngân sách hiệu năng (là tiêu chí nghiệm thu)

| Hạng mục | Ngân sách |
|---|---|
| Tab web với 20 team, đang rảnh | JS heap < 150MB, RAM tab < 250MB |
| Render khi rảnh | 0 frame/s (`frameloop="demand"`), dừng hẳn khi ẩn tab |
| Draw calls cả văn phòng | < 60 (instancing cho bàn, ghế, màn hình) |
| Server Bun | RSS < 80MB với 20 team |
| Băng thông team không mở | chỉ sự kiện trạng thái, không gửi output terminal |
| Mobile | DPR ≤ 1.5, tắt postprocessing, vẫn ≥ 30fps khi xoay camera |

## Kết quả spike (2026-10-31, đã chạy thật trên máy)

**1.0: PASS, chốt cách B (stream trực tiếp), bỏ cách A.**
- Kết nối: socket herdr trên Windows là **named pipe** `\\.\pipe\%APPDATA%\herdr\herdr.sock`
  (đường dẫn file `.sock` không kết nối trực tiếp được). Dùng `node:net` từ Bun, connect ~3ms.
- **Mỗi kết nối chỉ xử lý 1 request.** Gửi request thứ hai trên cùng kết nối sẽ không có phản hồi.
  `events.subscribe` thì giữ một kết nối sống riêng.
- Không có event `output_changed`. Subscribe `pane.agent_status_changed` **bắt buộc có `pane_id`**,
  nên phải subscribe theo từng pane. Các event `pane.created/closed`, `workspace.*` thì không cần.
- Terminal: `herdr terminal session control <terminal_id> --cols --rows` qua stdio. Output là
  NDJSON `{type:"terminal.frame", bytes(base64), encoding, full, seq, width, height}`. Input là
  `{type:"terminal.input", bytes:<base64>, encoding:"base64"}`. **Độ trễ echo 19–49ms** (mục tiêu
  < 80ms). Còn `pane.send_input` qua RPC mất khoảng 100ms mỗi lần.
- `pane.read` (ansi) mất ~2ms, dùng cho xem trước. `pane.process_info` trả về pid để đo RAM.

**1.0b: PASS.**
- `claude --settings <file>` nạp được hook của studio. Hook `PreToolUse(AskUserQuestion)` nhận
  đủ `questions[{question, header, options[{label,description}], multiSelect}]`.
- Herdr báo `blocked` khi có câu hỏi, và cả khi có hộp thoại "trust this folder".
- Gửi phím số (`"2"`) qua control stream thì Claude chọn đúng option và chạy tiếp
  (`working` → `done`).
- Prompt phải gửi bằng **`agent.prompt`**. Gõ nhanh qua stream sẽ bị coi là paste, Enter thành
  xuống dòng.
- Thư mục mới hiện hộp thoại trust với lựa chọn mặc định "No, exit". Studio phải hiện hộp thoại
  này thành câu hỏi cho CEO; tuyệt đối không tự gửi Enter.

## Các bước (mỗi bước có check riêng)

### 1.0 Spike: kết nối herdr và cách mirror terminal
- Từ Bun trên Windows, kết nối socket herdr, gọi `session.snapshot`, subscribe events.
- So sánh 2 cách hiển thị terminal trong xterm.js:
  - **A, mirror snapshot:** khi có `pane_output_changed` của pane đang mở thì gọi `pane.read --format ansi`
    (throttle khoảng 30ms) rồi vẽ lại; input gửi qua `pane.send_input/send_keys`.
  - **B, PTY attach:** server chạy `herdr agent attach <id>` trong một PTY và stream byte thật.
- **Check:** script in ra snapshot cùng sự kiện live khi gõ lệnh trong herdr. Đo độ trễ gõ phím đến
  lúc hiển thị (mục tiêu < 80ms trong LAN) và độ chính xác màu, cursor của A so với B. Chốt một cách
  và ghi lý do vào file này.

### 1.0b Spike: bắt câu hỏi của Claude và trả lời từ game
- Hai lớp tín hiệu:
  1. **herdr:** pane chuyển sang `blocked`. Đây là tín hiệu nền, luôn có, kể cả không có hook.
  2. **Claude Code hooks:** khi chạy Claude, nạp thêm một file settings riêng của studio
     (`claude --settings <studio-hooks.json>`), không sửa `~/.claude` hay repo của dự án.
     Hook `PreToolUse` (matcher `AskUserQuestion`) và `Notification` POST nội dung câu hỏi và các
     lựa chọn về server qua `127.0.0.1`.
- Trả lời: gửi phím chọn option qua `pane.send_keys` (số hoặc mũi tên + Enter), hoặc gửi text
  qua `pane.send_input` với câu trả lời tự do hay quyền Yes/No.
- **Check:** trong một pane thật, cho Claude gọi AskUserQuestion. Server nhận được câu hỏi kèm
  options trong < 1s; gửi lựa chọn từ script thì Claude nhận đúng option. Nếu `--settings` không
  dùng được thì ghi lại và chọn phương án khác trước khi làm 1.7.

### 1.1 Khung dự án
- Bun workspaces: `apps/server`, `apps/web`, `packages/shared` (kiểu dữ liệu event/WS protocol).
- TypeScript strict, Biome lint, `bun run dev` chạy song song server và web.
- **Check:** `bun run typecheck` và `bun run lint` sạch; `bun run dev` mở được trang trắng có scene R3F.

### 1.2 Server: herdr bridge, team registry, WS hub, auth
- `herdr-client`: kết nối, tự reconnect, lỗi phải báo rõ (không fallback im lặng).
- `team-registry`: dựng danh sách team từ snapshot, cập nhật theo event.
- WS protocol (trong `packages/shared`): `teams.snapshot`, `team.updated`, `team.removed`,
  `terminal.open/close/data/input`.
- Auth: token sinh lần đầu, lưu trong `.env` (gitignored, có `.env.example`). Mặc định bind
  `127.0.0.1`; chỉ bind IP VPN/LAN khi bật cấu hình `STUDIO_BIND`.
- **Check:** unit test với herdr giả (fake socket); test tích hợp với herdr thật: tạo pane bằng
  CLI thì web nhận `team.updated` trong < 500ms. Thiếu token thì WS bị từ chối (test RED trước).

### 1.3 Tạo team mới
- Form: chọn thư mục dự án (danh sách gợi ý từ workspace herdr đã có), tên team.
- Luồng: `workspace.create` (nếu dự án chưa có) → tạo pane với cwd → `agent.start` (Claude Code).
- Nếu dự án là git repo và **đã có team khác** thì tự `worktree.create` cho team mới.
- **Check:** tạo 2 team cùng một repo thì có 2 worktree khác nhau và 2 pane leader chạy;
  `git worktree list` khớp.

### 1.4 Văn phòng 3D
- Camera orthographic isometric, xoay/zoom có giới hạn; phong cách cozy low-poly, pastel, ánh sáng
  baked, không bóng đổ realtime.
- Asset CC0 (Kenney Furniture Kit / KayKit / Quaternius), nén glTF bằng meshopt, texture KTX2.
- Lưới slot: mỗi team một cụm bàn; màn hình phát sáng theo trạng thái (xanh working, vàng idle,
  đỏ nhấp nháy blocked, xám unknown/done). Nhãn tên team bằng HTML overlay nhẹ.
- Layout có **phòng CEO** (bàn sếp, cửa kính), khu các team, lối đi.
- **Nhân vật CEO:** click hoặc tap vào sàn để đi tới đó (tìm đường A* trên lưới, bàn ghế là vật
  cản); PC dùng thêm được WASD; camera isometric đi theo CEO. Chỉ render liên tục khi đang di
  chuyển hoặc có animation, đứng yên thì quay về 0 fps.
- Đi tới gần bàn team thì hiện nút "Làm việc với team", bấm để mở terminal. Click từ xa thì camera
  lướt tới, CEO tự đi tới.
- **Check:** đo với 20 team giả (nút debug): đạt bảng ngân sách ở trên (Chrome Performance +
  `renderer.info`); đổi trạng thái pane trong herdr thì màu đèn đổi trong < 500ms; CEO đi vòng qua
  bàn ghế, không xuyên tường; dừng đi thì fps về 0.

### 1.5 Panel terminal
- xterm.js (+ fit addon, WebGL renderer) cho **đúng một** team đang mở; đóng panel thì hủy stream.
- **Check:** gõ lệnh, chạy Claude Code, copy/paste, resize đều đúng; chuyển qua lại 10 team
  thì heap không tăng dần (không rò rỉ instance xterm).

### 1.6 Responsive, mobile và truy cập từ xa
- Màn hình nhỏ: tự giảm chất lượng; thêm danh sách team dạng thẻ; terminal toàn màn hình.
- **Đã chốt Tailscale.** Tài liệu `docs/remote-access.md`: cài Tailscale (gói Personal miễn phí) lên máy chính và thiết bị,
  đặt `STUDIO_BIND` = IP Tailscale. Không mở port ra internet.
- **Check:** mở từ điện thoại qua 4G và Tailscale, thấy văn phòng và gửi được một prompt cho team.

### 1.7 Team lead xin ý kiến CEO
- Có câu hỏi (từ hook, hoặc herdr `blocked`): lead đứng dậy, giơ tay, bong bóng "Sếp ơi, cho em
  hỏi…" kèm vài chữ đầu câu hỏi; màn hình bàn nhấp nháy đỏ.
- **Hộp thư "Đang chờ sếp duyệt"** ở góc màn hình: danh sách lead đang hỏi, mới nhất trên cùng.
  Bấm vào thì camera lướt tới.
- **Hội thoại kiểu game:** CEO tới bàn hoặc bấm bong bóng thì hiện khung hội thoại với chân dung
  lead, câu hỏi đầy đủ, các lựa chọn là nút bấm, ô "Ý kiến khác" và nút "Mở terminal" để xem chi
  tiết.
- Chỉ có tín hiệu `blocked`, không có nội dung từ hook (ví dụ hỏi quyền chạy lệnh): hội thoại hiện
  vài dòng cuối của terminal (`pane.read`) cùng nút Yes / No / Mở terminal.
- Trả lời xong: lead ngồi xuống làm tiếp, mục đó biến khỏi hộp thư trên mọi thiết bị.
- **Check:** Claude hỏi AskUserQuestion thì trong < 1s lead giơ tay trên cả PC và điện thoại; trả
  lời từ điện thoại thì Claude chạy tiếp với đúng lựa chọn; trả lời trực tiếp trong terminal thì
  bong bóng cũng tự tắt.

## Rủi ro / câu hỏi mở
- Socket herdr trên Windows từ Bun: nếu Bun không kết nối được, server sẽ gọi qua `herdr` CLI
  (`herdr api ...`). Spike 1.0 quyết định.
- Mirror snapshot (A) có thể sai lệch với ứng dụng full-screen TUI; khi đó chọn B.
- Herdr đang dùng trên Windows; Linux/macOS chưa nằm trong phạm vi kiểm thử Phase 1.
