import type { AskQuestion } from "@studio/shared";
import { hasMultiSelect } from "./helpers";

interface Props {
  questions: AskQuestion[];
  picks: Record<number, number>;
  disabled: boolean;
  onPick: (question: number, option: number) => void;
}

/** Structured AskUserQuestion content: header chip, question text and option buttons. */
export function AskBody({ questions, picks, disabled, onPick }: Props) {
  return (
    <div className="ui-ask">
      {hasMultiSelect(questions) && (
        <p className="ui-note">Câu hỏi chọn nhiều, mở terminal để trả lời.</p>
      )}
      {questions.map((q, qi) => (
        <section key={qi} className="ui-ask-q">
          {q.header && <span className="ui-chip">{q.header}</span>}
          <p className="ui-ask-text">{q.question}</p>
          <div className="ui-options">
            {q.options.map((opt, oi) => (
              <button
                key={oi}
                type="button"
                className="ui-option"
                data-picked={picks[qi] === oi}
                disabled={disabled || q.multiSelect === true}
                onClick={() => onPick(qi, oi)}
              >
                <span className="ui-option-key">{oi + 1}</span>
                <span className="ui-option-body">
                  <strong>{opt.label}</strong>
                  {opt.description && <small>{opt.description}</small>}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
