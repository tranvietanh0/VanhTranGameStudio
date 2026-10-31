import type { ClientMessage, Team } from "@studio/shared";
import { useOfficeStore } from "../store/officeStore";
import { applyServerMessage } from "./dispatch";
import { makeMockQuestion, makeMockTeam, pick } from "./mockWorld";
import { setTransport, type Transport } from "./transport";

const STATUS_TICK_MS = 2_500;
const QUESTION_EVERY_MS = 20_000;
const QUESTION_TTL_MS = 60_000;
const ACK_DELAY_MS = 200;
const CALM_STATUSES = ["idle", "working", "done", "unknown"] as const;

/**
 * Runs the office with no server: fake teams whose status drifts, a fake lead question every
 * ~20s, and local answers for question.answer / team.create / team.prompt. Terminal messages are
 * accepted and dropped, so the panel stays blank in mock mode.
 */
export function startMock(count: number): () => void {
  useOfficeStore.getState().setConnection("mock");
  const teams = Array.from({ length: count }, (_, i) => makeMockTeam(i));
  applyServerMessage({ type: "hello", teams, questions: [], herdrConnected: true });

  let seq = 0;
  const ttlTimers = new Set<ReturnType<typeof setTimeout>>();

  const resolveQuestion = (questionId: string): void => {
    const question = useOfficeStore.getState().questions[questionId];
    if (!question) return;
    applyServerMessage({ type: "question.remove", questionId });
    const team = useOfficeStore.getState().teams[question.teamId];
    if (team) applyServerMessage({ type: "team.upsert", team: { ...team, status: "working" } });
  };

  const ackLater = (requestId: string): void => {
    setTimeout(() => applyServerMessage({ type: "ack", requestId }), ACK_DELAY_MS);
  };

  const transport: Transport = {
    name: "mock",
    send(msg: ClientMessage): boolean {
      switch (msg.type) {
        case "question.answer":
          resolveQuestion(msg.questionId);
          ackLater(msg.requestId);
          return true;
        case "team.prompt":
          ackLater(msg.requestId);
          return true;
        case "team.create": {
          const existing = Object.keys(useOfficeStore.getState().teams).length;
          const name = msg.name ?? msg.projectPath.split(/[\\/]/).filter(Boolean).pop() ?? "new-team";
          const team: Team = {
            id: `mock:new${existing + 1}`,
            workspaceId: "mock-ws",
            workspaceLabel: "Mock",
            terminalId: `mock-new${existing + 1}`,
            cwd: msg.projectPath,
            projectName: name,
            agent: "claude",
            status: "idle",
            slot: existing,
          };
          applyServerMessage({ type: "team.upsert", team });
          ackLater(msg.requestId);
          return true;
        }
        case "terminal.open":
        case "terminal.input":
        case "terminal.resize":
        case "terminal.close":
          return true;
        default:
          return false;
      }
    },
  };

  setTransport(transport);

  const statusTimer = setInterval(() => {
    const candidates = Object.values(useOfficeStore.getState().teams).filter((t) => t.status !== "blocked");
    if (candidates.length === 0) return;
    const team = pick(candidates);
    applyServerMessage({ type: "team.upsert", team: { ...team, status: pick(CALM_STATUSES) } });
  }, STATUS_TICK_MS);

  const questionTimer = setInterval(() => {
    const candidates = Object.values(useOfficeStore.getState().teams).filter((t) => t.status !== "blocked");
    if (candidates.length === 0) return;
    seq += 1;
    const team = pick(candidates);
    const question = makeMockQuestion(team, seq, Date.now());
    applyServerMessage({ type: "team.upsert", team: { ...team, status: "blocked" } });
    applyServerMessage({ type: "question.upsert", question });
    const ttl = setTimeout(() => {
      ttlTimers.delete(ttl);
      resolveQuestion(question.id);
    }, QUESTION_TTL_MS);
    ttlTimers.add(ttl);
  }, QUESTION_EVERY_MS);

  return () => {
    clearInterval(statusTimer);
    clearInterval(questionTimer);
    for (const ttl of ttlTimers) clearTimeout(ttl);
    ttlTimers.clear();
    setTransport(null);
  };
}
