import { useCallback, useState } from "react";
import type { AnswerPayload } from "@studio/shared";
import { newRequestId, sendRequest } from "../net/requests";
import { useOfficeStore } from "../store/officeStore";

/** Sends question.answer; closes the dialog on ack, toasts the error otherwise. */
export function useAnswer(questionId: string) {
  const [pending, setPending] = useState(false);

  const submit = useCallback(
    async (answer: AnswerPayload) => {
      const store = useOfficeStore.getState();
      setPending(true);
      try {
        await sendRequest({ type: "question.answer", requestId: newRequestId(), questionId, answer });
        store.openQuestion(null);
        store.pushToast("ok", "Đã gửi ý kiến cho team");
      } catch (err) {
        store.pushToast("error", err instanceof Error ? err.message : "Gửi ý kiến thất bại");
        setPending(false);
      }
    },
    [questionId],
  );

  return { pending, submit };
}
