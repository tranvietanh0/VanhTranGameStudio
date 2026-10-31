import type { ClientMessage, ServerMessage } from "@studio/shared";
import { logError, logWarn } from "./log.ts";
import { ProtocolError, parseClientMessage } from "./protocol.ts";
import type { StudioServices } from "./services.ts";
import { AnswerError, answerQuestion, type AnswerDeps } from "./questions/answer.ts";
import { createTeam, promptTeam, CreateError } from "./teams/create.ts";
import { TerminalError } from "./terminal/bridge.ts";

/** Sends one message to the client; requests get an ack or an error that names their requestId. */
function reply(services: StudioServices, clientId: string, message: ServerMessage): void {
  services.hub.send([clientId], message);
}

function answerDeps(services: StudioServices): AnswerDeps {
  return {
    sendText: async (paneId, text) => {
      await services.call("pane.send_input", { pane_id: paneId, text });
    },
    sendEnter: async (paneId) => {
      await services.call("pane.send_keys", { pane_id: paneId, keys: ["Enter"] });
    },
    withInput: (teamId, fn) => services.bridge.withInput(teamId, fn),
    sleep: (ms) => Bun.sleep(ms),
  };
}

/** Handles one client → server message. Every failure is reported to the client and logged. */
export async function handleClientMessage(services: StudioServices, clientId: string, text: string): Promise<void> {
  let message: ClientMessage;
  try {
    message = parseClientMessage(text);
  } catch (err) {
    const requestId = err instanceof ProtocolError ? err.requestId : undefined;
    logWarn("ws", "rejected client message", err instanceof Error ? err.message : String(err));
    reply(services, clientId, { type: "error", message: errorText(err), ...(requestId ? { requestId } : {}) });
    return;
  }

  try {
    await dispatch(services, clientId, message);
  } catch (err) {
    const requestId = "requestId" in message ? message.requestId : undefined;
    logError("ws", `${message.type} failed`, errorText(err));
    reply(services, clientId, { type: "error", message: errorText(err), ...(requestId ? { requestId } : {}) });
  }
}

async function dispatch(services: StudioServices, clientId: string, message: ClientMessage): Promise<void> {
  switch (message.type) {
    case "terminal.open":
      services.bridge.open(message.teamId, clientId, message.cols, message.rows);
      return;
    case "terminal.input":
      services.bridge.input(message.teamId, clientId, message.data);
      return;
    case "terminal.resize":
      services.bridge.resize(message.teamId, clientId, message.cols, message.rows);
      return;
    case "terminal.close":
      services.bridge.close(message.teamId, clientId);
      return;
    case "question.answer": {
      const question = services.tracker.get(message.questionId);
      if (!question) throw new AnswerError("this question is no longer pending");
      await answerQuestion(answerDeps(services), question, message.answer);
      services.tracker.remove(question.id);
      reply(services, clientId, { type: "ack", requestId: message.requestId });
      return;
    }
    case "team.create": {
      await createTeam(
        {
          call: services.call,
          teams: () => services.registry.list(),
          getTeam: (id) => services.registry.get(id),
          hooksSettingsFile: services.hooksSettingsFile,
        },
        { projectPath: message.projectPath, ...(message.name !== undefined ? { name: message.name } : {}) },
      );
      reply(services, clientId, { type: "ack", requestId: message.requestId });
      return;
    }
    case "team.prompt":
      await promptTeam(
        { call: services.call, getTeam: (id) => services.registry.get(id) },
        message.teamId,
        message.text,
      );
      reply(services, clientId, { type: "ack", requestId: message.requestId });
      return;
  }
}

/** Typed errors keep their message; anything else is named so it is never swallowed. */
function errorText(err: unknown): string {
  if (err instanceof AnswerError || err instanceof TerminalError || err instanceof CreateError) return err.message;
  if (err instanceof ProtocolError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
