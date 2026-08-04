/**
 * Renderizador Markdown minimalista e seguro.
 *
 * Escapa o HTML de entrada ANTES de aplicar as transformações, evitando
 * injeção de marcação. Suporta: títulos, negrito, itálico, código (inline e
 * bloco), listas, citações, links, linha horizontal e parágrafos.
 */

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(text) {
  let out = text;
  // Código inline (protege o conteúdo interno de outras regras).
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  // Negrito e itálico.
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // Links [texto](url) — só http(s), evitando javascript:.
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => {
    return `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`;
  });
  return out;
}

/** Converte texto Markdown em HTML (string). */
export function renderMarkdown(src = "") {
  const lines = escapeHtml(src).replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let listType = null; // "ul" | "ol"
  let inCode = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw;

    // Bloco de código ``` ... ```
    if (/^\s*```/.test(line)) {
      if (inCode) {
        html.push("</code></pre>");
        inCode = false;
      } else {
        flushParagraph();
        closeList();
        html.push("<pre><code>");
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      html.push(`${line}\n`);
      continue;
    }

    // Linha em branco separa blocos.
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    // Linha horizontal.
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      closeList();
      html.push("<hr />");
      continue;
    }

    // Títulos.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      continue;
    }

    // Citação.
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }

    // Lista não ordenada.
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ul) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    // Lista ordenada.
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    // Texto comum acumula no parágrafo atual.
    closeList();
    paragraph.push(line.trim());
  }

  if (inCode) html.push("</code></pre>");
  flushParagraph();
  closeList();
  return html.join("\n");
}
