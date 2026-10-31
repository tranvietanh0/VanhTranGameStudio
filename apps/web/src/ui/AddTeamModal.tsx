import { useEffect, useState, type FormEvent } from "react";
import { newRequestId, sendRequest } from "../net/requests";
import { useOfficeStore } from "../store/officeStore";

export function AddTeamModal() {
  const setAddTeamOpen = useOfficeStore((s) => s.setAddTeamOpen);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const close = () => setAddTeamOpen(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const projectPath = path.trim();
    if (!projectPath || pending) return;
    const store = useOfficeStore.getState();
    setPending(true);
    try {
      const teamName = name.trim();
      await sendRequest({
        type: "team.create",
        requestId: newRequestId(),
        projectPath,
        ...(teamName ? { name: teamName } : {}),
      });
      store.pushToast("ok", "Đã tạo team mới");
      store.setAddTeamOpen(false);
    } catch (err) {
      store.pushToast("error", err instanceof Error ? err.message : "Tạo team thất bại");
      setPending(false);
    }
  };

  return (
    <div className="ui-backdrop" onClick={close}>
      <form className="ui-widget ui-dialog ui-form" onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <header className="ui-dialog-head">
          <h2>Thêm team mới</h2>
          <button type="button" className="ui-close" onClick={close} aria-label="Đóng">×</button>
        </header>
        <label className="ui-field">
          <span>Đường dẫn dự án</span>
          <input
            autoFocus
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="C:\Projects\..."
            disabled={pending}
          />
          <small>Thư mục dự án trên máy chạy server, ví dụ C:\Projects\MyGame</small>
        </label>
        <label className="ui-field">
          <span>Tên team (tuỳ chọn)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên hiển thị" disabled={pending} />
        </label>
        <footer className="ui-dialog-foot">
          <button type="button" className="ui-btn" onClick={close} disabled={pending}>Huỷ</button>
          <button type="submit" className="ui-btn ui-btn-primary" disabled={pending || !path.trim()}>
            {pending ? "Đang tạo…" : "Tạo team"}
          </button>
        </footer>
      </form>
    </div>
  );
}
