import { useOfficeStore } from "../store/officeStore";
import { CONNECTION_LABEL } from "./helpers";

export function StatusPill() {
  const connection = useOfficeStore((s) => s.connection);
  const herdr = useOfficeStore((s) => s.herdrConnected);
  const teamCount = useOfficeStore((s) => Object.keys(s.teams).length);
  const ok = connection === "open" || connection === "mock";
  return (
    <div className="ui-widget ui-status" role="status">
      <span className="ui-dot" data-on={ok} />
      <span>{CONNECTION_LABEL[connection]}</span>
      <span className="ui-sep" />
      <span className="ui-dot" data-on={herdr} />
      <span>herdr {herdr ? "đã nối" : "chưa nối"}</span>
      <span className="ui-sep" />
      <span>{teamCount} team</span>
    </div>
  );
}
