import { useEffect, useMemo } from "react";
import { useOfficeStore } from "../store/officeStore";
import { askingByTeam } from "./asking";
import { Bubbles } from "./Bubbles";
import { CameraRig } from "./CameraRig";
import { Ceo } from "./Ceo";
import { DeskOverlays } from "./DeskOverlays";
import { Desks } from "./Desks";
import { buildOfficeLayout } from "./layout";
import { Leads } from "./Leads";
import { Room } from "./Room";
import { setWalkGrid } from "./runtime";
import { Shadows } from "./Shadows";
import { PulseTicker, SceneWake } from "./Wake";

/** Scene graph root inside the Canvas: derives layout + asking leads from the store once. */
export function Office() {
  const teamMap = useOfficeStore((s) => s.teams);
  const questions = useOfficeStore((s) => s.questions);

  const teams = useMemo(() => Object.values(teamMap).sort((a, b) => a.slot - b.slot), [teamMap]);
  const slotKey = teams.map((t) => t.slot).join(",");
  const layout = useMemo(() => buildOfficeLayout(slotKey ? slotKey.split(",").map(Number) : []), [slotKey]);
  const asking = useMemo(() => askingByTeam(teams, questions), [teams, questions]);

  useEffect(() => setWalkGrid(layout.grid), [layout]);

  return (
    <>
      <SceneWake />
      <PulseTicker active={asking.size > 0} />
      <hemisphereLight args={["#fff4e2", "#c8b195", 1.9]} />
      <directionalLight position={[-6, 14, 9]} intensity={1.6} color="#fff1dc" />
      <Room layout={layout} />
      <Shadows layout={layout} teams={teams} />
      <Desks teams={teams} />
      <Leads teams={teams} asking={asking} />
      <Ceo />
      <Bubbles teams={teams} asking={asking} />
      <DeskOverlays teams={teams} />
      <CameraRig />
    </>
  );
}
