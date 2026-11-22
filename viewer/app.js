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
            out.push('<div class="mermaid-wrap"><div class="mermaid">' + escapeHtml(blk.body) + "</div></div>");
          } else {
            out.push('<pre class="ascii-diagram"><code>' + escapeHtml(blk.body) + "</code></pre>");
          }
        } else if (blk.type === "math") {
          out.push('<div class="math-block" data-math="' + escapeHtml(blk.body) + '">$$' + escapeHtml(blk.body) + "$$</div>");
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
        let html = '<div class="table-wrap"><table class="' + (isJournal ? "journal-table" : "") + '"><thead><tr>';
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
          document.getElementById("sidebar").classList.remove("open");
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
      btn.classList.toggle("active", btn.dataset.studioMode === studioMode);
    });
    document.body.classList.toggle("wide-studio-mode", studioMode !== "reader");
    if (window.BokiStudioTools && typeof window.BokiStudioTools.onModeChange === "function") {
      window.BokiStudioTools.onModeChange(studioMode);
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function openDoc(docId, pushHash = true) {
    if (studioMode !== "reader") switchStudioMode("reader");
    const doc = DATA.items.find((it) => it.id === docId) || DATA.items[0];
    currentDocId = doc.id;
    state.lastDocId = doc.id;
    saveState();

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

  // Init UI bindings
  function init() {
    document.documentElement.setAttribute("data-theme", state.theme);
    document.body.classList.toggle("focus-core-mode", !!state.focusCore);
    document.getElementById("focusCoreBtn").classList.toggle("active", !!state.focusCore);
    document.getElementById("themeToggle").textContent = state.theme === "dark" ? "☀" : "🌙";

    document.getElementById("mobileMenuBtn").onclick = () => {
      document.getElementById("sidebar").classList.toggle("open");
    };

    document.getElementById("tabByPart").onclick = (e) => {
      navMode = "part";
      e.target.classList.add("active");
      document.getElementById("tabByLine").classList.remove("active");
      renderSidebar();
    };
    document.getElementById("tabByLine").onclick = (e) => {
      navMode = "line";
      e.target.classList.add("active");
      document.getElementById("tabByPart").classList.remove("active");
      renderSidebar();
    };

    document.getElementById("searchInput").addEventListener("input", renderSidebar);
    document.getElementById("onlyAvailableChk").addEventListener("change", renderSidebar);

    document.getElementById("focusCoreBtn").onclick = (e) => {
      state.focusCore = !state.focusCore;
      document.body.classList.toggle("focus-core-mode", state.focusCore);
      e.currentTarget.classList.toggle("active", state.focusCore);
      saveState();
    };

    document.getElementById("themeToggle").onclick = () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", state.theme);
      document.getElementById("themeToggle").textContent = state.theme === "dark" ? "☀" : "🌙";
      saveState();
      renderOptionalRichMedia();
    };

    document.getElementById("timerToggleBtn").onclick = () => {
      document.getElementById("timerPanel").classList.toggle("hidden");
    };
    document.getElementById("scratchToggleBtn").onclick = () => {
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

    // Export / Import state
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
