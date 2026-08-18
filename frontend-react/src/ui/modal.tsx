/**
 * Modal genérico dirigido por signal. `openModal({...})` empilha um modal;
 * <ModalHost /> deve estar montado uma vez na raiz. Fecha no X, fora ou Esc.
 * Porta modal.js para Preact (body agora é um VNode).
 */
import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { ComponentChildren, VNode } from "preact";

export interface ModalAction {
  label: string;
  primary?: boolean;
  onClick?: (close: () => void) => void;
}

export interface ModalOptions {
  title?: string;
  body?: ComponentChildren;
  actions?: ModalAction[];
  onClose?: () => void;
}

interface ModalInstance extends ModalOptions {
  id: number;
}

const stack = signal<ModalInstance[]>([]);
let seq = 0;

export function openModal(options: ModalOptions): { close: () => void } {
  const id = ++seq;
  stack.value = [...stack.value, { ...options, id }];
  const close = () => closeModal(id);
  return { close };
}

function closeModal(id: number): void {
  const inst = stack.value.find((m) => m.id === id);
  if (!inst) return;
  stack.value = stack.value.filter((m) => m.id !== id);
  inst.onClose?.();
}

function ModalView({ inst }: { inst: ModalInstance }): VNode {
  const close = () => closeModal(inst.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [inst.id]);

  return (
    <div
      class="modal-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div class="modal-box">
        <div class="modal-head">
          <h3>{inst.title}</h3>
          <button class="modal-close" type="button" aria-label="Fechar" onClick={close}>
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <div class="modal-body">{inst.body}</div>
        {inst.actions && inst.actions.length > 0 && (
          <div class="modal-foot">
            {inst.actions.map((a, i) => (
              <button
                key={i}
                type="button"
                class={a.primary ? "btn-primary" : "btn-ghost"}
                onClick={() => (a.onClick ? a.onClick(close) : close())}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ModalHost() {
  return (
    <>
      {stack.value.map((inst) => (
        <ModalView key={inst.id} inst={inst} />
      ))}
    </>
  );
}
