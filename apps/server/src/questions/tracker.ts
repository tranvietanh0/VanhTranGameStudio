import type { AgentStatus, HookEvent, LeadQuestion, ServerMessage } from "@studio/shared";
import { logWarn } from "../log.ts";
import { parseAskQuestions } from "./parse.ts";

export const BLOCKED_GRACE_MS = 1500;
const ASK_TOOL = "AskUserQuestion";

export interface TrackerDeps {
  emit: (message: ServerMessage) => void;
  readScreenTail: (paneId: string) => Promise<string>;
  /** Schedules fn after ms and returns a cancel function. */
  schedule: (fn: () => void, ms: number) => () => void;
  isKnownTeam: (teamId: string) => boolean;
  now?: () => number;
  newId?: () => string;
  blockedGraceMs?: number;
}

/**
 * Lead questions (the "lead asks the CEO" items).
 * - "ask": from the PreToolUse(AskUserQuestion) hook, with structured options.
 * - "blocked": herdr reports the pane blocked with no hook question after the grace period.
 * Questions are removed when the pane leaves blocked (for ask: only once it has been seen blocked),
 * on PostToolUse(AskUserQuestion), when the team disappears, or when answered.
 */
export class QuestionTracker {
  private readonly questions = new Map<string, LeadQuestion>();
  private readonly askByPane = new Map<string, string>();
  private readonly blockedByPane = new Map<string, string>();
  private readonly askSeenBlocked = new Set<string>();
  private readonly graceCancel = new Map<string, () => void>();
  private readonly lastStatus = new Map<string, AgentStatus>();
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly blockedGraceMs: number;

  constructor(private readonly deps: TrackerDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.blockedGraceMs = deps.blockedGraceMs ?? BLOCKED_GRACE_MS;
  }

  list(): LeadQuestion[] {
    return [...this.questions.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Removes a question by id. Returns false when it is not pending (already answered or gone). */
  remove(questionId: string): boolean {
    const question = this.questions.get(questionId);
    if (!question) return false;
    this.questions.delete(questionId);
    if (this.askByPane.get(question.teamId) === questionId) this.askByPane.delete(question.teamId);
    if (this.blockedByPane.get(question.teamId) === questionId) this.blockedByPane.delete(question.teamId);
    this.deps.emit({ type: "question.remove", questionId });
    return true;
  }

  get(questionId: string): LeadQuestion | undefined {
    return this.questions.get(questionId);
  }

  async onHookEvent(event: HookEvent): Promise<void> {
    if (event.event === "PreToolUse" && event.payload.tool_name === ASK_TOOL) {
      await this.onAsk(event.paneId, event.payload.tool_input);
      return;
    }
    if (event.event === "PostToolUse" && event.payload.tool_name === ASK_TOOL) {
      this.removeAsk(event.paneId);
    }
  }

  onStatus(paneId: string, status: AgentStatus): void {
    const previous = this.lastStatus.get(paneId);
    this.lastStatus.set(paneId, status);
    if (status === "blocked" && previous !== "blocked") this.onEnterBlocked(paneId);
    if (status !== "blocked" && previous === "blocked") this.onLeaveBlocked(paneId);
  }

  onTeamRemoved(paneId: string): void {
    this.cancelGrace(paneId);
    this.lastStatus.delete(paneId);
    this.askSeenBlocked.delete(paneId);
    this.removeAsk(paneId);
    this.removeBlocked(paneId);
  }

  private async onAsk(paneId: string, toolInput: unknown): Promise<void> {
    const questions = parseAskQuestions(toolInput);
    if (!questions) {
      logWarn("questions", `AskUserQuestion from ${paneId} has an unexpected shape; ignored`);
      return;
    }
    if (!this.deps.isKnownTeam(paneId)) {
      logWarn("questions", `AskUserQuestion from unknown pane ${paneId}; ignored`);
      return;
    }
    const screenTail = await this.deps.readScreenTail(paneId).catch((err: unknown) => {
      logWarn("questions", `could not read screen of ${paneId}`, String(err));
      return "";
    });
    this.removeAsk(paneId);
    this.removeBlocked(paneId);
    this.cancelGrace(paneId);
    this.putQuestion(paneId, "ask", questions, screenTail, this.askByPane);
    if (this.lastStatus.get(paneId) === "blocked") this.askSeenBlocked.add(paneId);
  }

  private onEnterBlocked(paneId: string): void {
    if (this.askByPane.has(paneId)) {
      this.askSeenBlocked.add(paneId);
      return;
    }
    this.cancelGrace(paneId);
    const cancel = this.deps.schedule(() => {
      this.graceCancel.delete(paneId);
      void this.raiseBlocked(paneId);
    }, this.blockedGraceMs);
    this.graceCancel.set(paneId, cancel);
  }

  private async raiseBlocked(paneId: string): Promise<void> {
    if (this.lastStatus.get(paneId) !== "blocked") return;
    if (this.askByPane.has(paneId) || this.blockedByPane.has(paneId)) return;
    if (!this.deps.isKnownTeam(paneId)) return;
    const screenTail = await this.deps.readScreenTail(paneId).catch((err: unknown) => {
      logWarn("questions", `could not read screen of blocked pane ${paneId}`, String(err));
      return "";
    });
    if (this.lastStatus.get(paneId) !== "blocked" || this.askByPane.has(paneId)) return;
    this.putQuestion(paneId, "blocked", [], screenTail, this.blockedByPane);
  }

  private onLeaveBlocked(paneId: string): void {
    this.cancelGrace(paneId);
    this.removeBlocked(paneId);
    if (this.askSeenBlocked.delete(paneId)) this.removeAsk(paneId);
  }

  private putQuestion(
    teamId: string,
    kind: LeadQuestion["kind"],
    questions: LeadQuestion["questions"],
    screenTail: string,
    index: Map<string, string>,
  ): void {
    const question: LeadQuestion = {
      id: this.newId(),
      teamId,
      kind,
      questions,
      screenTail,
      createdAt: this.now(),
    };
    this.questions.set(question.id, question);
    index.set(teamId, question.id);
    this.deps.emit({ type: "question.upsert", question });
  }

  private removeAsk(paneId: string): void {
    const id = this.askByPane.get(paneId);
    if (id) this.remove(id);
  }

  private removeBlocked(paneId: string): void {
    const id = this.blockedByPane.get(paneId);
    if (id) this.remove(id);
  }

  private cancelGrace(paneId: string): void {
    const cancel = this.graceCancel.get(paneId);
    if (!cancel) return;
    cancel();
    this.graceCancel.delete(paneId);
  }
}
