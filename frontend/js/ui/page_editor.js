/**
 * Editor de páginas exibido no painel lateral (file-viewer).
 *
 * Alterna entre visualização (Markdown renderizado) e edição (título +
 * textarea com pré-visualização). Persiste via callback `onSave`.
 */
import { renderMarkdown } from "./markdown.js";
import { ICONS, svgMarkup } from "./token_icons.js";

/**
 * Monta o editor dentro de `container`.
 * @param {object} page  { id, title, content, ... }
 * @param {object} opts  { container, titleEl, canEdit, onSave, startInEdit }
 *   onSave(patch) → Promise<page>
 */
export function mountPageEditor(page, opts) {
  const { container, titleEl, canEdit = false, onSave, startInEdit = false } = opts;
  let current = { ...page };

  const setTitle = (t) => {
    if (titleEl) titleEl.textContent = t;
  };

  function renderView() {
    setTitle(current.title);
    container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "page-view";

    if (canEdit) {
      const bar = document.createElement("div");
      bar.className = "page-toolbar";
      const editBtn = document.createElement("button");
      editBtn.className = "btn-ghost btn-mini";
      editBtn.innerHTML = `${svgMarkup(ICONS.rename, 15)}<span>Editar</span>`;
      editBtn.addEventListener("click", renderEdit);
      bar.appendChild(editBtn);
      wrap.appendChild(bar);
    }

    const body = document.createElement("div");
    body.className = "page-rendered";
    const html = renderMarkdown(current.content || "");
    body.innerHTML = html || '<p class="page-empty">Página vazia.</p>';
    wrap.appendChild(body);
    container.appendChild(wrap);
  }

  function renderEdit() {
    setTitle(current.title);
    container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "page-edit";

    const bar = document.createElement("div");
    bar.className = "page-toolbar";

    const titleInput = document.createElement("input");
    titleInput.className = "page-title-input";
    titleInput.type = "text";
    titleInput.value = current.title;
    titleInput.placeholder = "Título da página";

    const previewBtn = document.createElement("button");
    previewBtn.className = "btn-ghost btn-mini";
    previewBtn.type = "button";

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn-primary btn-mini";
    saveBtn.type = "button";
    saveBtn.innerHTML = `${svgMarkup(ICONS.reveal, 15)}<span>Salvar</span>`;

    bar.append(titleInput, previewBtn, saveBtn);

    const textarea = document.createElement("textarea");
    textarea.className = "page-textarea";
    textarea.value = current.content || "";
    textarea.spellcheck = false;
    textarea.placeholder =
      "Escreva em Markdown…\n\n# Título\n**negrito**  *itálico*  `código`\n- lista\n> citação\n[link](https://...)";

    const preview = document.createElement("div");
    preview.className = "page-rendered";
    preview.hidden = true;

    let previewing = false;
    const setPreview = (on) => {
      previewing = on;
      preview.hidden = !on;
      textarea.hidden = on;
      previewBtn.innerHTML = on
        ? `${svgMarkup(ICONS.rename, 15)}<span>Editar</span>`
        : `${svgMarkup(ICONS.open, 15)}<span>Pré-visualizar</span>`;
      if (on) preview.innerHTML = renderMarkdown(textarea.value) || '<p class="page-empty">Vazio.</p>';
    };
    setPreview(false);
    previewBtn.addEventListener("click", () => setPreview(!previewing));

    saveBtn.addEventListener("click", async () => {
      const patch = { title: titleInput.value.trim() || "Sem título", content: textarea.value };
      saveBtn.disabled = true;
      try {
        const updated = (await onSave?.(patch)) || { ...current, ...patch };
        current = { ...current, ...updated };
        renderView();
      } catch (err) {
        saveBtn.disabled = false;
        const warn = document.createElement("div");
        warn.className = "page-error";
        warn.textContent = `Erro ao salvar: ${err.message}`;
        bar.after(warn);
      }
    });

    wrap.append(bar, textarea, preview);
    container.appendChild(wrap);
    titleInput.focus();
  }

  if (startInEdit && canEdit) renderEdit();
  else renderView();
}
