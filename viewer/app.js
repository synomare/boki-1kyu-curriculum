(function () {
  "use strict";

  const DATA = window.CURRICULUM_DATA;
  const STORAGE_KEY = "boki1kyu_study_state_v1";

  let cachedJournalProblems = null;
  let cachedCardToProbMap = null;
  const state = loadState();
  let navMode = "part"; // "part" | "line"
  let studioMode = "reader"; // "reader" | "drill" | "sim" | "analytics" | "cheat"
  let currentDocId = null;
  let timerInterval = null;
  let timerSeconds = 25 * 60;
  let timerCountdown = true;

  const MISTAKE_REASONS = [
    "科目・5要素誤認",
    "金額・計算ミス",
    "貸借逆・配分漏れ",
    "基準・2027改定混同",
    "問題文の読み落とし"
  ];

  const REVIEW_STAGE_GUIDE = {
    day0: "初学完了（§1本質〜§5問1＋§7チェック）",
    day1: "翌日確認（§1本質を見直し、§5問1を再解答）",
    day7: "1週間後（下書き型を白紙再現し、§5問2に挑戦）",
    day21: "3週間後（§7本質チェックリストと道場カードを最終確認）"
  };

  function defaultStateShape() {
    return {
      checks: {},
      reviews: {},
      notes: {},
      srs: {},
      mistakes: {},
      studyLog: {},
      cbtHistory: [],
      prefs: { drillMode: "input", cbtView: "single", sessionLimit: 10 },
      pastExamDone: {},
      pinnedCheats: [],
      theme: "light",
      focusCore: false,
      lastDocId: "G-00"
    };
  }

  function buildJournalProblemCache() {
    if (cachedJournalProblems) return;
    const drills = (DATA && DATA.drills) || [];
    const groups = [];
    const keyToGroup = new Map();
    drills.forEach((c) => {
      const k = (c.docId || "") + "||" + (c.questionTitle || c.section || "");
      if (!keyToGroup.has(k)) {
        const arr = [];
        keyToGroup.set(k, arr);
        groups.push(arr);
      }
      keyToGroup.get(k).push(c);
    });

    const problems = [];
    const cardMap = new Map();
    const docGroupIdx = {};

    groups.forEach((cards) => {
      const first = cards[0];
      const isIndependentExamList = first.part === "exam" && String(first.questionTitle || "").includes("第1問") && cards.length > 6;
      if (cards.length === 1 || isIndependentExamList) {
        cards.forEach((c) => {
          const prob = {
            id: c.id,
            isMulti: false,
            childIds: [c.id],
            docId: c.docId,
            docTitle: c.docTitle,
            part: c.part,
            line: c.line || [],
            section: c.section,
            questionTitle: c.questionTitle,
            questionBody: c.questionBody,
            explanation: c.explanation || "",
            entryCount: 1,
            entries: [{
              id: c.id,
              targetLabel: c.targetLabel || c.prompt || "1",
              focusLine: c.focusLine || "",
              rows: c.rows || []
            }]
          };
          problems.push(prob);
          cardMap.set(c.id, prob.id);
        });
      } else {
        const dId = first.docId || "DOC";
        const gNum = docGroupIdx[dId] || 0;
        docGroupIdx[dId] = gNum + 1;
        const probId = "PROB::" + dId + "::" + gNum;
        const prob = {
          id: probId,
          isMulti: true,
          childIds: cards.map((c) => c.id),
          docId: first.docId,
          docTitle: first.docTitle,
          part: first.part,
          line: first.line || [],
          section: first.section,
          questionTitle: first.questionTitle || first.section,
          questionBody: first.questionBody,
          explanation: cards.map((c) => c.explanation).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join("\n"),
          entryCount: cards.length,
          entries: cards.map((c) => ({
            id: c.id,
            targetLabel: c.targetLabel || c.prompt || "",
            focusLine: c.focusLine || "",
            rows: c.rows || []
          }))
        };
        problems.push(prob);
        cards.forEach((c) => cardMap.set(c.id, probId));
      }
    });

    cachedJournalProblems = problems;
    cachedCardToProbMap = cardMap;
  }

  function getJournalProblems() {
    buildJournalProblemCache();
    return cachedJournalProblems;
  }

  function getProblemIdForDrillCard(cardId) {
    buildJournalProblemCache();
    return cachedCardToProbMap.get(cardId) || cardId;
  }

  function migrateSrsState(st) {
    if (!st || typeof st !== "object") return st;
    if (!st.srs || typeof st.srs !== "object") st.srs = {};
    if (!st.mistakes || typeof st.mistakes !== "object") st.mistakes = {};
    if (!st.studyLog || typeof st.studyLog !== "object") st.studyLog = {};
    if (!Array.isArray(st.cbtHistory)) st.cbtHistory = [];
    st.prefs = Object.assign({ drillMode: "input", cbtView: "single", sessionLimit: 5 }, st.prefs || {});
    if (!st.reviews || typeof st.reviews !== "object") st.reviews = {};
    if (!st.checks || typeof st.checks !== "object") st.checks = {};
    if (!st.notes || typeof st.notes !== "object") st.notes = {};

    Object.keys(st.srs).forEach((id) => {
      const rec = st.srs[id];
      if (!rec || typeof rec !== "object") return;
      if (!rec.dueAt) {
        const baseMs = rec.updatedAt ? Date.parse(rec.updatedAt) : Date.now();
        const safeBase = Number.isFinite(baseMs) ? baseMs : Date.now();
        const lvl = Number(rec.level || 0);
        if (lvl <= 0) {
          st.srs[id] = {
            level: 0,
            reps: 0,
            intervalDays: 0,
            ease: 2.3,
            lapses: 1,
            updatedAt: rec.updatedAt || new Date(safeBase).toISOString(),
            dueAt: new Date(safeBase).toISOString()
          };
        } else if (lvl === 1) {
          st.srs[id] = {
            level: 1,
            reps: 1,
            intervalDays: 1,
            ease: 2.35,
            lapses: 0,
            updatedAt: rec.updatedAt || new Date(safeBase).toISOString(),
            dueAt: new Date(safeBase + 86400000).toISOString()
          };
        } else {
          st.srs[id] = {
            level: 2,
            reps: 2,
            intervalDays: 6,
            ease: 2.5,
            lapses: 0,
            updatedAt: rec.updatedAt || new Date(safeBase).toISOString(),
            dueAt: new Date(safeBase + 6 * 86400000).toISOString()
          };
        }
      } else {
        if (typeof rec.reps !== "number") rec.reps = rec.level >= 2 ? 2 : rec.level === 1 ? 1 : 0;
        if (typeof rec.intervalDays !== "number") rec.intervalDays = rec.level >= 2 ? 6 : rec.level === 1 ? 1 : 0;
        if (typeof rec.ease !== "number") rec.ease = 2.5;
        if (typeof rec.lapses !== "number") rec.lapses = rec.level === 0 ? 1 : 0;
      }
    });

    // Consolidate legacy per-entry child SRS & mistakes into parent problem IDs
    getJournalProblems().forEach((prob) => {
      if (!prob.isMulti) return;
      const childSrs = prob.childIds.map((cid) => st.srs[cid]).filter(Boolean);
      if (childSrs.length > 0) {
        const existing = st.srs[prob.id];
        const pool = existing ? [existing].concat(childSrs) : childSrs;
        let minLevel = 2;
        let minReps = 99;
        let minInterval = 9999;
        let minEase = 3.0;
        let sumLapses = existing ? (existing.lapses || 0) : 0;
        childSrs.forEach((r) => { sumLapses += r.lapses || 0; });
        let earliestDueMs = Infinity;
        let latestUpdMs = 0;
        pool.forEach((r) => {
          if (typeof r.level === "number") minLevel = Math.min(minLevel, r.level);
          if (typeof r.reps === "number") minReps = Math.min(minReps, r.reps);
          if (typeof r.intervalDays === "number") minInterval = Math.min(minInterval, r.intervalDays);
          if (typeof r.ease === "number") minEase = Math.min(minEase, r.ease);
          const dMs = r.dueAt ? Date.parse(r.dueAt) : NaN;
          if (Number.isFinite(dMs)) earliestDueMs = Math.min(earliestDueMs, dMs);
          const uMs = r.updatedAt ? Date.parse(r.updatedAt) : NaN;
          if (Number.isFinite(uMs)) latestUpdMs = Math.max(latestUpdMs, uMs);
        });
        st.srs[prob.id] = {
          level: minLevel,
          reps: minReps === 99 ? 0 : minReps,
          intervalDays: minInterval === 9999 ? 0 : minInterval,
          ease: minEase,
          lapses: sumLapses,
          updatedAt: new Date(latestUpdMs || Date.now()).toISOString(),
          dueAt: new Date(Number.isFinite(earliestDueMs) ? earliestDueMs : Date.now()).toISOString()
        };
        prob.childIds.forEach((cid) => { delete st.srs[cid]; });
      }

      const childMistakes = prob.childIds.map((cid) => st.mistakes[cid]).filter(Boolean);
      if (childMistakes.length > 0) {
        const cur = st.mistakes[prob.id] || { reasons: [], note: "", count: 0, lastWrongAt: "" };
        const reasonSet = new Set(cur.reasons || []);
        const notes = cur.note ? [cur.note] : [];
        let count = cur.count || 0;
        let lastWrongAt = cur.lastWrongAt || "";
        childMistakes.forEach((m) => {
          (m.reasons || []).forEach((r) => reasonSet.add(r));
          if (m.note && !notes.includes(m.note)) notes.push(m.note);
          count += m.count || 0;
          if (m.lastWrongAt && m.lastWrongAt > lastWrongAt) lastWrongAt = m.lastWrongAt;
        });
        st.mistakes[prob.id] = {
          reasons: Array.from(reasonSet),
          note: notes.join(" / "),
          count,
          lastWrongAt
        };
        prob.childIds.forEach((cid) => { delete st.mistakes[cid]; });
      }
    });

    return st;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return migrateSrsState(Object.assign(defaultStateShape(), parsed));
      }
    } catch (e) {}
    return defaultStateShape();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function getTodayKey(dateObj) {
    const d = dateObj || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function recordStudyActivity(kind, isCorrect) {
    const key = getTodayKey();
    if (!state.studyLog[key]) {
      state.studyLog[key] = { reviews: 0, correct: 0, units: 0, cbt: 0 };
    }
    const row = state.studyLog[key];
    if (kind === "review") {
      row.reviews = (row.reviews || 0) + 1;
      if (isCorrect) row.correct = (row.correct || 0) + 1;
    } else if (kind === "unit") {
      row.units = (row.units || 0) + 1;
    } else if (kind === "cbt") {
      row.cbt = (row.cbt || 0) + 1;
    }
  }

  function getStreakDays() {
    let streak = 0;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const hasActivity = (key) => {
      const r = state.studyLog && state.studyLog[key];
      return !!(r && ((r.reviews || 0) + (r.units || 0) + (r.cbt || 0)) > 0);
    };
    if (!hasActivity(getTodayKey(d))) {
      d.setDate(d.getDate() - 1);
    }
    while (hasActivity(getTodayKey(d))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  function previewSm2Interval(rec, quality) {
    const prevReps = rec && typeof rec.reps === "number" ? rec.reps : 0;
    const prevInterval = rec && typeof rec.intervalDays === "number" ? rec.intervalDays : 0;
    const prevEase = rec && typeof rec.ease === "number" ? rec.ease : 2.5;
    let reps = prevReps;
    let intervalDays = 0;
    let ease = prevEase;
    if (quality === 0) {
      reps = 0;
      intervalDays = 0;
      ease = Math.max(1.3, Number((prevEase - 0.2).toFixed(2)));
    } else if (quality === 1) {
      reps = Math.max(1, prevReps);
      intervalDays = prevReps <= 1 ? 1 : Math.max(1, Math.round(prevInterval * 1.2));
      ease = Math.max(1.3, Number((prevEase - 0.15).toFixed(2)));
    } else if (quality === 2) {
      reps = prevReps + 1;
      if (reps === 1) intervalDays = 1;
      else if (reps === 2) intervalDays = 6;
      else intervalDays = Math.max(1, Math.round(prevInterval * prevEase));
    } else {
      reps = prevReps + 1;
      if (reps === 1) intervalDays = 4;
      else if (reps === 2) intervalDays = 10;
      else intervalDays = Math.max(2, Math.round(prevInterval * prevEase * 1.3));
      ease = Math.min(3.0, Number((prevEase + 0.15).toFixed(2)));
    }
    const level = quality === 0 ? 0 : quality === 1 ? 1 : 2;
    const label = intervalDays === 0 ? "今日" : intervalDays + "日後";
    return { reps, intervalDays, ease, level, label };
  }

  function recordSrsReview(cardId, quality, elapsedSec) {
    const prev = state.srs[cardId];
    const next = previewSm2Interval(prev, quality);
    const nowMs = Date.now();
    const dueMs = next.intervalDays === 0 ? nowMs : nowMs + next.intervalDays * 86400000;
    const prevLapses = prev && typeof prev.lapses === "number" ? prev.lapses : 0;
    state.srs[cardId] = {
      level: next.level,
      reps: next.reps,
      intervalDays: next.intervalDays,
      ease: next.ease,
      lapses: quality === 0 ? prevLapses + 1 : prevLapses,
      lastSec: typeof elapsedSec === "number" ? Math.round(elapsedSec) : (prev && prev.lastSec) || undefined,
      updatedAt: new Date(nowMs).toISOString(),
      dueAt: new Date(dueMs).toISOString()
    };
    recordStudyActivity("review", quality >= 2);
    saveState();
    updateDueBadge();
    renderSidebar();
    return state.srs[cardId];
  }

  function isCardDue(cardId, nowMs) {
    const rec = state.srs[cardId];
    if (!rec) return false;
    if (!rec.dueAt) return true;
    const ts = Date.parse(rec.dueAt);
    return !Number.isFinite(ts) || ts <= (nowMs || Date.now());
  }

  function isCardLeech(cardId) {
    const rec = state.srs[cardId];
    return !!(rec && (rec.lapses >= 2 || rec.level === 0));
  }

  function getUnitReviewStatus(doc, nowMs) {
    const r = (state.reviews && state.reviews[doc.id]) || {};
    const stages = ["day0", "day1", "day7", "day21"];
    const completedStages = stages.filter((k) => !!r[k]).length;
    const curNow = nowMs || Date.now();
    let nextStage = null;
    let prevTs = null;
    let waitDays = 0;
    if (!r.day0) {
      nextStage = "day0";
    } else if (!r.day1) {
      nextStage = "day1";
      prevTs = r.day0;
      waitDays = 1;
    } else if (!r.day7) {
      nextStage = "day7";
      prevTs = r.day1;
      waitDays = 6;
    } else if (!r.day21) {
      nextStage = "day21";
      prevTs = r.day7;
      waitDays = 14;
    }
    let dueAtMs = null;
    let isDue = false;
    let daysUntil = null;
    let daysElapsed = 0;
    if (nextStage && nextStage !== "day0") {
      const baseMs = typeof prevTs === "string" ? Date.parse(prevTs) : NaN;
      if (Number.isFinite(baseMs)) {
        dueAtMs = baseMs + waitDays * 86400000;
        isDue = curNow >= dueAtMs;
        daysElapsed = Math.max(0, Math.floor((curNow - baseMs) / 86400000));
        daysUntil = Math.ceil((dueAtMs - curNow) / 86400000);
      } else {
        isDue = true;
      }
    }
    const labels = { day0: "Day 0", day1: "Day 1", day7: "Day 7", day21: "Day 21" };
    return {
      completedStages,
      nextStage,
      nextLabel: nextStage ? labels[nextStage] : "全段階完了",
      dueAtMs,
      isDue,
      daysElapsed,
      daysUntil,
      guide: nextStage ? REVIEW_STAGE_GUIDE[nextStage] : "全ステージ完了。模試・過去問で実戦確認しましょう。"
    };
  }

  function getDueSummary(nowMs) {
    const curNow = nowMs || Date.now();
    const dueJournal = getJournalProblems().filter((p) => isCardDue(p.id, curNow));
    const dueCalc = (DATA.calcDrills || []).filter((c) => isCardDue(c.id, curNow));
    const dueTheory = (DATA.theoryDrills || []).filter((c) => isCardDue(c.id, curNow));
    const allDueCards = [
      ...dueJournal.map((p) => ({ kind: "journal", card: p })),
      ...dueCalc.map((c) => ({ kind: "calc", card: c })),
      ...dueTheory.map((c) => ({ kind: "theory", card: c }))
    ];
    const units = (DATA.items || []).filter((it) => it.part !== "guide" && it.available);
    const dueUnits = units
      .map((u) => ({ doc: u, status: getUnitReviewStatus(u, curNow) }))
      .filter((x) => x.status.nextStage && x.status.nextStage !== "day0" && x.status.isDue);
    return {
      dueJournal,
      dueCalc,
      dueTheory,
      allDueCards,
      dueUnits,
      totalDue: allDueCards.length + dueUnits.length
    };
  }

  function updateDueBadge() {
    const badge = document.getElementById("drillDueBadge");
    if (!badge) return;
    const { totalDue } = getDueSummary();
    if (totalDue > 0) {
      badge.textContent = totalDue > 99 ? "99+" : String(totalDue);
      badge.classList.remove("hidden");
      badge.setAttribute("aria-label", "今日の復習 " + totalDue + "件");
    } else {
      badge.textContent = "";
      badge.classList.add("hidden");
    }
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

    // 3. Add flashcard mask toolbars & semantic mobile card tags to journal tables
    body.querySelectorAll("table.journal-table").forEach((tbl) => {
      const wrap = tbl.closest(".table-wrap");
      const headers = Array.from(tbl.querySelectorAll("thead th")).map((th) => th.textContent.trim());
      const dSubIdx = headers.indexOf("借方科目");
      const dAmtIdx = headers.indexOf("借方金額");
      const cSubIdx = headers.indexOf("貸方科目");
      const cAmtIdx = headers.indexOf("貸方金額");

      if (dSubIdx >= 0 && dAmtIdx >= 0 && cSubIdx >= 0 && cAmtIdx >= 0) {
        tbl.classList.add("jt-has-cards");
        const minAccountIdx = Math.min(dSubIdx, cSubIdx);
        tbl.querySelectorAll("tbody tr").forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll("td"));
          const rowText = cells.map((c) => c.textContent.trim()).join(" ");
          if (/^(合計|計)\b|合計/.test(cells[0]?.textContent.trim() || "") || rowText.includes("合計")) {
            tr.classList.add("jt-total-row");
          }
          cells.forEach((td, idx) => {
            const lbl = headers[idx] || "";
            if (lbl) td.setAttribute("data-col-label", lbl);
            if (idx === dSubIdx) td.classList.add("jt-dsub");
            else if (idx === dAmtIdx) td.classList.add("jt-damt");
            else if (idx === cSubIdx) td.classList.add("jt-csub");
            else if (idx === cAmtIdx) td.classList.add("jt-camt");
            else if (idx < minAccountIdx) td.classList.add("jt-meta");
            else td.classList.add("jt-extra");
          });
        });
      }

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
    const isDone = doneCount >= totalCount;
    banner.classList.toggle("visible", isDone);
    if (!isDone) return;
    const hasDay0 = !!(state.reviews[doc.id] && state.reviews[doc.id].day0);
    if (!hasDay0 && doc.part !== "guide") {
      banner.innerHTML =
        '<span>この単元の本質チェックリストを全項目クリアしました。</span>' +
        '<button type="button" class="primary-btn banner-day0-btn" id="bannerMarkDay0Btn">Day 0 を記録して復習予約</button>';
      const btn = document.getElementById("bannerMarkDay0Btn");
      if (btn) {
        btn.onclick = () => {
          toggleDocReviewStage(doc.id, "day0", true);
          updateMasterBanner(doc, totalCount);
        };
      }
    } else {
      banner.textContent = "この単元の本質チェックリストを全項目クリアしました。Day 1 / Day 7 復習へ進みましょう。";
    }
  }

  function toggleDocReviewStage(docId, dayKey, forceTrue) {
    if (!docId) return;
    if (!state.reviews[docId]) state.reviews[docId] = {};
    const nextVal = forceTrue ? new Date().toISOString() : (state.reviews[docId][dayKey] ? false : new Date().toISOString());
    state.reviews[docId][dayKey] = nextVal;
    if (nextVal) recordStudyActivity("unit");
    saveState();
    const tracker = document.getElementById("reviewTracker");
    if (tracker && currentDocId === docId) {
      tracker.querySelectorAll(".day-btn").forEach((btn) => {
        btn.classList.toggle("done", !!state.reviews[docId][btn.dataset.day]);
      });
    }
    const curDoc = DATA.items.find((it) => it.id === docId);
    if (curDoc && currentDocId === docId) renderDocBottomReviewBar(curDoc);
    updateDueBadge();
    renderSidebar();
  }

  function renderDocBottomReviewBar(doc) {
    const el = document.getElementById("docBottomReviewBar");
    if (!el) return;
    if (!doc || !doc.available || doc.part === "guide") {
      el.classList.add("hidden");
      el.innerHTML = "";
      return;
    }
    const status = getUnitReviewStatus(doc);
    const docRev = state.reviews[doc.id] || {};
    const jProblems = getJournalProblems().filter((p) => p.docId === doc.id);
    const jCount = jProblems.length;
    const jEntries = jProblems.reduce((sum, p) => sum + p.entryCount, 0);
    const cCount = (DATA.calcDrills || []).filter((c) => c.docId === doc.id).length;
    const drillTotal = jCount + cCount;
    const drillBtnLabel = jCount > 0 && jEntries > jCount
      ? "この単元の道場（" + drillTotal + "問・" + jEntries + "仕訳）を解く"
      : "この単元の道場（" + drillTotal + "問）を解く";

    let dueLine = "";
    if (status.nextStage === "day0") {
      dueLine = "未記録 — 読了したら Day 0 を押して翌日（Day 1）復習を予約しましょう。";
    } else if (!status.nextStage) {
      dueLine = "全ステージ（Day 0〜21）完了済み。";
    } else if (status.isDue) {
      dueLine = status.nextLabel + " の復習期限が到来しています（経過 " + status.daysElapsed + "日）。";
    } else {
      const dueStr = status.dueAtMs ? getTodayKey(new Date(status.dueAtMs)) : "";
      dueLine = "次回予定：" + status.nextLabel + "（" + dueStr + "）";
    }

    const stages = [
      { key: "day0", label: "Day 0" },
      { key: "day1", label: "Day 1" },
      { key: "day7", label: "Day 7" },
      { key: "day21", label: "Day 21" }
    ];

    el.classList.remove("hidden");
    el.innerHTML =
      '<div class="doc-bottom-head">' +
      '<div><div class="doc-bottom-title">この単元の分散復習＆演習</div>' +
      '<div class="doc-bottom-sub">' + escapeHtml(dueLine) + "</div>" +
      '<div class="doc-bottom-guide">' + escapeHtml(status.guide) + "</div></div>" +
      (drillTotal > 0
        ? '<button type="button" class="primary-btn" id="bottomUnitDojoBtn">' + escapeHtml(drillBtnLabel) + "</button>"
        : "") +
      "</div>" +
      '<div class="doc-bottom-days">' +
      stages.map((st) => '<button type="button" class="day-btn' + (docRev[st.key] ? " done" : "") + '" data-bottom-day="' + st.key + '">' + st.label + "</button>").join("") +
      "</div>";

    el.querySelectorAll("[data-bottom-day]").forEach((btn) => {
      btn.onclick = () => toggleDocReviewStage(doc.id, btn.dataset.bottomDay, false);
    });
    const dojoBtn = document.getElementById("bottomUnitDojoBtn");
    if (dojoBtn) {
      dojoBtn.onclick = () => {
        if (window.BokiStudioTools && typeof window.BokiStudioTools.openUnitDojo === "function") {
          window.BokiStudioTools.openUnitDojo(doc.id);
        }
      };
    }
  }

  function isDocMastered(doc) {
    if (!doc.available || doc.part === "guide") return false;
    const chkMatches = doc.markdown.match(/^- \[ \]/gm);
    if (!chkMatches || chkMatches.length === 0) return false;
    const arr = state.checks[doc.id] || [];
    return arr.filter(Boolean).length >= chkMatches.length;
  }

  function syncMobileTocButtonVisibility() {
    const tocBtn = document.getElementById("mobileTocBtn");
    if (!tocBtn) return;
    const hasLinks = (document.getElementById("mobileTocNav")?.children.length || 0) > 0;
    tocBtn.classList.toggle("hidden", studioMode !== "reader" || !hasLinks);
  }

  function renderTOC() {
    const toc = document.getElementById("tocNav");
    const mobileToc = document.getElementById("mobileTocNav");
    toc.innerHTML = "";
    if (mobileToc) mobileToc.innerHTML = "";
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

      if (mobileToc) {
        const ma = document.createElement("a");
        ma.className = "mobile-toc-link" + (h.nodeName === "H3" ? " is-sub" : "");
        ma.href = "#" + id;
        ma.textContent = h.textContent;
        ma.addEventListener("click", (e) => {
          e.preventDefault();
          closeAllOverlays();
          h.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        mobileToc.appendChild(ma);
      }
    });
    syncMobileTocButtonVisibility();
  }

  function renderSidebar() {
    const nav = document.getElementById("sidebarNav");
    const q = document.getElementById("searchInput").value.trim().toLowerCase();
    const onlyAvail = document.getElementById("onlyAvailableChk").checked;
    const onlyDueChk = document.getElementById("onlyDueReviewChk");
    const onlyDue = !!(onlyDueChk && onlyDueChk.checked);
    const nowMs = Date.now();
    nav.innerHTML = "";

    const unitWeakCardCount = (docId) => {
      let n = 0;
      getJournalProblems().forEach((p) => {
        if (p.docId === docId && (isCardDue(p.id, nowMs) || isCardLeech(p.id))) n++;
      });
      (DATA.calcDrills || []).forEach((c) => {
        if (c.docId === docId && (isCardDue(c.id, nowMs) || isCardLeech(c.id))) n++;
      });
      return n;
    };

    const groups = navMode === "part" ? DATA.parts : DATA.lines;
    groups.forEach((g) => {
      const items = DATA.items.filter((it) => {
        const inGroup = navMode === "part" ? it.part === g.id : it.line.includes(g.id);
        if (!inGroup) return false;
        if (onlyAvail && !it.available) return false;
        if (onlyDue) {
          const st = it.part !== "guide" && it.available ? getUnitReviewStatus(it, nowMs) : null;
          const unitDue = !!(st && st.nextStage && st.nextStage !== "day0" && st.isDue);
          const cardDue = unitWeakCardCount(it.id) > 0;
          if (!unitDue && !cardDue) return false;
        }
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
        const st = it.part !== "guide" && it.available ? getUnitReviewStatus(it, nowMs) : null;
        if (st && st.nextStage && st.nextStage !== "day0" && st.isDue) {
          badges += '<span class="review-dot is-due" title="単元復習の期限到来"></span>';
        } else if (unitWeakCardCount(it.id) > 0) {
          badges += '<span class="review-dot is-weak" title="道場に復習・要強化カードあり"></span>';
        }
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

  function markScrollableContainers() {
    requestAnimationFrame(() => {
      document.querySelectorAll(".table-wrap, .cheat-table-wrap, .ascii-diagram, .concept-svg-card, .math-block").forEach((el) => {
        if (el.offsetParent === null) return;
        const canScroll = el.scrollWidth > el.clientWidth + 4;
        el.dataset.scrollable = canScroll ? "true" : "false";
      });
    });
  }

  let readingProgressRaf = null;
  function updateReadingProgress() {
    if (readingProgressRaf) return;
    readingProgressRaf = requestAnimationFrame(() => {
      readingProgressRaf = null;
      const bar = document.getElementById("readingProgressBar");
      if (!bar) return;
      if (studioMode !== "reader") {
        bar.style.width = "0%";
        return;
      }
      const docEl = document.documentElement;
      const maxScroll = Math.max(0, docEl.scrollHeight - window.innerHeight);
      const pct = maxScroll > 0 ? Math.min(100, Math.max(0, (window.scrollY / maxScroll) * 100)) : 0;
      bar.style.width = pct.toFixed(1) + "%";
    });
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
    markScrollableContainers();
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
    const tocSheet = document.getElementById("mobileTocSheet");
    const tocBtn = document.getElementById("mobileTocBtn");
    if (sb) sb.classList.remove("open");
    if (mBtn) mBtn.setAttribute("aria-expanded", "false");
    if (menu) menu.classList.add("hidden");
    if (tBtn) tBtn.setAttribute("aria-expanded", "false");
    if (tocSheet) tocSheet.classList.add("hidden");
    if (tocBtn) tocBtn.setAttribute("aria-expanded", "false");
    document.querySelectorAll(".floating-panel").forEach((p) => p.classList.add("hidden"));
    syncBackdrop();
  }

  function syncBackdrop() {
    const sbOpen = document.getElementById("sidebar")?.classList.contains("open");
    const toolsOpen = !document.getElementById("toolsMenu")?.classList.contains("hidden");
    const tocOpen = !document.getElementById("mobileTocSheet")?.classList.contains("hidden");
    const panelOpen = Array.from(document.querySelectorAll(".floating-panel")).some((p) => !p.classList.contains("hidden"));
    const bd = document.getElementById("sidebarBackdrop");
    const isMobile = window.matchMedia("(max-width: 820px)").matches;
    const show = sbOpen || (isMobile && (toolsOpen || tocOpen || panelOpen));
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
    syncMobileTocButtonVisibility();
    closeAllOverlays();
    if (window.BokiStudioTools && typeof window.BokiStudioTools.onModeChange === "function") {
      window.BokiStudioTools.onModeChange(studioMode);
    }
    markScrollableContainers();
    window.scrollTo({ top: 0, behavior: "instant" });
    updateReadingProgress();
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
      },
      "PR-01": {
        title: "月次決算クリティカルパス（日次POS消込 → 仮締 → 本締）",
        svg: '<svg viewBox="0 0 680 155" class="concept-svg" role="img" aria-label="月次決算フロー図"><rect x="14" y="26" width="142" height="102" rx="4" fill="var(--surface)" stroke="var(--border-strong)"/><text x="85" y="54" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--text)">第1〜2営業日</text><text x="85" y="80" text-anchor="middle" font-size="11.5" fill="var(--text-muted)">銀行API・POS・PSP</text><text x="85" y="102" text-anchor="middle" font-size="11.5" fill="var(--text-muted)">明細突合・消込</text><rect x="182" y="26" width="146" height="102" rx="4" fill="var(--surface-alt)" stroke="var(--border-strong)"/><text x="255" y="54" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--text)">第3〜4営業日</text><text x="255" y="80" text-anchor="middle" font-size="11.5" fill="var(--text-muted)">未着請求の概算計上</text><text x="255" y="102" text-anchor="middle" font-size="11.5" fill="var(--text-muted)">給与・償却・棚卸確定</text><rect x="354" y="26" width="146" height="102" rx="4" fill="var(--amber-soft)" stroke="var(--amber)"/><text x="427" y="54" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--amber)">第5〜6営業日</text><text x="427" y="80" text-anchor="middle" font-size="11.5" fill="var(--text)">仮締・粗利率分析</text><text x="427" y="102" text-anchor="middle" font-size="11.5" fill="var(--text-muted)">異常値調査・承認</text><rect x="526" y="26" width="140" height="102" rx="4" fill="var(--emerald-soft)" stroke="var(--emerald)"/><text x="596" y="54" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--emerald)">第7〜10営業日</text><text x="596" y="80" text-anchor="middle" font-size="11.5" fill="var(--text)">本締・経営会議</text><text x="596" y="102" text-anchor="middle" font-size="11.5" fill="var(--text-muted)">資金繰り表・予実報告</text><path d="M156 77 L182 77 M328 77 L354 77 M500 77 L526 77" stroke="var(--text-muted)" stroke-width="1.5" fill="none"/></svg>'
      },
      "PR-04": {
        title: "ROE デュポン3要素分解と CCC 資金循環構造",
        svg: '<svg viewBox="0 0 680 165" class="concept-svg" role="img" aria-label="ROEデュポン分解図"><rect x="16" y="22" width="190" height="118" rx="4" fill="var(--emerald-soft)" stroke="var(--emerald)"/><text x="111" y="50" text-anchor="middle" font-size="13" font-weight="700" fill="var(--emerald)">① 売上高純利益率</text><text x="111" y="78" text-anchor="middle" font-size="12" fill="var(--text)">当期純利益 ÷ 売上高</text><text x="111" y="108" text-anchor="middle" font-size="11.5" fill="var(--text-muted)">価格決定力・原価管理</text><text x="224" y="86" text-anchor="middle" font-size="18" font-weight="700" fill="var(--text)">×</text><rect x="242" y="22" width="196" height="118" rx="4" fill="var(--surface-alt)" stroke="var(--text)"/><text x="340" y="50" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">② 総資産回転率</text><text x="340" y="78" text-anchor="middle" font-size="12" fill="var(--text)">売上高 ÷ 総資産</text><text x="340" y="108" text-anchor="middle" font-size="11.5" fill="var(--text-muted)">CCC圧縮・在庫/売掛回転</text><text x="456" y="86" text-anchor="middle" font-size="18" font-weight="700" fill="var(--text)">×</text><rect x="474" y="22" width="190" height="118" rx="4" fill="var(--amber-soft)" stroke="var(--amber)"/><text x="569" y="50" text-anchor="middle" font-size="13" font-weight="700" fill="var(--amber)">③ 財務レバレッジ</text><text x="569" y="78" text-anchor="middle" font-size="12" fill="var(--text)">総資産 ÷ 自己資本</text><text x="569" y="108" text-anchor="middle" font-size="11.5" fill="var(--text-muted)">借入余力と安全性(D/E)</text></svg>'
      },
      "PR-06": {
        title: "日本の会計3法トライアングル体制と 2027年改定接続",
        svg: '<svg viewBox="0 0 680 165" class="concept-svg" role="img" aria-label="3法トライアングル図"><rect x="200" y="14" width="280" height="54" rx="4" fill="var(--surface-alt)" stroke="var(--text)" stroke-width="1.2"/><text x="340" y="38" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">金融商品取引法（投資家保護）</text><text x="340" y="56" text-anchor="middle" font-size="11" fill="var(--text-muted)">連結F/S・IFRS統合(29/34号)・J-SOX</text><rect x="20" y="96" width="280" height="54" rx="4" fill="var(--emerald-soft)" stroke="var(--emerald)"/><text x="160" y="120" text-anchor="middle" font-size="13" font-weight="700" fill="var(--emerald)">会社法（債権者保護）</text><text x="160" y="138" text-anchor="middle" font-size="11" fill="var(--text-muted)">単体計算書類・分配可能額規制</text><rect x="380" y="96" width="280" height="54" rx="4" fill="var(--amber-soft)" stroke="var(--amber)"/><text x="520" y="120" text-anchor="middle" font-size="13" font-weight="700" fill="var(--amber)">法人税法（公平な徴税）</text><text x="520" y="138" text-anchor="middle" font-size="11" fill="var(--text-muted)">確定決算主義・別表四 → 税効果会計</text><path d="M255 68 L185 96 M425 68 L495 96 M300 123 L380 123" stroke="var(--border-strong)" stroke-width="1.75" fill="none"/></svg>'
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
    box.tabIndex = 0;
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

    renderDocBottomReviewBar(doc);
    renderTOC();
    renderSidebar();
    updateProgress();
    updateDueBadge();
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

    const mobileTocBtn = document.getElementById("mobileTocBtn");
    const mobileTocSheet = document.getElementById("mobileTocSheet");
    if (mobileTocBtn && mobileTocSheet) {
      mobileTocBtn.onclick = () => {
        const willOpen = mobileTocSheet.classList.contains("hidden");
        closeAllOverlays();
        mobileTocSheet.classList.toggle("hidden", !willOpen);
        mobileTocBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
        syncBackdrop();
      };
    }

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
    const onlyDueChk = document.getElementById("onlyDueReviewChk");
    if (onlyDueChk) onlyDueChk.addEventListener("change", renderSidebar);

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
      document.getElementById("mobileTocSheet")?.classList.add("hidden");
      document.getElementById("timerPanel").classList.toggle("hidden");
      syncBackdrop();
    };
    document.getElementById("scratchToggleBtn").onclick = () => {
      closeToolsMenu();
      document.getElementById("timerPanel")?.classList.add("hidden");
      document.getElementById("syncPanel")?.classList.add("hidden");
      document.getElementById("mobileTocSheet")?.classList.add("hidden");
      document.getElementById("scratchPanel").classList.toggle("hidden");
      syncBackdrop();
    };
    document.querySelectorAll(".panel-close").forEach((btn) => {
      btn.onclick = () => {
        document.getElementById(btn.dataset.close)?.classList.add("hidden");
        if (btn.dataset.close === "mobileTocSheet") {
          document.getElementById("mobileTocBtn")?.setAttribute("aria-expanded", "false");
        }
        syncBackdrop();
      };
    });

    document.getElementById("reviewTracker").querySelectorAll(".day-btn").forEach((btn) => {
      btn.onclick = () => toggleDocReviewStage(currentDocId, btn.dataset.day, false);
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
          Object.assign(state, defaultStateShape(), imported);
          migrateSrsState(state);
          saveState();
          updateDueBadge();
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
        syncBackdrop();
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
          Object.assign(state, defaultStateShape(), parsed);
          migrateSrsState(state);
          saveState();
          updateDueBadge();
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
    updateDueBadge();

    window.addEventListener("scroll", updateReadingProgress, { passive: true });
    window.addEventListener("resize", markScrollableContainers, { passive: true });

    window.BokiStudio = {
      DATA,
      state,
      saveState,
      openDoc,
      switchStudioMode,
      isDocMastered,
      updateProgress,
      markScrollableContainers,
      escapeHtml,
      getStudioMode: () => studioMode,
      MISTAKE_REASONS,
      REVIEW_STAGE_GUIDE,
      migrateSrsState,
      getTodayKey,
      recordStudyActivity,
      getStreakDays,
      previewSm2Interval,
      recordSrsReview,
      isCardDue,
      isCardLeech,
      getUnitReviewStatus,
      getDueSummary,
      updateDueBadge,
      toggleDocReviewStage,
      renderDocBottomReviewBar,
      getJournalProblems,
      getProblemIdForDrillCard,
      renderSidebar
    };
  }

  init();
})();
