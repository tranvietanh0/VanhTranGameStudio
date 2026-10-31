// @ts-ignore bun:test types are not in this package's tsconfig; bun resolves it at runtime.
import { describe, expect, test } from "bun:test";
import type { AskQuestion, LeadQuestion } from "@studio/shared";
import {
  allAnswered, buildKeysAnswer, buildOptionsAnswer, buildTextAnswer, hasMultiSelect,
  initials, pickByDigit, shortQuestion, sortPending, statusLabel, teamHue,
} from "./helpers";

const q = (multi = false, n = 3): AskQuestion => ({
  question: "Chọn?",
  multiSelect: multi,
  options: Array.from({ length: n }, (_, i) => ({ label: `o${i}` })),
});

const lead = (id: string, createdAt: number, questions: AskQuestion[] = [q()]): LeadQuestion => ({
  id, teamId: "w1:p1", kind: "ask", questions, screenTail: "", createdAt,
});

describe("statusLabel", () => {
  test("maps every status to Vietnamese", () => {
    expect(statusLabel("working")).toBe("Đang làm");
    expect(statusLabel("idle")).toBe("Rảnh");
    expect(statusLabel("blocked")).toBe("Cần sếp");
    expect(statusLabel("done")).toBe("Xong");
    expect(statusLabel("unknown")).toBe("Không rõ");
  });
});

describe("buildOptionsAnswer", () => {
  test("one choice per question in order", () => {
    expect(buildOptionsAnswer([q(), q()], { 0: 2, 1: 0 })).toEqual({ kind: "options", choices: [2, 0] });
  });
  test("null while a question is unanswered", () => {
    expect(buildOptionsAnswer([q(), q()], { 0: 1 })).toBeNull();
  });
  test("null when multiSelect present", () => {
    expect(hasMultiSelect([q(), q(true)])).toBe(true);
    expect(buildOptionsAnswer([q(true)], { 0: 0 })).toBeNull();
  });
  test("allAnswered false for no questions", () => {
    expect(allAnswered([], {})).toBe(false);
  });
});

describe("other answers", () => {
  test("text trims and rejects empty", () => {
    expect(buildTextAnswer("  hi ")).toEqual({ kind: "text", text: "hi" });
    expect(buildTextAnswer("   ")).toBeNull();
  });
  test("keys", () => {
    expect(buildKeysAnswer(["Escape"])).toEqual({ kind: "keys", keys: ["Escape"] });
  });
});

describe("pickByDigit", () => {
  test("targets first unanswered question", () => {
    expect(pickByDigit([q(), q()], { 0: 1 }, 2)).toEqual({ question: 1, option: 1 });
  });
  test("ignores out-of-range digits and multiSelect", () => {
    expect(pickByDigit([q()], {}, 4)).toBeNull();
    expect(pickByDigit([q()], {}, 0)).toBeNull();
    expect(pickByDigit([q(true)], {}, 1)).toBeNull();
  });
});

describe("misc", () => {
  test("sortPending newest first", () => {
    const list = sortPending({ a: lead("a", 1), b: lead("b", 3), c: lead("c", 2) });
    expect(list.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
  test("shortQuestion truncates", () => {
    const long = lead("x", 1, [{ question: "a".repeat(100), options: [] }]);
    expect(shortQuestion(long, 10)).toBe(`${"a".repeat(9)}…`);
  });
  test("initials and hue are stable", () => {
    expect(initials("my-cool_game")).toBe("MC");
    expect(initials("game")).toBe("GA");
    expect(teamHue("w1:p1")).toBe(teamHue("w1:p1"));
    expect(teamHue("w1:p1")).toBeLessThan(360);
  });
});
