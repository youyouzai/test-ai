const FRONTMATTER_END = /^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/;

function stripYamlFrontmatter(md) {
  if (!md.startsWith("---")) return md;
  const m = md.match(FRONTMATTER_END);
  return m ? md.slice(m[0].length) : md;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal markdown → HTML for skill body (headings, lists, code, paragraphs). */
function simpleMarkdownToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  const codeBuf = [];

  function closeLists() {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  }

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (!inCode) {
        closeLists();
        inCode = true;
        codeBuf.length = 0;
      } else {
        inCode = false;
        out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    const h3 = line.match(/^###\s+(.+)$/);
    const h2 = line.match(/^##\s+(.+)$/);
    const h1 = line.match(/^#\s+(.+)$/);
    const ul = line.match(/^\s*[-*]\s+(.+)$/);
    const ol = line.match(/^\s*\d+\.\s+(.+)$/);

    if (h1) {
      closeLists();
      out.push(`<h1>${inlineMd(h1[1])}</h1>`);
      continue;
    }
    if (h2) {
      closeLists();
      out.push(`<h2>${inlineMd(h2[1])}</h2>`);
      continue;
    }
    if (h3) {
      closeLists();
      out.push(`<h3>${inlineMd(h3[1])}</h3>`);
      continue;
    }

    if (ul) {
      if (!inUl) {
        closeLists();
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inlineMd(ul[1])}</li>`);
      continue;
    }

    if (ol) {
      if (!inOl) {
        closeLists();
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${inlineMd(ol[1])}</li>`);
      continue;
    }

    if (line.trim() === "") {
      closeLists();
      continue;
    }

    closeLists();
    out.push(`<p>${inlineMd(line)}</p>`);
  }

  closeLists();
  return out.join("\n");
}

function inlineMd(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return s;
}

async function loadManifest() {
  const res = await fetch("data/manifest.json", { cache: "no-store" });
  if (!res.ok) throw new Error("无法加载 manifest");
  return res.json();
}

function uniqueCategories(skills) {
  return [...new Set(skills.map((s) => s.category))].sort();
}

function renderCards(skills, container, onOpen) {
  container.innerHTML = "";
  if (skills.length === 0) {
    const el = document.createElement("p");
    el.className = "empty";
    el.textContent = "没有匹配的技能，请调整筛选条件。";
    container.appendChild(el);
    return;
  }

  for (const s of skills) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card";
    btn.setAttribute("aria-label", `查看 ${s.id} 详情`);

    const cat = document.createElement("p");
    cat.className = "card-cat";
    cat.textContent = s.category;

    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = s.id;

    const desc = document.createElement("p");
    desc.className = "card-desc";
    desc.textContent = s.description;

    const tags = document.createElement("div");
    tags.className = "card-tags";
    for (const t of s.tags) {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = t;
      tags.appendChild(span);
    }

    const source = document.createElement("div");
    source.className = "card-source";
    source.textContent = `来源：${s.source}`;

    btn.append(cat, title, desc, tags, source);
    btn.addEventListener("click", () => onOpen(s));
    container.appendChild(btn);
  }
}

async function openSkill(s, modal, titleEl, metaEl, bodyEl) {
  titleEl.textContent = s.id;
  metaEl.innerHTML = `${escapeHtml(s.description)}<br /><a href="${escapeHtml(
    s.sourceUrl
  )}" target="_blank" rel="noopener">在 GitHub 上查看上游目录 ↗</a>`;

  const path = `skills/${s.folder}/SKILL.md`;
  bodyEl.innerHTML = "<p>加载中…</p>";
  modal.showModal();

  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.text();
    const body = stripYamlFrontmatter(raw);
    bodyEl.innerHTML = simpleMarkdownToHtml(body.trim());
  } catch (e) {
    bodyEl.innerHTML = `<p class="error">无法读取 <code>${escapeHtml(path)}</code>。请确认通过 HTTP 服务打开站点（不要直接用 file:// 打开），且 skills 目录位于项目根目录。</p>`;
  }
}

async function main() {
  const data = await loadManifest();
  document.getElementById("page-title").textContent = data.title;
  document.getElementById("page-subtitle").textContent = data.subtitle;
  document.title = data.title;

  const skills = data.skills;
  const catSelect = document.getElementById("filter-cat");
  const qInput = document.getElementById("filter-q");
  const grid = document.getElementById("skill-cards");

  for (const c of uniqueCategories(skills)) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    catSelect.appendChild(opt);
  }

  const modal = document.getElementById("detail-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalMeta = document.getElementById("modal-meta");
  const modalBody = document.getElementById("modal-body");
  const modalClose = document.getElementById("modal-close");

  function filterList() {
    const cat = catSelect.value;
    const q = qInput.value.trim().toLowerCase();
    return skills.filter((s) => {
      if (cat && s.category !== cat) return false;
      if (!q) return true;
      const hay = `${s.id} ${s.category} ${s.description} ${s.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function refresh() {
    renderCards(filterList(), grid, (s) => openSkill(s, modal, modalTitle, modalMeta, modalBody));
  }

  catSelect.addEventListener("change", refresh);
  qInput.addEventListener("input", refresh);
  modalClose.addEventListener("click", () => modal.close());
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) modal.close();
  });

  refresh();
}

main().catch((err) => {
  console.error(err);
  document.getElementById("skill-cards").innerHTML = `<p class="empty">加载失败：${escapeHtml(
    String(err.message)
  )}</p>`;
});
