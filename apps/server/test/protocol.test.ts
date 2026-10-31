import { describe, expect, test } from "bun:test";
import { parseClientMessage, ProtocolError } from "../src/protocol.ts";
import { parseReply } from "../src/herdr/rpc.ts";

describe("client message validation", () => {
  test("accepts a well-formed terminal.input and answer", () => {
    expect(parseClientMessage(JSON.stringify({ type: "terminal.input", teamId: "w1:p1", data: "ZWNobyBoaQ0K" })).type).toBe("terminal.input");
    const answer = parseClientMessage(JSON.stringify({
      type: "question.answer", requestId: "r1", questionId: "q1", answer: { kind: "keys", keys: ["Down", "Enter"] },
    }));
    expect(answer.type).toBe("question.answer");
  });

  test("rejects non-base64 input, unknown key names and bad dimensions", () => {
    expect(() => parseClientMessage(JSON.stringify({ type: "terminal.input", teamId: "w1:p1", data: "not base64!" }))).toThrow(ProtocolError);
    expect(() => parseClientMessage(JSON.stringify({
      type: "question.answer", requestId: "r2", questionId: "q1", answer: { kind: "keys", keys: ["F13"] },
    }))).toThrow(/unknown key/);
    expect(() => parseClientMessage(JSON.stringify({ type: "terminal.open", teamId: "w1:p1", cols: 0, rows: 20 }))).toThrow(/cols/);
  });

  test("errors carry the requestId when the message had one", () => {
    try {
      parseClientMessage(JSON.stringify({ type: "team.prompt", requestId: "r9", teamId: "", text: "hi" }));
      throw new Error("expected a throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ProtocolError);
      expect((err as ProtocolError).requestId).toBe("r9");
    }
  });
});

describe("herdr reply parsing", () => {
  test("result is returned, herdr error becomes a coded error", () => {
    expect(parseReply("ping", '{"id":"1","result":{"type":"pong"}}')[1]).toEqual({ type: "pong" });
    const [err] = parseReply("pane.get", '{"id":"1","error":{"code":"pane_not_found","message":"no such pane"}}');
    expect(err?.message).toMatch(/no such pane/);
    expect((err as { code?: string }).code).toBe("pane_not_found");
  });
});
