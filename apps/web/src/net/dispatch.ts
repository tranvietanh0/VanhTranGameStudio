import type { ServerMessage } from "@studio/shared";
import { useOfficeStore } from "../store/officeStore";
import { emitTerminalClosed, emitTerminalFrame } from "./terminalBus";
import { ackRequest, failRequest } from "./requests";

/** Single entry point for every server message, real or mock. Keeps the store as the one source of UI state. */
export function applyServerMessage(msg: ServerMessage): void {
  const store = useOfficeStore.getState();
  switch (msg.type) {
    case "hello":
      store.hydrate(msg.teams, msg.questions, msg.herdrConnected);
      return;
    case "team.upsert":
      store.upsertTeam(msg.team);
      return;
    case "team.remove":
      store.removeTeam(msg.teamId);
      return;
    case "question.upsert":
      store.upsertQuestion(msg.question);
      return;
    case "question.remove":
      store.removeQuestion(msg.questionId);
      return;
    case "herdr.status":
      store.setHerdrConnected(msg.connected);
      return;
    case "terminal.frame":
      emitTerminalFrame(msg);
      return;
    case "terminal.closed":
      emitTerminalClosed(msg);
      return;
    case "ack":
      if (!ackRequest(msg.requestId)) console.debug(`[ws] ack for unknown request ${msg.requestId}`);
      return;
    case "error":
      // A request-scoped error rejects its promise, and the caller shows it. Anything else is global.
      if (msg.requestId && failRequest(msg.requestId, msg.message)) return;
      store.pushToast("error", msg.message);
      return;
  }
}
