import { useEffect, useRef, useState } from "preact/hooks";
import { chatLog } from "@/state/ui-store";
import { sendChat } from "@/session";

export function ChatPane() {
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const entries = chatLog.value;

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  const submit = (e: Event) => {
    e.preventDefault();
    sendChat(text);
    setText("");
  };

  return (
    <section class="tab-pane chat-pane active">
      <div class="log" ref={logRef} aria-live="polite">
        {entries.map((entry) => (
          <div key={entry.id} class={`log-line log-${entry.kind}`}>
            {entry.kind === "chat" ? <strong>{entry.author}: </strong> : null}
            {entry.text}
          </div>
        ))}
      </div>
      <form class="chat-form" autocomplete="off" onSubmit={submit}>
        <input
          type="text"
          placeholder="Escreva uma mensagem…"
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
        />
        <button type="submit" class="btn-primary btn-icon" aria-label="Enviar">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 12 L20 4 L14 20 L11 13 Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
          </svg>
        </button>
      </form>
    </section>
  );
}
