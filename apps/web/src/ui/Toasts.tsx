import { useOfficeStore } from "../store/officeStore";

export function Toasts() {
  const toasts = useOfficeStore((s) => s.toasts);
  const dismiss = useOfficeStore((s) => s.dismissToast);
  return (
    <div className="ui-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className="ui-toast" data-tone={t.tone} onClick={() => dismiss(t.id)}>
          {t.text}
        </button>
      ))}
    </div>
  );
}
