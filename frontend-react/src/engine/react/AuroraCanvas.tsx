/**
 * AuroraCanvas — fundo animado (WebGL) atrás de toda a interface.
 * Degrada silenciosamente se o WebGL não estiver disponível.
 */
import { useEffect, useRef } from "preact/hooks";
import { AuroraBackground } from "@/engine/aurora";

export function AuroraCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const aurora = new AuroraBackground(canvas);
    aurora.init();
    return () => aurora.dispose();
  }, []);

  return <canvas id="aurora" aria-hidden="true" ref={canvasRef} />;
}
