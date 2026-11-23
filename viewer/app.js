(function () {
  "use strict";

  const DATA = window.CURRICULUM_DATA;
  const STORAGE_KEY = "boki1kyu_study_state_v1";

  const state = loadState();
  let navMode = "part"; // "part" | "line"
  let studioMode = "reader"; // "reader" | "drill" | "sim" | "analytics" | "cheat"
  let currentDocId = null;
  let timerInterval = null;
  let timerSeconds = 25 * 60;
  let timerCountdown = true;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Object.assign({
          checks: {},
          reviews: {},
          notes: {},
          srs: {},
          pinnedCheats: [],
          theme: "light",
          focusCore: false,
          lastDocId: "G-00"
        }, parsed);
      }
    } catch (e) {}
    return { checks: {}, reviews: {}, notes: {}, srs: {}, pinnedCheats: [], theme: "light", focusCore: false, lastDocId: "G-00" };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function resolveInternalDocId(href) {
    if (!href) return null;
    const clean = href.split("#")[0].replace(/^\.\//, "");
    const match = DATA.items.find((it) => it.path === clean || it.path.endsWith("/" + clean) || it.id === clean);
    return match ? match.id : null;
  }

  function renderInline(text) {
    const codeTokens = [];
    let s = text.replace(/`([^`]+)`/g, function (_, code) {
      const idx = codeTokens.length;
      codeTokens.push("<code>" + escapeHtml(code) + "</code>");
      return "\u0000CODE" + idx + "\u0000";
    });

    s = escapeHtml(s);
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, label, href) {
      const docId = resolveInternalDocId(href);
      if (docId) {
        return '<a href="#' + docId + '" data-doc-link="' + docId + '">' + label + "</a>";
      }
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    s = s.replace(/\u0000CODE(\d+)\u0000/g, function (_, idx) {
      return codeTokens[Number(idx)];
    });
    return s;
  }

  function splitTableRow(line) {
    let t = line.trim();
    if (t.startsWith("|")) t = t.slice(1);
    if (t.endsWith("|")) t = t.slice(0, -1);
    return t.split("|").map((c) => c.trim());
  }

  function parseMarkdown(mdText) {
    const blocks = [];
    let src = mdText.replace(/\r\n/g, "\n");

    // Protect fenced code blocks
    src = src.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, function (_, lang, body) {
      const idx = blocks.length;
      blocks.push({ type: "code", lang: (lang || "").toLowerCase(), body: body.replace(/\n$/, "") });
      return "\n\u0000BLOCK" + idx + "\u0000\n";
    });

    // Protect block math $$...$$
    src = src.replace(/\$\$([\s\S]*?)\$\$/g, function (_, expr) {
      const idx = blocks.length;
      blocks.push({ type: "math", body: expr.trim() });
      return "\n\u0000BLOCK" + idx + "\u0000\n";
    });

    const lines = src.split("\n");
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      const blockMatch = trimmed.match(/^\u0000BLOCK(\d+)\u0000$/);
      if (blockMatch) {
        const blk = blocks[Number(blockMatch[1])];
        if (blk.type === "code") {
          if (blk.lang === "mermaid") {
            out.push('<div class="mermaid-wrap" tabindex="0"><div class="mermaid">' + escapeHtml(blk.body) + "</div></div>");
          } else {
            out.push('<pre class="ascii-diagram" tabindex="0"><code>' + escapeHtml(blk.body) + "</code></pre>");
          }
        } else if (blk.type === "math") {
          out.push('<div class="math-block" tabindex="0" data-math="' + escapeHtml(blk.body) + '">$$' + escapeHtml(blk.body) + "$$</div>");
        }
        i++;
        continue;
      }

      // Headings
      const hMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
      if (hMatch) {
        const lvl = hMatch[1].length;
        out.push("<h" + lvl + ">" + renderInline(hMatch[2]) + "</h" + lvl + ">");
        i++;
        continue;
      }

      // HR
      if (/^---+$/.test(trimmed)) {
        out.push("<hr />");
        i++;
        continue;
      }

      // Table
      if (trimmed.startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|/.test(lines[i + 1].trim())) {
        const headers = splitTableRow(trimmed);
        const aligns = splitTableRow(lines[i + 1]).map((cell) => {
          if (cell.endsWith(":") && cell.startsWith(":")) return "center";
          if (cell.endsWith(":")) return "num";
          return "left";
        });
        const isJournal = headers.includes("借方金額") && headers.includes("貸方金額");
        let html = '<div class="table-wrap" tabindex="0"><table class="' + (isJournal ? "journal-table" : "") + '"><thead><tr>';
        headers.forEach((h, cIdx) => {
          const cls = aligns[cIdx] === "num" ? ' class="num"' : "";
          html += "<th" + cls + ">" + renderInline(h) + "</th>";
        });
        html += "</tr></thead><tbody>";
        i += 2;
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          const row = splitTableRow(lines[i]);
          html += "<tr>";
          headers.forEach((_, cIdx) => {
            const val = row[cIdx] !== undefined ? row[cIdx] : "";
            const cls = aligns[cIdx] === "num" ? ' class="num"' : "";
            html += "<td" + cls + ">" + renderInline(val) + "</td>";
          });
          html += "</tr>";
          i++;
        }
        html += "</tbody></table></div>";
        out.push(html);
        continue;
      }

      // Blockquote
      if (trimmed.startsWith(">")) {
        const qLines = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          qLines.push(lines[i].trim().replace(/^>\s?/, ""));
          i++;
        }
        out.push("<blockquote><p>" + qLines.map(renderInline).join("<br />") + "</p></blockquote>");
        continue;
      }

      // Unordered / Checklist
      if (/^-\s+/.test(trimmed)) {
        const isChecklist = /^-\s+\[[ xX]\]\s+/.test(trimmed);
        out.push(isChecklist ? '<ul class="review-checklist">' : "<ul>");
        while (i < lines.length && /^-\s+/.test(lines[i].trim())) {
          const itemLine = lines[i].trim();
          const chkMatch = itemLine.match(/^-\s+\[([ xX])\]\s+(.*)$/);
          if (chkMatch) {
            out.push('<li class="chk-raw">' + renderInline(chkMatch[2]) + "</li>");
          } else {
            out.push("<li>" + renderInline(itemLine.replace(/^-\s+/, "")) + "</li>");
          }
          i++;
        }
        out.push("</ul>");
        continue;
      }

      // Ordered list
      if (/^\d+\.\s+/.test(trimmed)) {
        out.push("<ol>");
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          out.push("<li>" + renderInline(lines[i].trim().replace(/^\d+\.\s+/, "")) + "</li>");
          i++;
        }
        out.push("</ol>");
        continue;
      }

      // Paragraph
      const pLines = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !lines[i].trim().startsWith("#") &&
        !lines[i].trim().startsWith("|") &&
        !lines[i].trim().startsWith(">") &&
        !/^-\s+/.test(lines[i].trim()) &&
        !/^\d+\.\s+/.test(lines[i].trim()) &&
        !/^---+$/.test(lines[i].trim()) &&
        !/^\u0000BLOCK\d+\u0000$/.test(lines[i].trim())
      ) {
        pLines.push(lines[i].trim());
        i++;
      }
      out.push("<p>" + pLines.map(renderInline).join(" ") + "</p>");
    }

    return out.join("\n");
  }

  function enhanceArticle(doc) {
    const body = document.getElementById("articleBody");

    // 1. Wrap Section 3 Core vs Hook cards
    body.querySelectorAll("h3").forEach((h3) => {
      const txt = h3.textContent;
      if (txt.includes("今すぐ100%定着させるコア")) {
        const card = document.createElement("div");
        card.className = "core-card";
        h3.parentNode.insertBefore(card, h3);
        card.appendChild(h3);
        while (card.nextSibling && !["H2", "H3", "HR"].includes(card.nextSibling.nodeName)) {
          card.appendChild(card.nextSibling);
        }
      } else if (txt.includes("未来の拡張フック")) {
        const card = document.createElement("div");
        card.className = "hook-card";
        const note = document.createElement("div");
        note.className = "focus-note";
        note.textContent = "※「今級集中モード」ONのため折りたたんでいます（上部のボタンで再表示できます）。";
        const inner = document.createElement("div");
        inner.className = "hook-body";
        h3.parentNode.insertBefore(card, h3);
        card.appendChild(h3);
        card.appendChild(note);
        card.appendChild(inner);
        while (card.nextSibling && !["H2", "H3", "HR"].includes(card.nextSibling.nodeName)) {
          inner.appendChild(card.nextSibling);
        }
      }
    });

    // 2. Wrap Section 6 solutions into collapsible <details>
    const sec6Heading = Array.from(body.querySelectorAll("h2")).find((h) => h.textContent.startsWith("6."));
    if (sec6Heading) {
      const ctrl = document.createElement("div");
      ctrl.className = "solution-controls";
      ctrl.innerHTML =
        '<button type="button" class="mask-btn" id="openAllSolBtn">すべての解答を開く</button>' +
        '<button type="button" class="mask-btn" id="closeAllSolBtn">すべて閉じる</button>';
      sec6Heading.insertAdjacentElement("afterend", ctrl);

      let cursor = ctrl.nextElementSibling;
      const solHeadings = [];
      while (cursor && cursor.nodeName !== "H2") {
        if (cursor.nodeName === "H3") solHeadings.push(cursor);
        cursor = cursor.nextElementSibling;
      }

      solHeadings.forEach((sh) => {
        const details = document.createElement("details");
        details.className = "solution-card";
        const summary = document.createElement("summary");
        summary.textContent = sh.textContent;
        const inner = document.createElement("div");
        inner.className = "solution-inner";
        sh.parentNode.insertBefore(details, sh);
        details.appendChild(summary);
        details.appendChild(inner);
        sh.remove();
        while (details.nextSibling && details.nextSibling.nodeName !== "H3" && details.nextSibling.nodeName !== "H2") {
          inner.appendChild(details.nextSibling);
        }
      });

      document.getElementById("openAllSolBtn").onclick = () => {
        body.querySelectorAll(".solution-card").forEach((d) => (d.open = true));
      };
      document.getElementById("closeAllSolBtn").onclick = () => {
        body.querySelectorAll(".solution-card").forEach((d) => (d.open = false));
      };
    }

    // 3. Add flashcard mask toolbars to journal tables
    body.querySelectorAll("table.journal-table").forEach((tbl) => {
      const wrap = tbl.closest(".table-wrap");
      const headers = Array.from(tbl.querySelectorAll("thead th")).map((th) => th.textContent.trim());
      const dSubIdx = headers.indexOf("借方科目");
      const dAmtIdx = headers.indexOf("借方金額");
      const cSubIdx = headers.indexOf("貸方科目");
      const cAmtIdx = headers.indexOf("貸方金額");

      const bar = document.createElement("div");
      bar.className = "journal-toolbar";
      bar.innerHTML =
        '<span class="journal-toolbar-label">仕訳トレーニング:</span>' +
        '<button type="button" class="mask-btn active" data-mask="none">通常表示</button>' +
        '<button type="button" class="mask-btn" data-mask="subjects">科目を隠す</button>' +
        '<button type="button" class="mask-btn" data-mask="amounts">金額を隠す</button>' +
        '<button type="button" class="mask-btn" data-mask="both">科目＋金額を隠す</button>';
      wrap.parentNode.insertBefore(bar, wrap);

      bar.querySelectorAll(".mask-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          bar.querySelectorAll(".mask-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          const mode = btn.dataset.mask;
          tbl.querySelectorAll("tbody tr").forEach((tr) => {
            const cells = tr.querySelectorAll("td");
            cells.forEach((td, idx) => {
              td.classList.remove("masked-cell", "revealed");
              const hasText = td.textContent.trim() !== "";
              if (!hasText) return;
              const isSub = idx === dSubIdx || idx === cSubIdx;
              const isAmt = idx === dAmtIdx || idx === cAmtIdx;
              if (
                (mode === "subjects" && isSub) ||
                (mode === "amounts" && isAmt) ||
                (mode === "both" && (isSub || isAmt))
              ) {
                td.classList.add("masked-cell");
              }
            });
          });
        });
      });

      tbl.addEventListener("click", (e) => {
        const td = e.target.closest("td.masked-cell");
        if (td) td.classList.toggle("revealed");
      });
    });

    // 4. Interactive Section 7 Checklist
    const sec7Lists = body.querySelectorAll("ul.review-checklist");
    sec7Lists.forEach((ul) => {
      const saved = state.checks[doc.id] || [];
      const items = Array.from(ul.querySelectorAll("li.chk-raw"));
      items.forEach((li, idx) => {
        const label = document.createElement("label");
        label.className = "review-item" + (saved[idx] ? " checked" : "");
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.checked = !!saved[idx];
        const span = document.createElement("span");
        span.innerHTML = li.innerHTML;
        label.appendChild(chk);
        label.appendChild(span);
        li.innerHTML = "";
        li.appendChild(label);

        chk.addEventListener("change", () => {
          if (!state.checks[doc.id]) state.checks[doc.id] = [];
          state.checks[doc.id][idx] = chk.checked;
          label.classList.toggle("checked", chk.checked);
          saveState();
          updateMasterBanner(doc, items.length);
          renderSidebar();
          updateProgress();
        });
      });

      const banner = document.createElement("div");
      banner.className = "master-banner";
      banner.id = "masterBanner";
      banner.textContent = "この単元の本質チェックリストを全項目クリアしました！Day 1 / Day 7 復習へ進みましょう。";
      ul.insertAdjacentElement("afterend", banner);
      updateMasterBanner(doc, items.length);
    });

    // 5. Internal doc links
    body.querySelectorAll("a[data-doc-link]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        openDoc(a.dataset.docLink);
      });
    });
  }

  function updateMasterBanner(doc, totalCount) {
    const banner = document.getElementById("masterBanner");
    if (!banner || totalCount === 0) return;
    const arr = state.checks[doc.id] || [];
    const doneCount = arr.filter(Boolean).length;
    banner.classList.toggle("visible", doneCount >= totalCount);
  }

  function isDocMastered(doc) {
    if (!doc.available || doc.part === "guide") return false;
    const chkMatches = doc.markdown.match(/^- \[ \]/gm);
    if (!chkMatches || chkMatches.length === 0) return false;
    const arr = state.checks[doc.id] || [];
    return arr.filter(Boolean).length >= chkMatches.length;
  }

  function renderTOC() {
    const toc = document.getElementById("tocNav");
    toc.innerHTML = "";
    const headings = Array.from(document.querySelectorAll("#articleBody h2, #articleBody h3"));
    headings.forEach((h, idx) => {
      if (h.closest(".solution-card") && h.nodeName === "H3") return;
      const id = "sec-" + idx;
      h.id = id;
      const a = document.createElement("a");
      a.className = "toc-link";
      a.href = "#" + id;
      a.textContent = h.textContent;
      a.style.paddingLeft = h.nodeName === "H3" ? "18px" : "8px";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        h.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      toc.appendChild(a);
    });
  }

  function renderSidebar() {
    const nav = document.getElementById("sidebarNav");
    const q = document.getElementById("searchInput").value.trim().toLowerCase();
    const onlyAvail = document.getElementById("onlyAvailableChk").checked;
    nav.innerHTML = "";

    const groups = navMode === "part" ? DATA.parts : DATA.lines;
    groups.forEach((g) => {
      const items = DATA.items.filter((it) => {
        const inGroup = navMode === "part" ? it.part === g.id : it.line.includes(g.id);
        if (!inGroup) return false;
        if (onlyAvail && !it.available) return false;
        if (q) {
          const hay = (it.id + " " + it.title + " " + (it.markdown || "")).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      if (items.length === 0) return;

      const wrap = document.createElement("div");
      wrap.className = "nav-group";
      const header = document.createElement("div");
      header.className = "nav-group-header";
      header.innerHTML = "<span>" + escapeHtml(g.name) + "</span><span>" + items.filter((x) => x.available).length + "/" + items.length + "</span>";
      wrap.appendChild(header);

      items.forEach((it) => {
        const btn = document.createElement("button");
        btn.className = "nav-item" + (it.id === currentDocId ? " active" : "") + (!it.available ? " unavailable" : "");
        let badges = "";
        if (it.is2027New) badges += '<span class="badge-2027">2027</span>';
        if (isDocMastered(it)) badges += '<span class="badge-done">✓</span>';
        else if (!it.available) badges += '<span class="badge-todo">予定</span>';
        btn.innerHTML =
          '<span class="nav-id">' + escapeHtml(it.id) + "</span>" +
          '<span class="nav-title">' + escapeHtml(it.title) + "</span>" +
          '<span class="nav-badges">' + badges + "</span>";
        btn.addEventListener("click", () => {
          openDoc(it.id);
          closeAllOverlays();
        });
        wrap.appendChild(btn);
      });

      nav.appendChild(wrap);
    });
  }

  function updateProgress() {
    const units = DATA.items.filter((it) => it.part !== "guide");
    const pubUnits = units.filter((it) => it.available);
    const mastered = pubUnits.filter(isDocMastered);
    document.getElementById("masteredCountLabel").textContent = "習得 " + mastered.length + " / " + pubUnits.length;
    document.getElementById("publishedCountLabel").textContent = "公開 " + pubUnits.length + " / " + units.length + "単元";
    const pct = pubUnits.length > 0 ? Math.round((mastered.length / pubUnits.length) * 100) : 0;
    document.getElementById("masteredBar").style.width = pct + "%";
  }

  function renderOptionalRichMedia() {
    if (typeof mermaid !== "undefined") {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: state.theme === "dark" ? "dark" : "default",
          securityLevel: "loose"
        });
        const nodes = document.querySelectorAll("#articleBody .mermaid");
        if (nodes.length > 0) {
          mermaid.run({ nodes: nodes });
        }
      } catch (e) {}
    }
    if (typeof katex !== "undefined") {
      document.querySelectorAll("#articleBody .math-block").forEach((el) => {
        try {
          el.innerHTML = katex.renderToString(el.dataset.math, { displayMode: true, throwOnError: false });
        } catch (e) {}
      });
    }
  }

  const MODE_SHORT_LABELS = {
    reader: "",
    drill: "道場",
    sim: "試算",
    analytics: "分析",
    cheat: "暗記"
  };

  function updateMobileContext(mode) {
    const el = document.getElementById("mobileContextLabel");
    if (!el) return;
    if (mode === "reader") {
      el.textContent = currentDocId || "";
    } else {
      el.textContent = MODE_SHORT_LABELS[mode] || "";
    }
  }

  function closeSidebar() {
    const sb = document.getElementById("sidebar");
    const btn = document.getElementById("mobileMenuBtn");
    if (sb) sb.classList.remove("open");
    if (btn) btn.setAttribute("aria-expanded", "false");
    syncBackdrop();
  }

  function closeToolsMenu() {
    const menu = document.getElementById("toolsMenu");
    const btn = document.getElementById("toolsMenuBtn");
    if (menu) menu.classList.add("hidden");
    if (btn) btn.setAttribute("aria-expanded", "false");
    syncBackdrop();
  }

  function closeAllOverlays() {
    const sb = document.getElementById("sidebar");
    const mBtn = document.getElementById("mobileMenuBtn");
    const menu = document.getElementById("toolsMenu");
    const tBtn = document.getElementById("toolsMenuBtn");
    if (sb) sb.classList.remove("open");
    if (mBtn) mBtn.setAttribute("aria-expanded", "false");
    if (menu) menu.classList.add("hidden");
    if (tBtn) tBtn.setAttribute("aria-expanded", "false");
    syncBackdrop();
  }

  function syncBackdrop() {
    const sbOpen = document.getElementById("sidebar")?.classList.contains("open");
    const toolsOpen = !document.getElementById("toolsMenu")?.classList.contains("hidden");
    const bd = document.getElementById("sidebarBackdrop");
    const isMobile = window.matchMedia("(max-width: 820px)").matches;
    const show = sbOpen || (isMobile && toolsOpen);
    if (bd) bd.classList.toggle("hidden", !show);
    document.body.classList.toggle("drawer-open", !!show);
  }

  function switchStudioMode(mode) {
    studioMode = mode || "reader";
    const views = {
      reader: document.getElementById("readerView"),
      drill: document.getElementById("drillView"),
      sim: document.getElementById("simView"),
      analytics: document.getElementById("analyticsView"),
      cheat: document.getElementById("cheatView")
    };
    Object.keys(views).forEach((k) => {
      if (views[k]) views[k].classList.toggle("hidden", k !== studioMode);
    });
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      const isActive = btn.dataset.studioMode === studioMode;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    document.body.classList.toggle("wide-studio-mode", studioMode !== "reader");
    updateMobileContext(studioMode);
    closeAllOverlays();
    if (window.BokiStudioTools && typeof window.BokiStudioTools.onModeChange === "function") {
      window.BokiStudioTools.onModeChange(studioMode);
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function injectConceptSvg(bodyEl, docId) {
    const svgMap = {
      "G-03": {
        title: "財務諸表5要素と B/S・P/L 連動構造（資産負債アプローチ）",
        svg: '<svg viewBox="0 0 680 185" class="concept-svg" role="img" aria-label="5要素連動図"><rect x="10" y="12" width="315" height="160" rx="4" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1"/><text x="167" y="34" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text)">B/S（ストック：財政状態）</text><rect x="24" y="48" width="136" height="110" rx="3" fill="var(--surface-alt)" stroke="var(--border-strong)"/><text x="92" y="106" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">資産（借方＋）</text><rect x="172" y="48" width="138" height="48" rx="3" fill="var(--surface)" stroke="var(--border)"/><text x="241" y="77" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--text)">負債（貸方＋）</text><rect x="172" y="106" width="138" height="52" rx="3" fill="var(--emerald-soft)" stroke="var(--emerald)"/><text x="241" y="137" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--emerald)">純資産（貸方＋）</text><rect x="355" y="12" width="315" height="160" rx="4" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1"/><text x="512" y="34" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text)">P/L（フロー：経営成績）</text><rect x="369" y="48" width="136" height="72" rx="3" fill="var(--vermilion-soft)" stroke="var(--vermilion)"/><text x="437" y="88" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vermilion)">費用（借方＋）</text><rect x="369" y="126" width="136" height="32" rx="3" fill="var(--emerald-soft)" stroke="var(--emerald)"/><text x="437" y="146" text-anchor="middle" font-size="12" font-weight="700" fill="var(--emerald)">当期純利益</text><rect x="517" y="48" width="138" height="110" rx="3" fill="var(--surface-alt)" stroke="var(--border-strong)"/><text x="586" y="106" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">収益（貸方＋）</text><path d="M 369 142 C 335 142, 335 132, 312 132" fill="none" stroke="var(--emerald)" stroke-width="1.75" stroke-dasharray="4 3"/></svg>'
      },
      "L2I-01": {
        title: "工業簿記 原価勘定連絡フロー（投入＝産出の均衡）",
        svg: '<svg viewBox="0 0 680 175" class="concept-svg" role="img" aria-label="原価勘定連絡図"><rect x="14" y="16" width="120" height="38" rx="3" fill="var(--surface)" stroke="var(--border-strong)"/><text x="74" y="40" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--text)">材料費</text><rect x="14" y="68" width="120" height="38" rx="3" fill="var(--surface)" stroke="var(--border-strong)"/><text x="74" y="92" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--text)">労務費・経費</text><rect x="14" y="120" width="145" height="38" rx="3" fill="var(--amber-soft)" stroke="var(--amber)"/><text x="86" y="144" text-anchor="middle" font-size="12" font-weight="600" fill="var(--amber)">製造間接費(予定)</text><rect x="235" y="42" width="130" height="86" rx="4" fill="var(--surface-alt)" stroke="var(--text)" stroke-width="1.25"/><text x="300" y="80" text-anchor="middle" font-size="13.5" font-weight="700" fill="var(--text)">仕掛品</text><text x="300" y="102" text-anchor="middle" font-size="11" fill="var(--text-muted)">(直接費＋配賦)</text><rect x="410" y="54" width="110" height="62" rx="4" fill="var(--emerald-soft)" stroke="var(--emerald)"/><text x="465" y="90" text-anchor="middle" font-size="13.5" font-weight="700" fill="var(--emerald)">製品</text><rect x="560" y="54" width="106" height="62" rx="4" fill="var(--surface)" stroke="var(--border-strong)"/><text x="613" y="90" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--text)">売上原価</text><path d="M134 35 L235 66 M134 87 L235 87 M159 139 L235 110 M365 85 L410 85 M520 85 L560 85" stroke="var(--text-muted)" stroke-width="1.5" fill="none"/></svg>'
      },
      "L2C-05": {
        title: "新リース会計基準（ASBJ第34号）オンバランス構造",
        svg: '<svg viewBox="0 0 680 165" class="concept-svg" role="img" aria-label="新リースオンバランス図"><rect x="16" y="18" width="200" height="128" rx="4" fill="var(--surface)" stroke="var(--text)" stroke-width="1.1"/><text x="116" y="44" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--text)">契約開始時 (B/S両建て)</text><text x="116" y="78" text-anchor="middle" font-size="12" fill="var(--text)">(借) 使用権資産（現在価値）</text><text x="116" y="106" text-anchor="middle" font-size="12" fill="var(--text)">(貸) リース負債（現在価値）</text><rect x="242" y="18" width="205" height="128" rx="4" fill="var(--surface-alt)" stroke="var(--border-strong)"/><text x="344" y="44" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--text)">毎期支払時 (利息法分解)</text><text x="344" y="78" text-anchor="middle" font-size="12" fill="var(--text)">支払額 ＝ 利息費用(営業外)</text><text x="344" y="106" text-anchor="middle" font-size="12" fill="var(--text)">＋ リース負債元本返済</text><rect x="472" y="18" width="192" height="128" rx="4" fill="var(--emerald-soft)" stroke="var(--emerald)"/><text x="568" y="44" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--emerald)">決算時 (費用配分)</text><text x="568" y="78" text-anchor="middle" font-size="12" fill="var(--text)">使用権資産をリース期間等で</text><text x="568" y="106" text-anchor="middle" font-size="12" fill="var(--text)">減価償却費（営業費用）へ</text></svg>'
      },
      "L2C-10": {
        title: "税効果会計：一時差異と DTA / DTL 判定マップ",
        svg: '<svg viewBox="0 0 680 155" class="concept-svg" role="img" aria-label="税効果マップ"><rect x="16" y="16" width="310" height="122" rx="4" fill="var(--emerald-soft)" stroke="var(--emerald)"/><text x="171" y="44" text-anchor="middle" font-size="13" font-weight="700" fill="var(--emerald)">将来減算一時差異 → 繰延税金資産 (DTA)</text><text x="171" y="74" text-anchor="middle" font-size="12" fill="var(--text)">会計が先に費用認識（貸倒超過・減損等）</text><text x="171" y="102" text-anchor="middle" font-size="12" fill="var(--text-muted)">＝ 税金の前払い（将来課税所得を減らす）</text><rect x="354" y="16" width="310" height="122" rx="4" fill="var(--vermilion-soft)" stroke="var(--vermilion)"/><text x="509" y="44" text-anchor="middle" font-size="13" font-weight="700" fill="var(--vermilion)">将来加算一時差異 → 繰延税金負債 (DTL)</text><text x="509" y="74" text-anchor="middle" font-size="12" fill="var(--text)">評価益・圧縮積立金等で将来課税が増える</text><text x="509" y="102" text-anchor="middle" font-size="12" fill="var(--text-muted)">＝ 税金の後払い（将来課税所得を増やす）</text></svg>'
      },
      "L2C-12": {
        title: "連結会計：支配獲得日と持分変動（傘の中 vs ライン越え）",
        svg: '<svg viewBox="0 0 680 160" class="concept-svg" role="img" aria-label="連結会計構造図"><line x1="40" y1="88" x2="640" y2="88" stroke="var(--border-strong)" stroke-width="2"/><circle cx="130" cy="88" r="6" fill="var(--text)"/><text x="130" y="56" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--text)">支配獲得日</text><text x="130" y="118" text-anchor="middle" font-size="11.5" fill="var(--text-muted)">全面時価評価＋のれん</text><circle cx="340" cy="88" r="6" fill="var(--emerald)"/><text x="340" y="56" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--emerald)">連結決算（毎期）</text><text x="340" y="118" text-anchor="middle" font-size="11.5" fill="var(--text-muted)">のれん償却・成果連結・NCI按分</text><circle cx="550" cy="88" r="6" fill="var(--amber)"/><text x="550" y="56" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--amber)">追加取得・一部売却</text><text x="550" y="118" text-anchor="middle" font-size="11.5" fill="var(--text-muted)">支配継続＝資本剰余金で調整</text></svg>'
      }
    };
    svgMap["L3-01"] = svgMap["G-03"];
    svgMap["CS-03"] = svgMap["L2I-01"];
    svgMap["L1C-08"] = svgMap["L2C-05"];
    svgMap["L1C-11"] = svgMap["L2C-10"];
    svgMap["L1C-13"] = svgMap["L2C-12"];

    const item = svgMap[docId];
    if (!item) return;
    const h1 = bodyEl.querySelector("h1");
    const box = document.createElement("div");
    box.className = "concept-svg-card";
    box.innerHTML = '<div class="concept-svg-title">' + escapeHtml(item.title) + "</div>" + item.svg;
    if (h1 && h1.nextSibling) bodyEl.insertBefore(box, h1.nextSibling);
    else bodyEl.prepend(box);
  }

  function openDoc(docId, pushHash = true) {
    if (studioMode !== "reader") switchStudioMode("reader");
    const doc = DATA.items.find((it) => it.id === docId) || DATA.items[0];
    currentDocId = doc.id;
    state.lastDocId = doc.id;
    saveState();
    updateMobileContext(studioMode);

    if (pushHash && window.location.hash !== "#" + doc.id) {
      history.pushState(null, "", "#" + doc.id);
    }

    // Meta badges
    const badgesEl = document.getElementById("docMetaBadges");
    badgesEl.innerHTML = "";
    const addPill = (txt, cls) => {
      const s = document.createElement("span");
      s.className = "meta-pill " + (cls || "");
      s.textContent = txt;
      badgesEl.appendChild(s);
    };
    addPill(doc.id, "accent");
    if (doc.is2027New) addPill("2027年4月改定対応", "amber");
    doc.line.forEach((l) => addPill(l));
    doc.formats.forEach((f) => addPill(f));
    addPill("目安 " + doc.minutes + "分");
    addPill(doc.importance);

    // PDF Links
    const fullPdfEl = document.getElementById("fullPdfLink");
    if (fullPdfEl) {
      if (DATA.fullPdfAvailable && DATA.fullPdfPath) {
        fullPdfEl.href = DATA.fullPdfPath;
        fullPdfEl.classList.remove("hidden");
      } else {
        fullPdfEl.classList.add("hidden");
      }
    }
    const unitPdfEl = document.getElementById("unitPdfLink");
    if (unitPdfEl) {
      if (doc.pdfAvailable && doc.pdfPath) {
        unitPdfEl.href = doc.pdfPath;
        unitPdfEl.classList.remove("hidden");
      } else {
        unitPdfEl.classList.add("hidden");
      }
    }

    // Review tracker
    const tracker = document.getElementById("reviewTracker");
    tracker.style.display = doc.part === "guide" ? "none" : "flex";
    const docRev = state.reviews[doc.id] || {};
    tracker.querySelectorAll(".day-btn").forEach((btn) => {
      btn.classList.toggle("done", !!docRev[btn.dataset.day]);
    });

    // Body
    const body = document.getElementById("articleBody");
    if (doc.available) {
      body.innerHTML = parseMarkdown(doc.markdown);
      injectConceptSvg(body, doc.id);
      enhanceArticle(doc);
      renderOptionalRichMedia();
    } else {
      body.innerHTML =
        '<div class="roadmap-placeholder">' +
        "<h2>" + escapeHtml(doc.id + "：" + doc.title) + "</h2>" +
        "<p>この単元はカリキュラムロードマップに登録済みで、次期フェーズで公開予定です。</p>" +
        "<p>使用予定の下書き型：<strong>" + escapeHtml(doc.formats.join(" / ") || "標準型") + "</strong> ／ 貫通ライン：<strong>" + escapeHtml(doc.line.join(", ")) + "</strong></p>" +
        '<p><button type="button" class="primary-btn" id="jumpMapBtn">全体マップ (G-01) を見る</button></p>' +
        "</div>";
      document.getElementById("jumpMapBtn").onclick = () => openDoc("G-01");
    }

    // Prev / Next available docs
    const availDocs = DATA.items.filter((it) => it.available);
    const curIdx = availDocs.findIndex((it) => it.id === doc.id);
    const prevBtn = document.getElementById("prevDocBtn");
    const nextBtn = document.getElementById("nextDocBtn");
    prevBtn.disabled = curIdx <= 0;
    nextBtn.disabled = curIdx < 0 || curIdx >= availDocs.length - 1;
    prevBtn.onclick = () => curIdx > 0 && openDoc(availDocs[curIdx - 1].id);
    nextBtn.onclick = () => curIdx >= 0 && curIdx < availDocs.length - 1 && openDoc(availDocs[curIdx + 1].id);

    // Scratchpad load
    document.getElementById("scratchTextarea").value = state.notes[doc.id] || "";

    renderTOC();
    renderSidebar();
    updateProgress();
    const mainEl = document.getElementById("mainContent");
    if (mainEl) mainEl.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  // Safe Calculator
  function evalCalc() {
    const raw = document.getElementById("calcInput").value.replace(/,/g, "").replace(/\s+/g, "");
    const resEl = document.getElementById("calcResult");
    if (!raw) { resEl.textContent = "0"; return; }
    if (!/^[0-9+\-*/().]+$/.test(raw)) {
      resEl.textContent = "Error";
      return;
    }
    try {
      const val = Function('"use strict"; return (' + raw + ")")();
      if (typeof val !== "number" || !isFinite(val)) {
        resEl.textContent = "Error";
        return;
      }
      const rounded = Math.round(val * 10000) / 10000;
      const formatted = rounded.toLocaleString("ja-JP", { maximumFractionDigits: 4 });
      resEl.textContent = formatted;
      const hist = document.getElementById("calcHistory");
      hist.innerHTML = escapeHtml(raw + " = " + formatted) + "<br />" + hist.innerHTML;
    } catch (e) {
      resEl.textContent = "Error";
    }
  }

  // Timer
  function renderTimer() {
    const m = Math.floor(timerSeconds / 60);
    const s = timerSeconds % 60;
    document.getElementById("timerDisplay").textContent =
      String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function startTimer() {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
      if (timerCountdown) {
        if (timerSeconds > 0) timerSeconds--;
        else pauseTimer();
      } else {
        timerSeconds++;
      }
      renderTimer();
    }, 1000);
  }

  function pauseTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  const MOON_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.25 9.75A5.5 5.5 0 0 1 6.25 2.75a5.5 5.5 0 1 0 7 7z"/></svg>';
  const SUN_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3.25"/><line x1="8" y1="1.75" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="14.25"/><line x1="1.75" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="14.25" y2="8"/><line x1="3.6" y1="3.6" x2="4.5" y2="4.5"/><line x1="11.5" y1="11.5" x2="12.4" y2="12.4"/><line x1="12.4" y1="3.6" x2="11.5" y2="4.5"/><line x1="4.5" y1="11.5" x2="3.6" y2="12.4"/></svg>';

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const toggleBtn = document.getElementById("themeToggle");
    if (toggleBtn) toggleBtn.innerHTML = theme === "dark" ? SUN_SVG : MOON_SVG;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", theme === "dark" ? "#0E0E0D" : "#F7F6F2");
  }

  // Init UI bindings
  function init() {
    applyTheme(state.theme);
    document.body.classList.toggle("focus-core-mode", !!state.focusCore);
    const focusBtn = document.getElementById("focusCoreBtn");
    focusBtn.classList.toggle("active", !!state.focusCore);
    focusBtn.setAttribute("aria-pressed", state.focusCore ? "true" : "false");

    document.getElementById("mobileMenuBtn").onclick = () => {
      const sb = document.getElementById("sidebar");
      const open = sb.classList.toggle("open");
      document.getElementById("mobileMenuBtn").setAttribute("aria-expanded", open ? "true" : "false");
      if (open) closeToolsMenu();
      syncBackdrop();
    };
    const sbClose = document.getElementById("sidebarCloseBtn");
    if (sbClose) sbClose.onclick = closeSidebar;
    const bd = document.getElementById("sidebarBackdrop");
    if (bd) bd.onclick = closeAllOverlays;

    const toolsBtn = document.getElementById("toolsMenuBtn");
    const toolsMenu = document.getElementById("toolsMenu");
    if (toolsBtn && toolsMenu) {
      toolsBtn.onclick = (e) => {
        e.stopPropagation();
        const willOpen = toolsMenu.classList.contains("hidden");
        toolsMenu.classList.toggle("hidden", !willOpen);
        toolsBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
        if (willOpen) {
          document.getElementById("sidebar")?.classList.remove("open");
          document.getElementById("mobileMenuBtn")?.setAttribute("aria-expanded", "false");
        }
        syncBackdrop();
      };
      document.addEventListener("click", (e) => {
        if (!toolsMenu.classList.contains("hidden") && !toolsMenu.contains(e.target) && !toolsBtn.contains(e.target)) {
          closeToolsMenu();
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeAllOverlays();
        document.querySelectorAll(".floating-panel").forEach((p) => p.classList.add("hidden"));
      }
    });

    document.getElementById("tabByPart").onclick = (e) => {
      navMode = "part";
      e.currentTarget.classList.add("active");
      e.currentTarget.setAttribute("aria-selected", "true");
      const lineBtn = document.getElementById("tabByLine");
      lineBtn.classList.remove("active");
      lineBtn.setAttribute("aria-selected", "false");
      renderSidebar();
    };
    document.getElementById("tabByLine").onclick = (e) => {
      navMode = "line";
      e.currentTarget.classList.add("active");
      e.currentTarget.setAttribute("aria-selected", "true");
      const partBtn = document.getElementById("tabByPart");
      partBtn.classList.remove("active");
      partBtn.setAttribute("aria-selected", "false");
      renderSidebar();
    };

    document.getElementById("searchInput").addEventListener("input", renderSidebar);
    document.getElementById("onlyAvailableChk").addEventListener("change", renderSidebar);

    focusBtn.onclick = (e) => {
      state.focusCore = !state.focusCore;
      document.body.classList.toggle("focus-core-mode", state.focusCore);
      e.currentTarget.classList.toggle("active", state.focusCore);
      e.currentTarget.setAttribute("aria-pressed", state.focusCore ? "true" : "false");
      saveState();
      closeToolsMenu();
    };

    document.getElementById("themeToggle").onclick = () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyTheme(state.theme);
      saveState();
      renderOptionalRichMedia();
    };

    document.getElementById("timerToggleBtn").onclick = () => {
      closeToolsMenu();
      document.getElementById("scratchPanel")?.classList.add("hidden");
      document.getElementById("syncPanel")?.classList.add("hidden");
      document.getElementById("timerPanel").classList.toggle("hidden");
    };
    document.getElementById("scratchToggleBtn").onclick = () => {
      closeToolsMenu();
      document.getElementById("timerPanel")?.classList.add("hidden");
      document.getElementById("syncPanel")?.classList.add("hidden");
      document.getElementById("scratchPanel").classList.toggle("hidden");
    };
    document.querySelectorAll(".panel-close").forEach((btn) => {
      btn.onclick = () => document.getElementById(btn.dataset.close).classList.add("hidden");
    });

    document.getElementById("reviewTracker").querySelectorAll(".day-btn").forEach((btn) => {
      btn.onclick = () => {
        if (!state.reviews[currentDocId]) state.reviews[currentDocId] = {};
        const key = btn.dataset.day;
        state.reviews[currentDocId][key] = state.reviews[currentDocId][key] ? false : new Date().toISOString();
        btn.classList.toggle("done", !!state.reviews[currentDocId][key]);
        saveState();
      };
    });

    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.onclick = () => switchStudioMode(btn.dataset.studioMode);
    });

    // Timer controls
    document.querySelectorAll(".preset-btn").forEach((btn) => {
      btn.onclick = () => {
        pauseTimer();
        const mins = Number(btn.dataset.mins);
        timerCountdown = mins > 0;
        timerSeconds = mins * 60;
        renderTimer();
      };
    });
    document.getElementById("timerStartBtn").onclick = startTimer;
    document.getElementById("timerPauseBtn").onclick = pauseTimer;
    document.getElementById("timerResetBtn").onclick = () => {
      pauseTimer();
      timerCountdown = true;
      timerSeconds = 25 * 60;
      renderTimer();
    };

    // Scratchpad & Calc
    document.getElementById("calcEvalBtn").onclick = evalCalc;
    document.getElementById("calcInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") evalCalc();
    });
    document.getElementById("scratchTextarea").addEventListener("input", (e) => {
      if (currentDocId) {
        state.notes[currentDocId] = e.target.value;
        saveState();
      }
    });
    const templates = {
      box: "+---------------------------+---------------------------+\n| 期首              円      | 売上原価          円      |\n| 当期仕入          円      | 期末              円      |\n+---------------------------+---------------------------+\n",
      timeline: "  前期末        取得/発生          当期末\n----+---------------+----------------+----->\n    |               |<--- 当期(  月)>|\n",
      taccount: "     [ 勘定名 ]\n----------+----------\n          |\n"
    };
    document.querySelectorAll(".tpl-btn[data-tpl]").forEach((btn) => {
      btn.onclick = () => {
        const ta = document.getElementById("scratchTextarea");
        ta.value += (ta.value ? "\n" : "") + templates[btn.dataset.tpl];
        state.notes[currentDocId] = ta.value;
        saveState();
      };
    });
    document.getElementById("clearScratchBtn").onclick = () => {
      document.getElementById("scratchTextarea").value = "";
      state.notes[currentDocId] = "";
      saveState();
    };

    // Export / Import state + Sync Code + Service Worker
    document.getElementById("exportStateBtn").onclick = () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "boki1kyu_study_backup.json";
      a.click();
      URL.revokeObjectURL(url);
    };
    document.getElementById("importStateInput").onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          Object.assign(state, imported);
          saveState();
          openDoc(currentDocId, false);
        } catch (err) {
          alert("JSONの読み込みに失敗しました。");
        }
      };
      reader.readAsText(file);
    };

    // Sync Code modal (PC <-> iPhone)
    const syncBtn = document.getElementById("syncCodeBtn");
    if (syncBtn) {
      syncBtn.onclick = () => {
        closeToolsMenu();
        document.getElementById("timerPanel")?.classList.add("hidden");
        document.getElementById("scratchPanel")?.classList.add("hidden");
        const panel = document.getElementById("syncPanel");
        const ta = document.getElementById("syncCodeTextarea");
        const msg = document.getElementById("syncStatusMsg");
        if (panel) panel.classList.toggle("hidden");
        if (ta && !panel.classList.contains("hidden")) {
          const bytes = new TextEncoder().encode(JSON.stringify(state));
          let bin = "";
          bytes.forEach((b) => { bin += String.fromCharCode(b); });
          ta.value = "BOKI1:" + btoa(bin);
          if (msg) msg.textContent = "現在の学習記録から同期コードを生成しました。";
        }
      };
    }
    const copySyncBtn = document.getElementById("copySyncCodeBtn");
    if (copySyncBtn) {
      copySyncBtn.onclick = () => {
        const ta = document.getElementById("syncCodeTextarea");
        const msg = document.getElementById("syncStatusMsg");
        if (!ta) return;
        ta.select();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ta.value).then(() => {
            if (msg) msg.textContent = "✓ クリップボードにコピーしました！別端末で貼り付けてください。";
          }).catch(() => {
            document.execCommand("copy");
            if (msg) msg.textContent = "✓ コピーしました！";
          });
        } else {
          document.execCommand("copy");
          if (msg) msg.textContent = "✓ コピーしました！";
        }
      };
    }
    const applySyncBtn = document.getElementById("applySyncCodeBtn");
    if (applySyncBtn) {
      applySyncBtn.onclick = () => {
        const ta = document.getElementById("syncCodeTextarea");
        const msg = document.getElementById("syncStatusMsg");
        if (!ta) return;
        try {
          const raw = ta.value.trim();
          const b64 = raw.startsWith("BOKI1:") ? raw.slice(6) : raw;
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const parsed = JSON.parse(new TextDecoder().decode(bytes));
          Object.assign(state, parsed);
          saveState();
          openDoc(currentDocId, false);
          if (msg) msg.textContent = "✓ 学習記録を復元しました！";
        } catch (err) {
          if (msg) msg.textContent = "✕ 同期コードの形式が正しくありません。";
        }
      };
    }

    // Register Offline PWA Service Worker on http/https
    if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }

    window.addEventListener("hashchange", () => {
      const h = window.location.hash.replace(/^#/, "");
      if (h && h !== currentDocId) openDoc(h, false);
    });

    const initialHash = window.location.hash.replace(/^#/, "");
    openDoc(initialHash || state.lastDocId || "G-00", false);

    window.BokiStudio = {
      DATA,
      state,
      saveState,
      openDoc,
      switchStudioMode,
      isDocMastered,
      updateProgress,
      escapeHtml,
      getStudioMode: () => studioMode
    };
  }

  init();
})();
