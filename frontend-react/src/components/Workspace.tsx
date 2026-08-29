import { TableStage } from "@/engine/react/TableStage";
import { DiceOverlay } from "@/engine/react/DiceOverlay";
import { ToolDock } from "./ToolDock";
import { FogPanel } from "@/features/fog/FogPanel";
import { TurnPanel } from "@/features/turn/TurnPanel";
import { RailBar } from "./RailBar";
import { Dock } from "./Dock";
import { registerDiceEngine, registerTableEngine } from "@/session";
import { openPanel } from "@/state/ui-store";
import { identity } from "@/state/identity";
import { CharacterTray } from "./CharacterTray";

export function Workspace() {
  const panel = openPanel.value;
  return (
    <div class="workspace" data-role={identity.value.isGm ? "gm" : "player"}>
      <main class="tabletop">
        <TableStage onReady={(engine, input) => registerTableEngine(engine, input)} />
        <DiceOverlay onReady={(engine) => registerDiceEngine(engine)} />
        <ToolDock />
        {panel === "fog" && <FogPanel />}
        {panel === "turn" && <TurnPanel />}
        {!identity.value.isGm && <CharacterTray />}
      </main>
      <RailBar />
      <Dock />
    </div>
  );
}
