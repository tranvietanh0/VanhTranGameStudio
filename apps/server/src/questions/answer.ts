import type { AnswerPayload, LeadQuestion, TerminalKey } from "@studio/shared";
import { keyToBytes } from "./keys.ts";

export class AnswerError extends Error {}

export const MULTI_SELECT_MESSAGE = "Mở terminal để trả lời câu hỏi chọn nhiều";

export interface AnswerDeps {
  /** Writes a line of text to the pane's prompt (pane.send_input). */
  sendText: (paneId: string, text: string) => Promise<void>;
  /** Presses Enter in the pane (pane.send_keys ["Enter"]). */
  sendEnter: (paneId: string) => Promise<void>;
  /** Runs fn with a byte writer for the team's terminal (live stream or transient control). */
  withInput: (teamId: string, fn: (write: (text: string) => void) => Promise<void>) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
}

export const OPTION_GAP_MS = 400;
export const TEXT_ENTER_DELAY_MS = 500;
export const KEY_GAP_MS = 120;
const MAX_TEXT_LENGTH = 4000;

/** Delivers the CEO's answer to the lead's pane. Throws AnswerError on a request that cannot be delivered. */
export async function answerQuestion(deps: AnswerDeps, question: LeadQuestion, answer: AnswerPayload): Promise<void> {
  switch (answer.kind) {
    case "options":
      return answerOptions(deps, question, answer.choices);
    case "text":
      return answerText(deps, question.teamId, answer.text);
    case "keys":
      return answerKeys(deps, question.teamId, answer.keys);
    default:
      throw new AnswerError(`unknown answer kind ${JSON.stringify((answer as { kind?: unknown }).kind)}`);
  }
}

async function answerOptions(deps: AnswerDeps, question: LeadQuestion, choices: number[]): Promise<void> {
  if (question.questions.some((q) => q.multiSelect)) throw new AnswerError(MULTI_SELECT_MESSAGE);
  if (question.questions.length === 0) throw new AnswerError("this request has no options; answer with keys or text");
  if (choices.length !== question.questions.length) {
    throw new AnswerError(`expected ${question.questions.length} choice(s), got ${choices.length}`);
  }
  const digits = choices.map((choice, i) => {
    const option = question.questions[i]?.options[choice];
    if (option === undefined) throw new AnswerError(`choice ${choice} is out of range for question ${i + 1}`);
    if (choice + 1 > 9) throw new AnswerError("only options 1-9 can be picked with a digit key");
    return String(choice + 1);
  });
  await deps.withInput(question.teamId, async (write) => {
    for (let i = 0; i < digits.length; i++) {
      write(digits[i] ?? "");
      if (i < digits.length - 1) await deps.sleep(OPTION_GAP_MS);
    }
  });
}

async function answerText(deps: AnswerDeps, paneId: string, text: string): Promise<void> {
  if (text.trim() === "") throw new AnswerError("text answer is empty");
  if (text.length > MAX_TEXT_LENGTH) throw new AnswerError(`text answer exceeds ${MAX_TEXT_LENGTH} characters`);
  await deps.sendText(paneId, text);
  await deps.sleep(TEXT_ENTER_DELAY_MS);
  await deps.sendEnter(paneId);
}

async function answerKeys(deps: AnswerDeps, teamId: string, keys: TerminalKey[]): Promise<void> {
  if (keys.length === 0) throw new AnswerError("keys answer is empty");
  const sequence = keys.map((key) => keyToBytes(key));
  await deps.withInput(teamId, async (write) => {
    for (let i = 0; i < sequence.length; i++) {
      write(sequence[i] ?? "");
      if (i < sequence.length - 1) await deps.sleep(KEY_GAP_MS);
    }
  });
}
