import { useState, type FormEvent } from "react";
import { newRequestId, sendRequest } from "../net/requests";
import { useOfficeStore } from "../store/officeStore";

/** "Giao việc cho lead": the server delivers it via agent.prompt, not typed into the pty. */
export function PromptBar({ teamId }: { teamId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const pushToast = useOfficeStore((s) => s.pushToast);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await sendRequest({ type: "team.prompt", requestId: newRequestId(), teamId, text: trimmed });
      pushToast("ok", "Đã giao việc cho lead");
      setText("");
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Giao việc thất bại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="term-prompt" onSubmit={(e) => void submit(e)}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Giao việc cho lead…"
        aria-label="Giao việc cho lead"
        disabled={busy}
      />
      <button type="submit" disabled={busy || text.trim() === ""}>
        {busy ? "Đang gửi…" : "Gửi"}
      </button>
    </form>
  );
}
