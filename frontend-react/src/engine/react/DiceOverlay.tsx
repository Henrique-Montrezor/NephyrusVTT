/**
 * DiceOverlay — monta o motor 3D de dados (Three.js) sobre a mesa e o entrega
 * via onReady para os controllers dispararem `roll()`.
 */
import { useEffect, useRef } from "preact/hooks";
import { DiceEngine } from "@/engine/dice-engine";

export interface DiceOverlayProps {
  onReady?: (engine: DiceEngine) => void;
}

export function DiceOverlay({ onReady }: DiceOverlayProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let engine: DiceEngine | null = null;
    let disposed = false;

    const boot = async () => {
      const e = new DiceEngine(mount);
      await e.init();
      if (disposed) {
        e.dispose();
        return;
      }
      engine = e;
      onReady?.(e);
    };
    void boot();

    return () => {
      disposed = true;
      engine?.dispose();
    };
  }, []);

  return <div id="dice-overlay" class="dice-overlay" ref={mountRef} />;
}
