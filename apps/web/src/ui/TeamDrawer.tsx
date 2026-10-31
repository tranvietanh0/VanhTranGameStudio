import { useState } from "react";
import { useOfficeStore } from "../store/officeStore";
import { initials, sortedTeams, statusLabel, teamColor } from "./helpers";

/** Mobile bottom drawer listing team cards. */
export function TeamDrawer() {
  const teams = useOfficeStore((s) => s.teams);
  const questions = useOfficeStore((s) => s.questions);
  const selectedTeamId = useOfficeStore((s) => s.selectedTeamId);
  const selectTeam = useOfficeStore((s) => s.selectTeam);
  const openTerminal = useOfficeStore((s) => s.openTerminal);
  const openQuestion = useOfficeStore((s) => s.openQuestion);
  const [open, setOpen] = useState(false);
  const list = sortedTeams(teams);

  const questionOf = (teamId: string) =>
    Object.values(questions)
      .filter((q) => q.teamId === teamId)
      .sort((a, b) => b.createdAt - a.createdAt)[0];

  return (
    <section className="ui-widget ui-drawer" data-open={open} aria-label="Các team">
      <button type="button" className="ui-drawer-handle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="ui-drawer-grip" />
        <span>Các team ({list.length})</span>
      </button>
      {open && (
        <ul className="ui-drawer-list">
          {list.length === 0 && <li className="ui-muted">Chưa có team nào</li>}
          {list.map((team) => {
            const q = questionOf(team.id);
            return (
              <li key={team.id} className="ui-team-card" data-selected={team.id === selectedTeamId}>
                <button type="button" className="ui-team-main" onClick={() => selectTeam(team.id)}>
                  <span className="ui-avatar ui-avatar-sm" style={{ background: teamColor(team.id) }}>
                    {initials(team.projectName)}
                  </span>
                  <span className="ui-team-name">{team.projectName}</span>
                  <span className="ui-status-tag" data-status={team.status}>
                    <i className="ui-dot-s" />
                    {statusLabel(team.status)}
                  </span>
                </button>
                <div className="ui-team-actions">
                  {q && (
                    <button
                      type="button"
                      className="ui-btn ui-btn-primary"
                      onClick={() => {
                        selectTeam(team.id);
                        openQuestion(q.id);
                      }}
                    >
                      Trả lời
                    </button>
                  )}
                  <button
                    type="button"
                    className="ui-btn"
                    onClick={() => {
                      selectTeam(team.id);
                      openTerminal(team.id);
                    }}
                  >
                    Mở terminal
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
