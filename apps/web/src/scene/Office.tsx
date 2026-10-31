import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOfficeStore } from "../store/officeStore";
import { askingByTeam } from "./asking";
import { Bubbles } from "./Bubbles";
import { CameraRig } from "./CameraRig";
import { Ceo } from "./Ceo";
import { Crowd } from "./crowd/Crowd";
import { DeskOverlays } from "./DeskOverlays";
import { Desks } from "./Desks";
import { buildOfficeLayout } from "./layout";
import { Lights } from "./Lights";
import { assignAllSeats, type SeatAssignment } from "./members";
import { Nameplates } from "./Nameplates";
import { Room } from "./Room";
import { setWalkGrid } from "./runtime";
import { SceneWake } from "./Wake";

/** Scene graph root inside the Canvas: derives layout, seats and asking leads from the store. */
export function Office() {
  const teamMap = useOfficeStore((s) => s.teams);
  const questions = useOfficeStore((s) => s.questions);

  const teams = useMemo(() => Object.values(teamMap).sort((a, b) => a.slot - b.slot), [teamMap]);
  const slotKey = teams.map((t) => t.slot).join(",");
  const slots = useMemo(() => (slotKey ? slotKey.split(",").map(Number) : []), [slotKey]);
  const layout = useMemo(() => buildOfficeLayout(slots), [slots]);
  const asking = useMemo(() => askingByTeam(teams, questions), [teams, questions]);

  // Members keep their seat across updates: assignment depends on the previous one.
  const prevSeats = useRef(new Map<string, SeatAssignment>());
  const seats = useMemo(() => {
    const next = assignAllSeats(prevSeats.current, teams);
    prevSeats.current = next;
    return next;
  }, [teams]);

  const [shadowVersion, setShadowVersion] = useState(0);
  const onRebuilt = useCallback(() => setShadowVersion((v) => v + 1), []);

  useEffect(() => setWalkGrid(layout.grid), [layout]);

  return (
    <>
      <SceneWake />
      <Lights width={layout.width} depth={layout.depth} shadowVersion={shadowVersion} />
      <Ceo />
      <Suspense fallback={null}>
        <Room layout={layout} slots={slots} onRebuilt={onRebuilt} />
        <Desks teams={teams} seats={seats} />
        <Crowd teams={teams} asking={asking} seats={seats} grid={layout.grid} />
        <Nameplates asking={asking} />
      </Suspense>
      <Bubbles teams={teams} asking={asking} />
      <DeskOverlays teams={teams} asking={asking} />
      <CameraRig />
    </>
  );
}
