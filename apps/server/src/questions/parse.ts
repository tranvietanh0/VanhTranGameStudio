import type { AskQuestion } from "@studio/shared";
import { isRecord } from "../herdr/errors.ts";

/**
 * Validates `tool_input.questions` from a PreToolUse(AskUserQuestion) hook payload.
 * Returns null when the shape is wrong; the caller logs it, nothing is guessed.
 */
export function parseAskQuestions(toolInput: unknown): AskQuestion[] | null {
  if (!isRecord(toolInput) || !Array.isArray(toolInput.questions)) return null;
  const out: AskQuestion[] = [];
  for (const raw of toolInput.questions) {
    if (!isRecord(raw) || typeof raw.question !== "string" || raw.question === "") return null;
    if (!Array.isArray(raw.options) || raw.options.length === 0) return null;
    const options = [];
    for (const option of raw.options) {
      if (!isRecord(option) || typeof option.label !== "string") return null;
      options.push({
        label: option.label,
        ...(typeof option.description === "string" ? { description: option.description } : {}),
      });
    }
    out.push({
      question: raw.question,
      ...(typeof raw.header === "string" ? { header: raw.header } : {}),
      options,
      multiSelect: raw.multiSelect === true,
    });
  }
  return out.length > 0 ? out : null;
}
