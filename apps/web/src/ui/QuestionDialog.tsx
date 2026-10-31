import { useEffect, useState } from "react";
import type { AnswerPayload } from "@studio/shared";
import { useOfficeStore } from "../store/officeStore";
import { AskBody } from "./AskBody";
import {
  buildKeysAnswer, buildOptionsAnswer, buildTextAnswer, initials, pickByDigit, teamColor,
} from "./helpers";
import { useAnswer } from "./useAnswer";

export function QuestionDialog({ questionId }: { questionId: string }) {
  const question = useOfficeStore((s) => s.questions[questionId]);
  const team = useOfficeStore((s) => (question ? s.teams[question.teamId] : undefined));
  const openQuestion = useOfficeStore((s) => s.openQuestion);
  const openTerminal = useOfficeStore((s) => s.openTerminal);
  const { pending, submit } = useAnswer(questionId);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [text, setText] = useState("");

  const close = () => openQuestion(null);
  const questions = question?.questions ?? [];
  const isAsk = question?.kind === "ask";

  const pick = (qi: number, oi: number) => {
    const next = { ...picks, [qi]: oi };
    setPicks(next);
    const answer = buildOptionsAnswer(questions, next);
    if (answer) void submit(answer);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      if (!isAsk || pending || !/^[1-9]$/.test(e.key)) return;
      const hit = pickByDigit(questions, picks, Number(e.key));
      if (hit) pick(hit.question, hit.option);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!question) return null;
  const name = team?.projectName ?? question.teamId;
  const send = (answer: AnswerPayload | null) => answer && void submit(answer);

  return (
    <div className="ui-backdrop" onClick={close}>
      <div className="ui-widget ui-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="ui-dialog-head">
          <span className="ui-avatar" style={{ background: teamColor(question.teamId) }}>{initials(name)}</span>
          <h2>Team {name} xin ý kiến sếp</h2>
          <button type="button" className="ui-close" onClick={close} aria-label="Đóng">×</button>
        </header>

        {isAsk ? (
          <AskBody questions={questions} picks={picks} disabled={pending} onPick={pick} />
        ) : (
          <div className="ui-blocked">
            <p className="ui-note">Team đang chờ ở terminal. Màn hình hiện tại:</p>
            <pre className="ui-screen">{question.screenTail || "(chưa đọc được màn hình)"}</pre>
            <div className="ui-row">
              <button type="button" className="ui-btn ui-btn-primary" disabled={pending} onClick={() => send(buildKeysAnswer(["Enter"]))}>
                Đồng ý (Enter)
              </button>
              <button type="button" className="ui-btn" disabled={pending} onClick={() => send(buildKeysAnswer(["Down"]))}>
                Chọn mục dưới (↓)
              </button>
              <button type="button" className="ui-btn ui-btn-danger" disabled={pending} onClick={() => send(buildKeysAnswer(["Escape"]))}>
                Huỷ (Esc)
              </button>
            </div>
          </div>
        )}

        {isAsk && (
          <label className="ui-other">
            <span>Ý kiến khác</span>
            <textarea
              rows={2}
              value={text}
              placeholder="Gõ ý kiến của sếp…"
              disabled={pending}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={pending || !buildTextAnswer(text)}
              onClick={() => send(buildTextAnswer(text))}
            >
              Gửi ý kiến
            </button>
          </label>
        )}

        <footer className="ui-dialog-foot">
          <button
            type="button"
            className="ui-btn"
            onClick={() => {
              openTerminal(question.teamId);
              close();
            }}
          >
            Mở terminal
          </button>
        </footer>
      </div>
    </div>
  );
}
