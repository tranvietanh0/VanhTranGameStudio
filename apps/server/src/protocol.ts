import type { AnswerPayload, ClientMessage } from "@studio/shared";
import { isRecord } from "./herdr/errors.ts";
import { isTerminalKey } from "./questions/keys.ts";

export class ProtocolError extends Error {
  /** requestId of the offending message when it could be read, so the error can be correlated. */
  readonly requestId?: string;

  constructor(message: string, requestId?: string) {
    super(message);
    this.name = "ProtocolError";
    this.requestId = requestId;
  }
}

/** Largest terminal input chunk accepted, in base64 characters. */
export const MAX_INPUT_CHARS = 64 * 1024;
const MAX_DIMENSION = 500;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function str(obj: Record<string, unknown>, key: string, requestId?: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value === "") throw new ProtocolError(`${key} must be a non-empty string`, requestId);
  return value;
}

function dimension(obj: Record<string, unknown>, key: string): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_DIMENSION) {
    throw new ProtocolError(`${key} must be an integer 1-${MAX_DIMENSION}`);
  }
  return value;
}

function parseAnswer(raw: unknown, requestId: string): AnswerPayload {
  if (!isRecord(raw)) throw new ProtocolError("answer must be an object", requestId);
  if (raw.kind === "options") {
    const choices = raw.choices;
    if (!Array.isArray(choices) || !choices.every((c) => typeof c === "number" && Number.isInteger(c) && c >= 0)) {
      throw new ProtocolError("options answer needs choices: non-negative integers", requestId);
    }
    return { kind: "options", choices };
  }
  if (raw.kind === "text") {
    if (typeof raw.text !== "string") throw new ProtocolError("text answer needs a text string", requestId);
    return { kind: "text", text: raw.text };
  }
  if (raw.kind === "keys") {
    const keys = raw.keys;
    if (!Array.isArray(keys) || !keys.every(isTerminalKey)) {
      throw new ProtocolError("keys answer contains an unknown key name", requestId);
    }
    return { kind: "keys", keys };
  }
  throw new ProtocolError(`unknown answer kind ${JSON.stringify(raw.kind)}`, requestId);
}

/** Parses and validates one client → server JSON message. Throws ProtocolError on anything unexpected. */
export function parseClientMessage(text: string): ClientMessage {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProtocolError("message is not valid JSON");
  }
  if (!isRecord(raw) || typeof raw.type !== "string") throw new ProtocolError("message needs a string type");
  const requestId = typeof raw.requestId === "string" ? raw.requestId : undefined;

  switch (raw.type) {
    case "terminal.open":
      return { type: "terminal.open", teamId: str(raw, "teamId"), cols: dimension(raw, "cols"), rows: dimension(raw, "rows") };
    case "terminal.close":
      return { type: "terminal.close", teamId: str(raw, "teamId") };
    case "terminal.resize":
      return { type: "terminal.resize", teamId: str(raw, "teamId"), cols: dimension(raw, "cols"), rows: dimension(raw, "rows") };
    case "terminal.input": {
      const data = str(raw, "data");
      if (data.length > MAX_INPUT_CHARS || !BASE64.test(data)) {
        throw new ProtocolError("terminal.input data must be base64 and at most 64 KiB");
      }
      return { type: "terminal.input", teamId: str(raw, "teamId"), data };
    }
    case "question.answer":
      return {
        type: "question.answer",
        requestId: str(raw, "requestId"),
        questionId: str(raw, "questionId", requestId),
        answer: parseAnswer(raw.answer, str(raw, "requestId")),
      };
    case "team.create": {
      const name = raw.name;
      if (name !== undefined && typeof name !== "string") throw new ProtocolError("name must be a string", requestId);
      return {
        type: "team.create",
        requestId: str(raw, "requestId"),
        projectPath: str(raw, "projectPath", requestId),
        ...(name !== undefined ? { name } : {}),
      };
    }
    case "team.prompt":
      return {
        type: "team.prompt",
        requestId: str(raw, "requestId"),
        teamId: str(raw, "teamId", requestId),
        text: str(raw, "text", requestId),
      };
    default:
      throw new ProtocolError(`unknown message type ${JSON.stringify(raw.type)}`, requestId);
  }
}
