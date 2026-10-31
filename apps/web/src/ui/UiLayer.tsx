import { useOfficeStore } from "../store/officeStore";
import { AddTeamModal } from "./AddTeamModal";
import { Inbox } from "./Inbox";
import { QuestionDialog } from "./QuestionDialog";
import { StatusPill } from "./StatusPill";
import { TeamDrawer } from "./TeamDrawer";
import { Toasts } from "./Toasts";
import { useIsMobile } from "./useIsMobile";
import "./ui.css";
import "./uiDialog.css";
import "./uiDrawer.css";

/** Full-screen DOM overlay. Only its widgets take pointer events; the 3D canvas below stays clickable. */
export function UiLayer() {
  const mobile = useIsMobile();
  const activeQuestionId = useOfficeStore((s) => s.activeQuestionId);
  const addTeamOpen = useOfficeStore((s) => s.addTeamOpen);
  const setAddTeamOpen = useOfficeStore((s) => s.setAddTeamOpen);

  return (
    <div className="ui-layer" data-mobile={mobile}>
      <StatusPill />
      <Inbox mobile={mobile} />
      <button type="button" className="ui-btn ui-btn-primary ui-add-team" onClick={() => setAddTeamOpen(true)}>
        + Thêm team
      </button>
      {mobile && <TeamDrawer />}
      {activeQuestionId && <QuestionDialog key={activeQuestionId} questionId={activeQuestionId} />}
      {addTeamOpen && <AddTeamModal />}
      <Toasts />
    </div>
  );
}
