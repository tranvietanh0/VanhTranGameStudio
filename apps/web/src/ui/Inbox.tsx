import { useMemo, useState } from "react";
import { useOfficeStore } from "../store/officeStore";
import { initials, shortQuestion, sortPending, teamColor } from "./helpers";

export function Inbox({ mobile }: { mobile: boolean }) {
  const questions = useOfficeStore((s) => s.questions);
  const teams = useOfficeStore((s) => s.teams);
  const selectTeam = useOfficeStore((s) => s.selectTeam);
  const openQuestion = useOfficeStore((s) => s.openQuestion);
  const [collapsed, setCollapsed] = useState(true);
  const pending = useMemo(() => sortPending(questions), [questions]);
  const open = !mobile || !collapsed;

  return (
    <aside className="ui-widget ui-inbox" aria-label="Hộp thư chờ duyệt">
      <button
        type="button"
        className="ui-inbox-head"
        onClick={() => mobile && setCollapsed((c) => !c)}
        aria-expanded={open}
      >
        <span>Đang chờ sếp duyệt</span>
        <span className="ui-badge" data-empty={pending.length === 0}>{pending.length}</span>
      </button>
      {open && (
        <ul className="ui-inbox-list">
          {pending.length === 0 && <li className="ui-muted">Chưa có ai cần ý kiến sếp</li>}
          {pending.map((q) => {
            const name = teams[q.teamId]?.projectName ?? q.teamId;
            return (
              <li key={q.id}>
                <button
                  type="button"
                  className="ui-inbox-row"
                  onClick={() => {
                    selectTeam(q.teamId);
                    openQuestion(q.id);
                  }}
                >
                  <span className="ui-avatar ui-avatar-sm" style={{ background: teamColor(q.teamId) }}>
                    {initials(name)}
                  </span>
                  <span className="ui-inbox-text">
                    <strong>{name}</strong>
                    <span>{shortQuestion(q)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
