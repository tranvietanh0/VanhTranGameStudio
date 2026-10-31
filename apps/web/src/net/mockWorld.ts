import type { AgentStatus, LeadQuestion, Team, TeamMember } from "@studio/shared";

const PROJECT_NAMES = [
  "kho-hang", "cham-soc-khach", "ke-toan", "game-lobby", "analytics",
  "ban-hang", "marketing", "thu-vien", "cloud-ops", "build-farm",
] as const;

const INITIAL_STATUSES: readonly AgentStatus[] = ["idle", "working", "done", "unknown"];

const QUESTION_TEMPLATES = [
  {
    question: "Dùng schema mới hay giữ bản cũ để tránh migrate dữ liệu?",
    header: "Schema",
    options: [
      { label: "Schema mới", description: "Migrate một lần, dọn trường cũ" },
      { label: "Giữ bản cũ", description: "Không đụng dữ liệu hiện có" },
    ],
  },
  {
    question: "Triển khai lên staging trước hay thẳng production?",
    header: "Triển khai",
    options: [
      { label: "Staging trước", description: "An toàn hơn, chậm thêm nửa giờ" },
      { label: "Production", description: "Khách đang chờ bản sửa" },
      { label: "Để sếp quyết sau", description: "Em làm phần khác trước" },
    ],
  },
] as const;

export function pick<T>(items: readonly T[], random: () => number = Math.random): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("pick() called with an empty list");
  return item;
}

export function makeMockTeam(index: number, random: () => number = Math.random): Team {
  const base = pick(PROJECT_NAMES.length ? PROJECT_NAMES : ["project"], random);
  const round = Math.floor(index / PROJECT_NAMES.length);
  const projectName = round === 0 ? base : `${base}-${round + 1}`;
  return {
    id: `mock:p${index + 1}`,
    workspaceId: "mock-ws",
    workspaceLabel: "Mock",
    terminalId: `mock-t${index + 1}`,
    cwd: `C:/mock/${projectName}`,
    projectName,
    agent: "claude",
    status: pick(INITIAL_STATUSES, random),
    slot: index,
    members: [],
  };
}

const MEMBER_TEMPLATES = [
  { agentType: "Explore", description: "Tìm chỗ xử lý đăng nhập trong repo" },
  { agentType: "general-purpose", description: "Viết test cho module thanh toán" },
  { agentType: "t1k-tester", description: "Chạy bộ test và tóm tắt lỗi" },
  { agentType: "t1k-code-reviewer", description: "Review PR #42 về cache" },
  { agentType: "t1k-scout", description: "Dò các nơi gọi hàm tính thuế" },
  { agentType: "Plan", description: "Lên kế hoạch tách service đơn hàng" },
] as const;

export function makeMockMember(seq: number, now: number, random: () => number = Math.random): TeamMember {
  const template = pick(MEMBER_TEMPLATES, random);
  return { id: `mock-agent-${seq}`, agentType: template.agentType, description: template.description, startedAt: now };
}

/** Alternates the two kinds so both dialog variants get exercised. */
export function makeMockQuestion(team: Team, seq: number, now: number, random: () => number = Math.random): LeadQuestion {
  const id = `mock-q-${seq}`;
  if (seq % 3 === 0) {
    return {
      id,
      teamId: team.id,
      kind: "blocked",
      questions: [],
      screenTail: "Claude muốn chạy: npm test\nAllow this command?\n  1. Yes\n  2. No, and tell Claude why",
      createdAt: now,
    };
  }
  const template = pick(QUESTION_TEMPLATES, random);
  return {
    id,
    teamId: team.id,
    kind: "ask",
    questions: [{ question: template.question, header: template.header, options: [...template.options], multiSelect: false }],
    screenTail: "Claude đang chờ bạn chọn một phương án.",
    createdAt: now,
  };
}
