import { describe, expect, test } from "bun:test";
import type { LeadQuestion } from "@studio/shared";
import { keyToBytes } from "../src/questions/keys.ts";
import {
  AnswerError,
  MULTI_SELECT_MESSAGE,
  answerQuestion,
  type AnswerDeps,
} from "../src/questions/answer.ts";

describe("key mapping", () => {
  test("named keys map to terminal sequences", () => {
    expect(keyToBytes("Enter")).toBe("\r");
    expect(keyToBytes("Escape")).toBe("\x1b");
    expect(keyToBytes("Up")).toBe("\x1b[A");
    expect(keyToBytes("Down")).toBe("\x1b[B");
    expect(keyToBytes("Right")).toBe("\x1b[C");
    expect(keyToBytes("Left")).toBe("\x1b[D");
    expect(keyToBytes("Tab")).toBe("\t");
  });

  test("digits and y/n are sent as their literal character", () => {
    for (const k of ["y", "n", "1", "2", "3", "4"] as const) expect(keyToBytes(k)).toBe(k);
  });
});

interface Recorder {
  writes: string[];
  texts: Array<[string, string]>;
  enters: string[];
  sleeps: number[];
  teams: string[];
}

function fakeDeps(): { deps: AnswerDeps; rec: Recorder } {
  const rec: Recorder = { writes: [], texts: [], enters: [], sleeps: [], teams: [] };
  const deps: AnswerDeps = {
    sendText: async (paneId, text) => {
      rec.texts.push([paneId, text]);
    },
    sendEnter: async (paneId) => {
      rec.enters.push(paneId);
    },
    withInput: async (teamId, fn) => {
      rec.teams.push(teamId);
      await fn((text) => rec.writes.push(text));
    },
    sleep: async (ms) => {
      rec.sleeps.push(ms);
    },
  };
  return { deps, rec };
}

function question(multiSelect = false): LeadQuestion {
  return {
    id: "q1",
    teamId: "w1:p1",
    kind: "ask",
    createdAt: 1,
    screenTail: "",
    questions: [
      {
        question: "Pick a color",
        options: [{ label: "Red" }, { label: "Blue" }, { label: "Green" }],
        multiSelect,
      },
    ],
  };
}

describe("answerQuestion", () => {
  test("option choice writes the 1-based digit through the terminal input", async () => {
    const { deps, rec } = fakeDeps();
    await answerQuestion(deps, question(), { kind: "options", choices: [1] });
    expect(rec.writes).toEqual(["2"]);
    expect(rec.teams).toEqual(["w1:p1"]);
  });

  test("multi-select is refused with the Vietnamese message and writes nothing", async () => {
    const { deps, rec } = fakeDeps();
    const err = await answerQuestion(deps, question(true), { kind: "options", choices: [0] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnswerError);
    expect((err as Error).message).toBe(MULTI_SELECT_MESSAGE);
    expect(rec.writes).toEqual([]);
  });

  test("out-of-range choice is rejected before anything is written", async () => {
    const { deps, rec } = fakeDeps();
    await expect(answerQuestion(deps, question(), { kind: "options", choices: [7] })).rejects.toThrow(/out of range/);
    expect(rec.writes).toEqual([]);
  });

  test("text answer goes through send_input, waits 500ms, then presses Enter", async () => {
    const { deps, rec } = fakeDeps();
    await answerQuestion(deps, question(), { kind: "text", text: "use the blue one" });
    expect(rec.texts).toEqual([["w1:p1", "use the blue one"]]);
    expect(rec.sleeps).toEqual([500]);
    expect(rec.enters).toEqual(["w1:p1"]);
  });

  test("keys answer writes each key's bytes in order", async () => {
    const { deps, rec } = fakeDeps();
    await answerQuestion(deps, question(), { kind: "keys", keys: ["Down", "Enter"] });
    expect(rec.writes).toEqual(["\x1b[B", "\r"]);
  });

  test("option sequence across two questions spaces writes 400ms apart", async () => {
    const { deps, rec } = fakeDeps();
    const two: LeadQuestion = {
      ...question(),
      questions: [
        { question: "A", options: [{ label: "a1" }, { label: "a2" }], multiSelect: false },
        { question: "B", options: [{ label: "b1" }, { label: "b2" }], multiSelect: false },
      ],
    };
    await answerQuestion(deps, two, { kind: "options", choices: [0, 1] });
    expect(rec.writes).toEqual(["1", "2"]);
    expect(rec.sleeps).toEqual([400]);
  });
});
