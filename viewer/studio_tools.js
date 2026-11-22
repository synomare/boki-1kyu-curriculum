(function () {
  "use strict";

  const studio = window.BokiStudio;
  if (!studio) return;

  const { DATA, state, saveState, openDoc, switchStudioMode, isDocMastered, escapeHtml } = studio;
  if (!state.srs) state.srs = {};

  const fmtYen = (n) => Math.round(n).toLocaleString("ja-JP") + "円";
  const fmtNum = (n, d = 0) =>
    Number(n).toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });

  /* =========================================================================
   * 1. JOURNAL DRILL DOJO v2 (⚔️ 仕訳道場：入力自動採点 & 高速フラッシュ)
   * ========================================================================= */
  const drillState = {
    mode: "input", // "input" | "flash"
    part: "all",
    queueMode: "all", // "all" | "unmastered" | "weak"
    docFilter: "",
    deck: [],
    idx: 0,
    revealStep: 0, // flash mode: 0 hidden, 1 subjects, 2 full
    inputRows: [{ dSub: "", dAmt: "", cSub: "", cAmt: "" }, { dSub: "", dAmt: "", cSub: "", cAmt: "" }],
    showHint: false,
    gradeResult: null, // null | { status: "perfect"|"partial"|"wrong", message, dUserSum, cUserSum }
    lastFocusedCell: { row: 0, field: "dSub" },
    blitzActive: false,
    blitzTotal: 10,
    blitzCount: 0,
    blitzScore: 0,
    blitzSec: 0,
    blitzTimer: null
  };

  function normalizeSubject(s) {
    return String(s || "")
      .replace(/[\s\u3000]+/g, "")
      .replace(/（/g, "(")
      .replace(/）/g, ")")
      .trim();
  }

  function parseInputAmount(s) {
    const half = String(s || "").replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
    const cleaned = half.replace(/[,円\s\u3000]/g, "");
    if (!cleaned || !/^-?\d+$/.test(cleaned)) return 0;
    return parseInt(cleaned, 10);
  }

  function resetInputForCard() {
    drillState.inputRows = [
      { dSub: "", dAmt: "", cSub: "", cAmt: "" },
      { dSub: "", dAmt: "", cSub: "", cAmt: "" }
    ];
    drillState.showHint = false;
    drillState.gradeResult = null;
    drillState.lastFocusedCell = { row: 0, field: "dSub" };
  }

  function formatInlineMd(text) {
    let s = escapeHtml(String(text || ""));
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return s;
  }

  function formatQuestionBodyHtml(body, focusLine) {
    const lines = String(body || "").split(/\r?\n/);
    const focusNorm = (focusLine || "").trim();
    return lines
      .map((line) => {
        const t = line.trim();
        if (!t) return '<div class="dq-spacer"></div>';
        if (focusNorm && t === focusNorm) {
          return '<div class="dq-line dq-focus-line">' + formatInlineMd(t) + "</div>";
        }
        return '<div class="dq-line">' + formatInlineMd(t) + "</div>";
      })
      .join("");
  }

  function buildSubjectPalette(card) {
    const correctSet = new Set();
    card.rows.forEach((r) => {
      if (r.dSub) correctSet.add(r.dSub);
      if (r.cSub) correctSet.add(r.cSub);
    });
    const partPool = new Set();
    (DATA.drills || []).forEach((c) => {
      if (c.part === card.part) {
        c.rows.forEach((r) => {
          if (r.dSub) partPool.add(r.dSub);
          if (r.cSub) partPool.add(r.cSub);
        });
      }
    });
    const distractors = Array.from(partPool).filter((s) => !correctSet.has(s));
    // Deterministic shuffle based on card.id
    let seed = 0;
    for (let i = 0; i < card.id.length; i++) seed = (seed * 31 + card.id.charCodeAt(i)) >>> 0;
    const seededRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = distractors.length - 1; i > 0; i--) {
      const j = Math.floor(seededRand() * (i + 1));
      const tmp = distractors[i];
      distractors[i] = distractors[j];
      distractors[j] = tmp;
    }
    const combined = Array.from(correctSet).concat(distractors.slice(0, Math.max(4, 10 - correctSet.size)));
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(seededRand() * (i + 1));
      const tmp = combined[i];
      combined[i] = combined[j];
      combined[j] = tmp;
    }
    return combined;
  }

  function extractMultisets(rows, isUser) {
    const dPairs = [];
    const cPairs = [];
    let dSum = 0;
    let cSum = 0;
    rows.forEach((r) => {
      const ds = normalizeSubject(r.dSub);
      const da = parseInputAmount(r.dAmt);
      if (ds || (isUser && da > 0)) {
        dPairs.push({ sub: ds, amt: da });
        dSum += da;
      }
      const cs = normalizeSubject(r.cSub);
      const ca = parseInputAmount(r.cAmt);
      if (cs || (isUser && ca > 0)) {
        cPairs.push({ sub: cs, amt: ca });
        cSum += ca;
      }
    });
    const sortFn = (a, b) => (a.sub < b.sub ? -1 : a.sub > b.sub ? 1 : a.amt - b.amt);
    dPairs.sort(sortFn);
    cPairs.sort(sortFn);
    return { dPairs, cPairs, dSum, cSum };
  }

  function evaluateUserJournal(card) {
    const user = extractMultisets(drillState.inputRows, true);
    const ans = extractMultisets(card.rows, false);

    if (user.dPairs.length === 0 && user.cPairs.length === 0) {
      drillState.gradeResult = {
        status: "wrong",
        message: "借方・貸方の勘定科目と金額を入力してください。",
        dUserSum: 0,
        cUserSum: 0
      };
      renderDrillView();
      return;
    }

    const pairsEqual = (a, b) =>
      a.length === b.length && a.every((x, idx) => x.sub === b[idx].sub && x.amt === b[idx].amt);
    const subsEqual = (a, b) => {
      const sa = a.map((x) => x.sub).filter(Boolean).sort();
      const sb = b.map((x) => x.sub).filter(Boolean).sort();
      return sa.length === sb.length && sa.every((x, idx) => x === sb[idx]);
    };

    const exactMatch = pairsEqual(user.dPairs, ans.dPairs) && pairsEqual(user.cPairs, ans.cPairs);
    const subMatch = subsEqual(user.dPairs, ans.dPairs) && subsEqual(user.cPairs, ans.cPairs);

    let level = 0;
    if (exactMatch) {
      level = 2;
      drillState.gradeResult = {
        status: "perfect",
        message: "🎉 完全正解！科目・金額・貸借すべて一致しています。",
        dUserSum: user.dSum,
        cUserSum: user.cSum
      };
    } else if (subMatch) {
      level = 1;
      drillState.gradeResult = {
        status: "partial",
        message: "🟡 惜しい！勘定科目は完全一致ですが、金額または貸借の配分を見直しましょう。",
        dUserSum: user.dSum,
        cUserSum: user.cSum
      };
    } else {
      level = 0;
      drillState.gradeResult = {
        status: "wrong",
        message: "🔴 不正解（要復習）。下の模範仕訳と「誤答パターン分析」を確認しましょう。",
        dUserSum: user.dSum,
        cUserSum: user.cSum
      };
    }

    state.srs[card.id] = { level, updatedAt: new Date().toISOString() };
    saveState();

    if (drillState.blitzActive) {
      drillState.blitzCount++;
      if (level === 2) drillState.blitzScore++;
    }
    renderDrillView();
  }

  function getFilteredDrills() {
    const all = DATA.drills || [];
    return all.filter((c) => {
      if (drillState.part !== "all" && c.part !== drillState.part) return false;
      if (drillState.docFilter && c.docId !== drillState.docFilter) return false;
      const rec = state.srs[c.id];
      const lvl = rec ? rec.level : 0;
      if (drillState.queueMode === "unmastered" && lvl >= 2) return false;
      if (drillState.queueMode === "weak" && !(rec && lvl === 0)) return false;
      return true;
    });
  }

  function rebuildDeck(shuffleIt = false) {
    let list = getFilteredDrills().slice();
    if (shuffleIt) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
      }
    }
    drillState.deck = list;
    drillState.idx = 0;
    drillState.revealStep = 0;
    resetInputForCard();
  }

  function stopBlitz() {
    if (drillState.blitzTimer) {
      clearInterval(drillState.blitzTimer);
      drillState.blitzTimer = null;
    }
    drillState.blitzActive = false;
  }

  function startBlitz() {
    stopBlitz();
    rebuildDeck(true);
    if (drillState.deck.length === 0) return;
    drillState.deck = drillState.deck.slice(0, Math.min(10, drillState.deck.length));
    drillState.blitzActive = true;
    drillState.blitzTotal = drillState.deck.length;
    drillState.blitzCount = 0;
    drillState.blitzScore = 0;
    drillState.blitzSec = 0;
    drillState.blitzTimer = setInterval(() => {
      drillState.blitzSec++;
      const el = document.getElementById("blitzTimerBadge");
      if (el) el.textContent = "⏱ " + drillState.blitzSec + "秒";
    }, 1000);
    renderDrillView();
  }

  function showBlitzSummary() {
    const elapsed = drillState.blitzSec;
    const score = drillState.blitzScore;
    const total = drillState.blitzTotal;
    stopBlitz();
    const root = document.getElementById("drillView");
    root.innerHTML =
      '<div class="studio-card blitz-result">' +
      "<h2>⚡ 10問タイムアタック完了！</h2>" +
      '<div class="kpi-grid">' +
      '<div class="kpi-box"><div class="kpi-lbl">完全正解 / 自信あり</div><div class="kpi-val accent">' + score + " / " + total + "</div></div>" +
      '<div class="kpi-box"><div class="kpi-lbl">正答率</div><div class="kpi-val emerald-txt">' + Math.round((score / total) * 100) + "%</div></div>" +
      '<div class="kpi-box"><div class="kpi-lbl">所要時間</div><div class="kpi-val">' + elapsed + "秒</div></div>" +
      "</div>" +
      '<div class="drill-actions" style="margin-top:18px;">' +
      '<button type="button" class="primary-btn" id="blitzRetryBtn">もう一度挑戦</button>' +
      '<button type="button" class="secondary-btn" id="blitzBackBtn">通常道場へ戻る</button>' +
      "</div></div>";
    document.getElementById("blitzRetryBtn").onclick = startBlitz;
    document.getElementById("blitzBackBtn").onclick = () => {
      rebuildDeck(false);
      renderDrillView();
    };
  }

  function advanceDrillCard(delta) {
    if (drillState.blitzActive && delta > 0 && drillState.blitzCount >= drillState.blitzTotal) {
      showBlitzSummary();
      return;
    }
    if (drillState.deck.length === 0) return;
    drillState.idx = (drillState.idx + delta + drillState.deck.length) % drillState.deck.length;
    drillState.revealStep = 0;
    resetInputForCard();
    renderDrillView();
  }

  function gradeCard(level) {
    const card = drillState.deck[drillState.idx];
    if (!card) return;
    state.srs[card.id] = { level, updatedAt: new Date().toISOString() };
    saveState();

    if (drillState.blitzActive) {
      drillState.blitzCount++;
      if (level === 2) drillState.blitzScore++;
      if (drillState.blitzCount >= drillState.blitzTotal) {
        showBlitzSummary();
        return;
      }
    }
    advanceDrillCard(1);
  }

  function updateLiveBalanceBar() {
    const bar = document.getElementById("drillLiveBalance");
    if (!bar) return;
    let dSum = 0;
    let cSum = 0;
    drillState.inputRows.forEach((r) => {
      dSum += parseInputAmount(r.dAmt);
      cSum += parseInputAmount(r.cAmt);
    });
    const diff = Math.abs(dSum - cSum);
    const balanced = dSum > 0 && dSum === cSum;
    bar.innerHTML =
      '<span>借方合計: <strong>' + fmtYen(dSum) + "</strong></span>" +
      '<span>貸方合計: <strong>' + fmtYen(cSum) + "</strong></span>" +
      (dSum === 0 && cSum === 0
        ? '<span class="meta-pill">金額未入力</span>'
        : balanced
        ? '<span class="meta-pill emerald-pill">✓ 貸借一致</span>'
        : '<span class="meta-pill danger-pill">不一致 (差額 ' + fmtYen(diff) + ")</span>");
  }

  function renderDrillView() {
    const root = document.getElementById("drillView");
    if (!root) return;
    if (drillState.deck.length === 0 && !drillState.blitzActive) {
      rebuildDeck(false);
    }

    const allCards = DATA.drills || [];
    const masteredCnt = allCards.filter((c) => state.srs[c.id] && state.srs[c.id].level >= 2).length;
    const weakCnt = allCards.filter((c) => state.srs[c.id] && state.srs[c.id].level === 0).length;

    const countByPart = (p) => allCards.filter((c) => c.part === p).length;
    const partOptions = [
      { id: "all", label: "全範囲 (" + allCards.length + ")" },
      { id: "L3", label: "3級 (" + countByPart("L3") + ")" },
      { id: "L2C", label: "2級 商簿 (" + countByPart("L2C") + ")" },
      { id: "L2I", label: "2級 工簿 (" + countByPart("L2I") + ")" },
      { id: "L1C", label: "1級 商簿・会計学 (" + countByPart("L1C") + ")" },
      { id: "L1I", label: "1級 工簿・原計 (" + countByPart("L1I") + ")" },
      { id: "exam", label: "実戦模試 (" + countByPart("exam") + ")" },
      { id: "cheat", label: "頻出チート CS-02 (" + countByPart("cheat") + ")" }
    ];

    // Unit filter options within selected part
    const docMap = new Map();
    allCards.forEach((c) => {
      if (drillState.part !== "all" && c.part !== drillState.part) return;
      if (!docMap.has(c.docId)) docMap.set(c.docId, { id: c.docId, title: c.docTitle, cnt: 0 });
      docMap.get(c.docId).cnt++;
    });

    let html =
      '<div class="studio-header">' +
      "<div><h2>⚔️ 仕訳道場 v2（問題文連動・自動採点＆高速SRS）</h2>" +
      '<p class="studio-sub">全単元・模試の問題文と完全連動した<strong>' + allCards.length + '問</strong>。手入力で採点する「✍️ 入力採点モード」と、爆速周回用の「⚡ フラッシュカードモード」を切り替えられます。</p></div>' +
      '<div class="drill-stats-pills">' +
      '<span class="meta-pill accent">習得済 ' + masteredCnt + " / " + allCards.length + "</span>" +
      '<span class="meta-pill amber">要復習 ' + weakCnt + "件</span>" +
      "</div></div>";

    html += '<div class="drill-toolbar">';
    html += '<div class="drill-submode-tabs">';
    html += '<button type="button" class="sim-tab-btn drill-submode-btn' + (drillState.mode === "input" ? " active" : "") + '" data-dmode="input">✍️ 入力・自動採点</button>';
    html += '<button type="button" class="sim-tab-btn drill-submode-btn' + (drillState.mode === "flash" ? " active" : "") + '" data-dmode="flash">⚡ フラッシュカード</button>';
    html += "</div>";

    html += '<select id="drillPartSelect" class="studio-select">';
    partOptions.forEach((op) => {
      html += '<option value="' + op.id + '"' + (drillState.part === op.id ? " selected" : "") + ">" + escapeHtml(op.label) + "</option>";
    });
    html += "</select>";

    html += '<select id="drillDocSelect" class="studio-select">';
    html += '<option value="">すべての単元</option>';
    Array.from(docMap.values()).forEach((d) => {
      html += '<option value="' + escapeHtml(d.id) + '"' + (drillState.docFilter === d.id ? " selected" : "") + ">" + escapeHtml(d.id + " (" + d.cnt + ")") + "</option>";
    });
    html += "</select>";

    html += '<select id="drillQueueSelect" class="studio-select">';
    html += '<option value="all"' + (drillState.queueMode === "all" ? " selected" : "") + ">すべて表示</option>";
    html += '<option value="unmastered"' + (drillState.queueMode === "unmastered" ? " selected" : "") + ">未習得のみ</option>";
    html += '<option value="weak"' + (drillState.queueMode === "weak" ? " selected" : "") + ">要復習のみ</option>";
    html += "</select>";

    html += '<button type="button" class="mask-btn" id="drillShuffleBtn">🔀 シャッフル</button>';
    html += '<button type="button" class="primary-btn" id="drillBlitzBtn">⚡ 10問アタック</button>';
    html += "</div>";

    if (drillState.blitzActive) {
      const dispNum = Math.min(drillState.blitzCount + 1, drillState.blitzTotal);
      html +=
        '<div class="blitz-banner">' +
        "<span>⚡ タイムアタック中: <strong>" + dispNum + " / " + drillState.blitzTotal + "問目</strong>（正解 " + drillState.blitzScore + "）</span>" +
        '<span id="blitzTimerBadge">⏱ ' + drillState.blitzSec + "秒</span>" +
        '<button type="button" class="mask-btn" id="blitzStopBtn">中断</button>' +
        "</div>";
    }

    const card = drillState.deck[drillState.idx];
    if (!card) {
      html +=
        '<div class="studio-card"><p>該当する仕訳カードがありません。フィルタ条件を変更してください。</p>' +
        '<button type="button" class="primary-btn" id="resetDrillFilterBtn">全カードを表示</button></div>';
      root.innerHTML = html;
      bindDrillToolbar();
      const rb = document.getElementById("resetDrillFilterBtn");
      if (rb) rb.onclick = () => { drillState.part = "all"; drillState.queueMode = "all"; drillState.docFilter = ""; rebuildDeck(false); renderDrillView(); };
      return;
    }

    const srsRec = state.srs[card.id];
    const srsBadge = !srsRec
      ? '<span class="meta-pill">未学習</span>'
      : srsRec.level === 2
      ? '<span class="meta-pill emerald-pill">🟢 自信あり</span>'
      : srsRec.level === 1
      ? '<span class="meta-pill amber">🟡 あいまい</span>'
      : '<span class="meta-pill danger-pill">🔴 要復習</span>';

    html += '<div class="studio-card drill-card">';
    html +=
      '<div class="drill-card-meta">' +
      '<div><span class="meta-pill accent">' + escapeHtml(card.docId) + "</span> " +
      '<span class="meta-pill">' + escapeHtml(card.questionTitle || card.section) + "</span> " +
      '<span class="meta-pill">対象: ' + escapeHtml(card.targetLabel || card.prompt) + "</span> " +
      srsBadge + "</div>" +
      '<div class="drill-counter">' + (drillState.idx + 1) + " / " + drillState.deck.length + "</div>" +
      "</div>";

    html += '<div class="drill-doc-title">' + escapeHtml(card.docTitle) + "</div>";

    // Full Question Body + Highlighted Focus Line
    html += '<div class="drill-question-box">';
    if (card.focusLine) {
      html +=
        '<div class="drill-focus-banner">' +
        '<span class="focus-badge">🎯 今回の仕訳対象（No./取引: ' + escapeHtml(card.targetLabel) + "）</span>" +
        '<div class="focus-text">' + formatInlineMd(card.focusLine) + "</div>" +
        "</div>";
    }
    html += '<div class="drill-question-body">' + formatQuestionBodyHtml(card.questionBody, card.focusLine) + "</div>";
    html += "</div>";

    if (drillState.mode === "input") {
      // Datalist for autocomplete
      const subjectsList = DATA.subjects || [];
      html += '<datalist id="bokiSubjectsDatalist">';
      subjectsList.forEach((s) => {
        html += '<option value="' + escapeHtml(s) + '"></option>';
      });
      html += "</datalist>";

      // Smart Subject Palette
      const palette = buildSubjectPalette(card);
      html += '<div class="subject-palette">';
      html += '<span class="palette-lbl">📌 科目パレット（クリックで入力欄に挿入）:</span>';
      palette.forEach((sub) => {
        html += '<button type="button" class="palette-chip" data-sub="' + escapeHtml(sub) + '">' + escapeHtml(sub) + "</button>";
      });
      html += "</div>";

      // Interactive Journal Input Table
      html += '<div class="table-wrap"><table class="journal-table drill-input-table"><thead><tr><th>借方科目</th><th class="num">借方金額</th><th>貸方科目</th><th class="num">貸方金額</th><th style="width:40px;"></th></tr></thead><tbody>';
      drillState.inputRows.forEach((r, idx) => {
        html +=
          "<tr>" +
          '<td><input type="text" class="drill-cell-input sub-input" list="bokiSubjectsDatalist" data-row="' + idx + '" data-field="dSub" placeholder="借方科目..." value="' + escapeHtml(r.dSub) + '" /></td>' +
          '<td><input type="text" inputmode="numeric" class="drill-cell-input amt-input num" data-row="' + idx + '" data-field="dAmt" placeholder="0" value="' + escapeHtml(r.dAmt) + '" /></td>' +
          '<td><input type="text" class="drill-cell-input sub-input" list="bokiSubjectsDatalist" data-row="' + idx + '" data-field="cSub" placeholder="貸方科目..." value="' + escapeHtml(r.cSub) + '" /></td>' +
          '<td><input type="text" inputmode="numeric" class="drill-cell-input amt-input num" data-row="' + idx + '" data-field="cAmt" placeholder="0" value="' + escapeHtml(r.cAmt) + '" /></td>' +
          '<td>' + (drillState.inputRows.length > 1 ? '<button type="button" class="row-del-btn" data-del-row="' + idx + '" title="行を削除">✕</button>' : "") + "</td>" +
          "</tr>";
      });
      html += "</tbody></table></div>";

      html += '<div class="drill-live-bar">';
      html += '<button type="button" class="mask-btn" id="drillAddRowBtn">＋ 行を追加</button>';
      html += '<div id="drillLiveBalance" class="live-balance-group"></div>';
      html += "</div>";

      if (drillState.showHint) {
        html +=
          '<div class="drill-hint-box">' +
          "💡 <strong>ヒント</strong>：模範仕訳は <strong>" + card.rows.length + "行</strong>。" +
          "使う科目ヒント：<code>" +
          card.rows.map((r) => [r.dSub ? r.dSub[0] + "…" : "", r.cSub ? r.cSub[0] + "…" : ""].filter(Boolean).join(" / ")).join(" | ") +
          "</code></div>";
      }

      html += '<div class="drill-controls-row">';
      html += '<div class="drill-reveal-btns">';
      html += '<button type="button" class="primary-btn" id="drillCheckBtn">✔ 判定する（採点）</button>';
      html += '<button type="button" class="secondary-btn" id="drillHintBtn">💡 ヒント</button>';
      html += '<button type="button" class="mask-btn" id="drillOpenDocBtn">📖 単元テキスト</button>';
      html += "</div>";
      html += '<div class="drill-nav-btns">';
      html += '<button type="button" class="mask-btn" id="drillPrevBtn">← 前</button>';
      html += '<button type="button" class="mask-btn" id="drillNextBtn">次 →</button>';
      html += "</div></div>";

      if (drillState.gradeResult) {
        const res = drillState.gradeResult;
        const cls = res.status === "perfect" ? "grade-perfect" : res.status === "partial" ? "grade-partial" : "grade-wrong";
        html += '<div class="grade-result-box ' + cls + '">';
        html += '<div class="grade-msg">' + escapeHtml(res.message) + "</div>";
        html += '<div class="grade-answer-title">模範仕訳</div>';
        html += '<div class="table-wrap"><table class="journal-table drill-table"><thead><tr><th>借方科目</th><th class="num">借方金額</th><th>貸方科目</th><th class="num">貸方金額</th></tr></thead><tbody>';
        card.rows.forEach((r) => {
          html += "<tr><td>" + escapeHtml(r.dSub) + '</td><td class="num">' + escapeHtml(r.dAmt) + "</td><td>" + escapeHtml(r.cSub) + '</td><td class="num">' + escapeHtml(r.cAmt) + "</td></tr>";
        });
        html += "</tbody></table></div>";
        if (card.explanation) {
          html += '<div class="drill-explanation-box"><strong>📝 解説・誤答パターン分析</strong><div class="exp-body">' + formatQuestionBodyHtml(card.explanation, "") + "</div></div>";
        }
        html += '<div style="margin-top:12px;"><button type="button" class="primary-btn" id="drillAfterGradeNextBtn">次の問題へ →</button></div>';
        html += "</div>";
      }
    } else {
      // Flashcard Mode
      html += '<div class="table-wrap"><table class="journal-table drill-table"><thead><tr><th>借方科目</th><th class="num">借方金額</th><th>貸方科目</th><th class="num">貸方金額</th></tr></thead><tbody>';
      card.rows.forEach((r) => {
        const showSub = drillState.revealStep >= 1;
        const showAmt = drillState.revealStep >= 2;
        const dSubHtml = r.dSub ? (showSub ? escapeHtml(r.dSub) : '<span class="drill-mask">？</span>') : "";
        const dAmtHtml = r.dAmt ? (showAmt ? escapeHtml(r.dAmt) : '<span class="drill-mask">？円</span>') : "";
        const cSubHtml = r.cSub ? (showSub ? escapeHtml(r.cSub) : '<span class="drill-mask">？</span>') : "";
        const cAmtHtml = r.cAmt ? (showAmt ? escapeHtml(r.cAmt) : '<span class="drill-mask">？円</span>') : "";
        html += "<tr><td>" + dSubHtml + '</td><td class="num">' + dAmtHtml + "</td><td>" + cSubHtml + '</td><td class="num">' + cAmtHtml + "</td></tr>";
      });
      html += "</tbody></table></div>";

      if (drillState.revealStep >= 2 && card.explanation) {
        html += '<div class="drill-explanation-box"><strong>📝 解説・誤答パターン分析</strong><div class="exp-body">' + formatQuestionBodyHtml(card.explanation, "") + "</div></div>";
      }

      html += '<div class="drill-controls-row">';
      html += '<div class="drill-reveal-btns">';
      html += '<button type="button" class="secondary-btn" id="drillRevealSubBtn">👁 科目だけ表示</button>';
      html += '<button type="button" class="primary-btn" id="drillRevealAllBtn">✨ すべて表示＆解説</button>';
      html += '<button type="button" class="mask-btn" id="drillOpenDocBtn">📖 単元テキスト</button>';
      html += "</div>";
      html += '<div class="drill-nav-btns">';
      html += '<button type="button" class="mask-btn" id="drillPrevBtn">← 前</button>';
      html += '<button type="button" class="mask-btn" id="drillNextBtn">次 →</button>';
      html += "</div></div>";

      html +=
        '<div class="drill-srs-bar">' +
        '<span class="srs-label">理解度記録 (SRS):</span>' +
        '<button type="button" class="srs-btn srs-bad" data-lvl="0">🔴 要復習 (1)</button>' +
        '<button type="button" class="srs-btn srs-mid" data-lvl="1">🟡 あいまい (2)</button>' +
        '<button type="button" class="srs-btn srs-good" data-lvl="2">🟢 自信あり (3)</button>' +
        "</div>";
    }

    html += "</div>";
    root.innerHTML = html;

    bindDrillToolbar();
    document.getElementById("drillOpenDocBtn").onclick = () => openDoc(card.docId);
    document.getElementById("drillPrevBtn").onclick = () => advanceDrillCard(-1);
    document.getElementById("drillNextBtn").onclick = () => advanceDrillCard(1);

    if (drillState.mode === "input") {
      updateLiveBalanceBar();
      root.querySelectorAll(".drill-cell-input").forEach((inp) => {
        const rIdx = Number(inp.dataset.row);
        const fld = inp.dataset.field;
        inp.addEventListener("focus", () => {
          if (fld === "dSub" || fld === "cSub") {
            drillState.lastFocusedCell = { row: rIdx, field: fld };
          }
        });
        inp.addEventListener("input", () => {
          drillState.inputRows[rIdx][fld] = inp.value;
          updateLiveBalanceBar();
        });
      });
      root.querySelectorAll(".palette-chip").forEach((chip) => {
        chip.onclick = () => {
          const target = drillState.lastFocusedCell || { row: 0, field: "dSub" };
          const r = Math.min(target.row, drillState.inputRows.length - 1);
          const fld = target.field === "cSub" ? "cSub" : "dSub";
          drillState.inputRows[r][fld] = chip.dataset.sub;
          const domInp = root.querySelector('.drill-cell-input[data-row="' + r + '"][data-field="' + fld + '"]');
          if (domInp) {
            domInp.value = chip.dataset.sub;
            // Auto-advance focus to corresponding amount field for rapid entry
            const amtFld = fld === "dSub" ? "dAmt" : "cAmt";
            const amtInp = root.querySelector('.drill-cell-input[data-row="' + r + '"][data-field="' + amtFld + '"]');
            if (amtInp) amtInp.focus();
          }
        };
      });
      root.querySelectorAll(".row-del-btn").forEach((b) => {
        b.onclick = () => {
          const idx = Number(b.dataset.delRow);
          drillState.inputRows.splice(idx, 1);
          renderDrillView();
        };
      });
      document.getElementById("drillAddRowBtn").onclick = () => {
        drillState.inputRows.push({ dSub: "", dAmt: "", cSub: "", cAmt: "" });
        renderDrillView();
      };
      document.getElementById("drillHintBtn").onclick = () => {
        drillState.showHint = !drillState.showHint;
        renderDrillView();
      };
      document.getElementById("drillCheckBtn").onclick = () => evaluateUserJournal(card);
      const afterBtn = document.getElementById("drillAfterGradeNextBtn");
      if (afterBtn) afterBtn.onclick = () => advanceDrillCard(1);
    } else {
      document.getElementById("drillRevealSubBtn").onclick = () => {
        drillState.revealStep = 1;
        renderDrillView();
      };
      document.getElementById("drillRevealAllBtn").onclick = () => {
        drillState.revealStep = 2;
        renderDrillView();
      };
      root.querySelectorAll(".srs-btn").forEach((b) => {
        b.onclick = () => gradeCard(Number(b.dataset.lvl));
      });
    }
  }

  function bindDrillToolbar() {
    document.querySelectorAll(".drill-submode-btn").forEach((b) => {
      b.onclick = () => {
        drillState.mode = b.dataset.dmode;
        renderDrillView();
      };
    });
    const pSel = document.getElementById("drillPartSelect");
    if (pSel) pSel.onchange = (e) => { stopBlitz(); drillState.part = e.target.value; drillState.docFilter = ""; rebuildDeck(false); renderDrillView(); };
    const dSel = document.getElementById("drillDocSelect");
    if (dSel) dSel.onchange = (e) => { stopBlitz(); drillState.docFilter = e.target.value; rebuildDeck(false); renderDrillView(); };
    const qSel = document.getElementById("drillQueueSelect");
    if (qSel) qSel.onchange = (e) => { stopBlitz(); drillState.queueMode = e.target.value; rebuildDeck(false); renderDrillView(); };
    const sBtn = document.getElementById("drillShuffleBtn");
    if (sBtn) sBtn.onclick = () => { stopBlitz(); rebuildDeck(true); renderDrillView(); };
    const bBtn = document.getElementById("drillBlitzBtn");
    if (bBtn) bBtn.onclick = startBlitz;
    const stBtn = document.getElementById("blitzStopBtn");
    if (stBtn) stBtn.onclick = () => { stopBlitz(); rebuildDeck(false); renderDrillView(); };
  }

  document.addEventListener("keydown", (e) => {
    if (studio.getStudioMode() !== "drill") return;
    const tag = document.activeElement ? document.activeElement.tagName : "";
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag) && e.code === "Space") return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    if (drillState.mode === "flash") {
      if (e.code === "Space") {
        e.preventDefault();
        drillState.revealStep = drillState.revealStep >= 2 ? 0 : drillState.revealStep + 1;
        renderDrillView();
      } else if (e.key === "1") gradeCard(0);
      else if (e.key === "2") gradeCard(1);
      else if (e.key === "3") gradeCard(2);
    }
    if (e.key === "ArrowRight" && drillState.deck.length > 0) {
      advanceDrillCard(1);
    } else if (e.key === "ArrowLeft" && drillState.deck.length > 0) {
      advanceDrillCard(-1);
    }
  });

  /* =========================================================================
   * 2. 5 INTERACTIVE SIMULATORS (🧮 5大シミュレータ)
   * ========================================================================= */
  let activeSim = "schlatter";

  function renderSimView() {
    const root = document.getElementById("simView");
    if (!root) return;
    const tabs = [
      { id: "schlatter", label: "① シュラッター図" },
      { id: "cvp", label: "② CVP損益分岐点" },
      { id: "lease", label: "③ 新リース基準(34号)" },
      { id: "npv", label: "④ 設備投資 NPV/IRR" },
      { id: "dep", label: "⑤ 定額法 vs 200%定率法" }
    ];

    let html =
      '<div class="studio-header">' +
      "<div><h2>🧮 会計・原価計算 5大インタラクティブ・シミュレータ</h2>" +
      '<p class="studio-sub">パラメータを動かして「なぜその差異・数値・判断になるのか」をリアルタイムSVGと厳密表で体感します。</p></div></div>';

    html += '<div class="sim-tabs">';
    tabs.forEach((t) => {
      html += '<button type="button" class="sim-tab-btn' + (activeSim === t.id ? " active" : "") + '" data-sim="' + t.id + '">' + escapeHtml(t.label) + "</button>";
    });
    html += '</div><div id="simBody" class="studio-card"></div>';
    root.innerHTML = html;

    root.querySelectorAll(".sim-tab-btn").forEach((btn) => {
      btn.onclick = () => {
        activeSim = btn.dataset.sim;
        renderSimView();
      };
    });

    if (activeSim === "schlatter") mountSchlatter();
    else if (activeSim === "cvp") mountCvp();
    else if (activeSim === "lease") mountLease();
    else if (activeSim === "npv") mountNpv();
    else if (activeSim === "dep") mountDep();
  }

  function mountSchlatter() {
    const body = document.getElementById("simBody");
    body.innerHTML =
      '<div class="sim-grid">' +
      '<div class="sim-controls">' +
      "<h3>公式法変動予算（型05）</h3>" +
      '<label>基準操業度 (h): <strong id="schBaseV">500</strong><input id="schBase" type="range" min="200" max="1000" step="20" value="500"></label>' +
      '<label>実際操業度 (h): <strong id="schActHV">460</strong><input id="schActH" type="range" min="100" max="1000" step="10" value="460"></label>' +
      '<label>固定費予算 (円): <strong id="schFixV">600,000</strong><input id="schFix" type="range" min="100000" max="1200000" step="50000" value="600000"></label>' +
      '<label>変動費率 (円/h): <strong id="schVarV">800</strong><input id="schVar" type="range" min="200" max="2000" step="50" value="800"></label>' +
      '<label>実際発生額 (円): <strong id="schActCV">1,000,000</strong><input id="schActC" type="range" min="200000" max="2000000" step="10000" value="1000000"></label>' +
      "</div>" +
      '<div class="sim-viz"><div id="schSvg"></div><div id="schKpi" class="kpi-grid"></div></div>' +
      "</div>";

    const update = () => {
      const base = +document.getElementById("schBase").value;
      const actH = +document.getElementById("schActH").value;
      const fix = +document.getElementById("schFix").value;
      const varR = +document.getElementById("schVar").value;
      const actC = +document.getElementById("schActC").value;
      document.getElementById("schBaseV").textContent = fmtNum(base);
      document.getElementById("schActHV").textContent = fmtNum(actH);
      document.getElementById("schFixV").textContent = fmtNum(fix);
      document.getElementById("schVarV").textContent = fmtNum(varR);
      document.getElementById("schActCV").textContent = fmtNum(actC);

      const fixR = fix / base;
      const stdR = fixR + varR;
      const budAllow = fix + varR * actH;
      const applied = stdR * actH;
      const budVar = budAllow - actC;
      const volVar = fixR * (actH - base);
      const totVar = applied - actC;

      const maxX = Math.max(base, actH) * 1.15;
      const maxY = Math.max(fix + varR * maxX, stdR * maxX, actC) * 1.15;
      const W = 480, H = 260, pL = 56, pR = 20, pT = 20, pB = 34;
      const sx = (x) => pL + (x / maxX) * (W - pL - pR);
      const sy = (y) => H - pB - (y / maxY) * (H - pT - pB);

      const svg =
        '<svg viewBox="0 0 ' + W + " " + H + '" class="sim-svg">' +
        '<line x1="' + pL + '" y1="' + pT + '" x2="' + pL + '" y2="' + (H - pB) + '" stroke="currentColor" opacity="0.4"/>' +
        '<line x1="' + pL + '" y1="' + (H - pB) + '" x2="' + (W - pR) + '" y2="' + (H - pB) + '" stroke="currentColor" opacity="0.4"/>' +
        '<line x1="' + pL + '" y1="' + sy(fix) + '" x2="' + sx(maxX) + '" y2="' + sy(fix) + '" stroke="#94a3b8" stroke-dasharray="4,4"/>' +
        '<line x1="' + pL + '" y1="' + sy(fix) + '" x2="' + sx(maxX) + '" y2="' + sy(fix + varR * maxX) + '" stroke="#3730a3" stroke-width="2.5"/>' +
        '<line x1="' + pL + '" y1="' + sy(0) + '" x2="' + sx(maxX) + '" y2="' + sy(stdR * maxX) + '" stroke="#0f766e" stroke-width="2.5"/>' +
        '<line x1="' + sx(actH) + '" y1="' + sy(0) + '" x2="' + sx(actH) + '" y2="' + sy(Math.max(actC, budAllow, applied)) + '" stroke="#b45309" stroke-dasharray="3,3"/>' +
        '<line x1="' + sx(base) + '" y1="' + sy(0) + '" x2="' + sx(base) + '" y2="' + sy(fix + varR * base) + '" stroke="#64748b" stroke-dasharray="3,3"/>' +
        '<circle cx="' + sx(actH) + '" cy="' + sy(actC) + '" r="5" fill="#b91c1c"/>' +
        '<circle cx="' + sx(actH) + '" cy="' + sy(budAllow) + '" r="4.5" fill="#3730a3"/>' +
        '<circle cx="' + sx(actH) + '" cy="' + sy(applied) + '" r="4.5" fill="#0f766e"/>' +
        '<text x="' + (sx(actH) + 6) + '" y="' + (sy(actC) - 4) + '" font-size="11" fill="#b91c1c">実際発生</text>' +
        '<text x="' + (sx(actH) + 6) + '" y="' + (sy(budAllow) - 4) + '" font-size="11" fill="#3730a3">予算許容</text>' +
        '<text x="' + (sx(actH) + 6) + '" y="' + (sy(applied) + 12) + '" font-size="11" fill="#0f766e">予定配賦</text>' +
        '<text x="' + sx(base) + '" y="' + (H - 12) + '" font-size="10" text-anchor="middle" fill="currentColor">基準 ' + base + 'h</text>' +
        '<text x="' + sx(actH) + '" y="' + (H - 2) + '" font-size="10" text-anchor="middle" fill="#b45309">実際 ' + actH + 'h</text>' +
        "</svg>";
      document.getElementById("schSvg").innerHTML = svg;

      const tag = (v) => (v >= 0 ? '<span class="emerald-txt">+' + fmtYen(v) + " (有利)</span>" : '<span class="danger-txt">' + fmtYen(v) + " (不利)</span>");
      document.getElementById("schKpi").innerHTML =
        '<div class="kpi-box"><div class="kpi-lbl">標準配賦率</div><div class="kpi-val">' + fmtYen(stdR) + "/h</div></div>" +
        '<div class="kpi-box"><div class="kpi-lbl">予算差異</div><div class="kpi-val">' + tag(budVar) + "</div></div>" +
        '<div class="kpi-box"><div class="kpi-lbl">操業度差異</div><div class="kpi-val">' + tag(volVar) + "</div></div>" +
        '<div class="kpi-box"><div class="kpi-lbl">総差異 (配賦−実際)</div><div class="kpi-val">' + tag(totVar) + "</div></div>";
    };
    body.querySelectorAll("input").forEach((inp) => (inp.oninput = update));
    update();
  }

  function mountCvp() {
    const body = document.getElementById("simBody");
    body.innerHTML =
      '<div class="sim-grid">' +
      '<div class="sim-controls">' +
      "<h3>CVP・損益分岐点グラフ（型10）</h3>" +
      '<label>販売単価 (円): <strong id="cvpPV">5,000</strong><input id="cvpP" type="range" min="1000" max="10000" step="200" value="5000"></label>' +
      '<label>単位変動費 (円): <strong id="cvpVV">3,000</strong><input id="cvpV" type="range" min="500" max="8000" step="100" value="3000"></label>' +
      '<label>固定費 (万円): <strong id="cvpFV">240</strong><input id="cvpF" type="range" min="50" max="600" step="10" value="240"></label>' +
      '<label>現在販売量 (個): <strong id="cvpQV">1,600</strong><input id="cvpQ" type="range" min="200" max="3000" step="50" value="1600"></label>' +
      "</div>" +
      '<div class="sim-viz"><div id="cvpSvg"></div><div id="cvpKpi" class="kpi-grid"></div></div>' +
      "</div>";

    const update = () => {
      const p = +document.getElementById("cvpP").value;
      const v = +document.getElementById("cvpV").value;
      const f = +document.getElementById("cvpF").value * 10000;
      const q = +document.getElementById("cvpQ").value;
      document.getElementById("cvpPV").textContent = fmtNum(p);
      document.getElementById("cvpVV").textContent = fmtNum(v);
      document.getElementById("cvpFV").textContent = fmtNum(f / 10000);
      document.getElementById("cvpQV").textContent = fmtNum(q);

      const cm = p - v;
      const cmr = p > 0 ? cm / p : 0;
      const bepQ = cm > 0 ? f / cm : Infinity;
      const bepS = cm > 0 ? bepQ * p : Infinity;
      const sales = p * q;
      const totalC = f + v * q;
      const opInc = sales - totalC;
      const mos = sales > 0 && isFinite(bepS) ? ((sales - bepS) / sales) * 100 : 0;

      const maxQ = Math.max(q, isFinite(bepQ) ? bepQ * 1.4 : 2000) * 1.1;
      const maxY = Math.max(p * maxQ, f + v * maxQ) * 1.1;
      const W = 480, H = 260, pL = 56, pR = 20, pT = 20, pB = 34;
      const sx = (x) => pL + (x / maxQ) * (W - pL - pR);
      const sy = (y) => H - pB - (y / maxY) * (H - pT - pB);

      let bepMark = "";
      if (isFinite(bepQ) && bepQ <= maxQ) {
        bepMark =
          '<circle cx="' + sx(bepQ) + '" cy="' + sy(bepS) + '" r="5" fill="#b45309"/>' +
          '<text x="' + (sx(bepQ) + 6) + '" y="' + (sy(bepS) - 6) + '" font-size="11" fill="#b45309">BEP ' + Math.round(bepQ) + "個</text>";
      }

      document.getElementById("cvpSvg").innerHTML =
        '<svg viewBox="0 0 ' + W + " " + H + '" class="sim-svg">' +
        '<line x1="' + pL + '" y1="' + pT + '" x2="' + pL + '" y2="' + (H - pB) + '" stroke="currentColor" opacity="0.4"/>' +
        '<line x1="' + pL + '" y1="' + (H - pB) + '" x2="' + (W - pR) + '" y2="' + (H - pB) + '" stroke="currentColor" opacity="0.4"/>' +
        '<line x1="' + pL + '" y1="' + sy(f) + '" x2="' + sx(maxQ) + '" y2="' + sy(f) + '" stroke="#94a3b8" stroke-dasharray="4,4"/>' +
        '<line x1="' + pL + '" y1="' + sy(f) + '" x2="' + sx(maxQ) + '" y2="' + sy(f + v * maxQ) + '" stroke="#b91c1c" stroke-width="2.5"/>' +
        '<line x1="' + pL + '" y1="' + sy(0) + '" x2="' + sx(maxQ) + '" y2="' + sy(p * maxQ) + '" stroke="#0f766e" stroke-width="2.5"/>' +
        '<line x1="' + sx(q) + '" y1="' + sy(0) + '" x2="' + sx(q) + '" y2="' + sy(Math.max(sales, totalC)) + '" stroke="#3730a3" stroke-dasharray="3,3"/>' +
        bepMark +
        '<text x="' + (W - 75) + '" y="' + (sy(p * maxQ) + 12) + '" font-size="11" fill="#0f766e">売上高線</text>' +
        '<text x="' + (W - 75) + '" y="' + (sy(f + v * maxQ) + 12) + '" font-size="11" fill="#b91c1c">総原価線</text>' +
        "</svg>";

      document.getElementById("cvpKpi").innerHTML =
        '<div class="kpi-box"><div class="kpi-lbl">貢献利益率</div><div class="kpi-val">' + fmtNum(cmr * 100, 1) + "%</div></div>" +
        '<div class="kpi-box"><div class="kpi-lbl">損益分岐点売上高</div><div class="kpi-val accent">' + (isFinite(bepS) ? fmtYen(bepS) : "到達不可") + "</div></div>" +
        '<div class="kpi-box"><div class="kpi-lbl">営業利益</div><div class="kpi-val ' + (opInc >= 0 ? "emerald-txt" : "danger-txt") + '">' + fmtYen(opInc) + "</div></div>" +
        '<div class="kpi-box"><div class="kpi-lbl">安全余裕率</div><div class="kpi-val">' + (isFinite(bepS) ? fmtNum(mos, 1) + "%" : "-") + "</div></div>";
    };
    body.querySelectorAll("input").forEach((inp) => (inp.oninput = update));
    update();
  }

  function mountLease() {
    const body = document.getElementById("simBody");
    body.innerHTML =
      '<div class="sim-grid">' +
      '<div class="sim-controls">' +
      "<h3>新リース会計基準（第34号）利息法償却表（型04）</h3>" +
      '<label>年間リース料 (円)<input id="lsPmt" type="number" step="10000" value="500000"></label>' +
      '<label>リース期間 (年)<input id="lsYrs" type="number" min="2" max="10" value="4"></label>' +
      '<label>追加借入利子率 (%)<input id="lsRate" type="number" step="0.5" min="0.5" max="15" value="5"></label>' +
      '<label>付随費用・前払リース料 (円)<input id="lsIdc" type="number" step="10000" value="0"></label>' +
      "</div>" +
      '<div class="sim-viz"><div id="lsOut"></div></div>' +
      "</div>";

    const update = () => {
      const pmt = Math.max(0, +document.getElementById("lsPmt").value || 0);
      const yrs = Math.max(2, Math.min(10, Math.round(+document.getElementById("lsYrs").value || 4)));
      const rate = Math.max(0.001, (+document.getElementById("lsRate").value || 5) / 100);
      const idc = Math.max(0, +document.getElementById("lsIdc").value || 0);

      let pv = 0;
      for (let t = 1; t <= yrs; t++) pv += pmt / Math.pow(1 + rate, t);
      pv = Math.round(pv);
      const rouInit = pv + idc;
      const rouDep = Math.round(rouInit / yrs);

      let bal = pv;
      let rows = "";
      let firstInt = 0, firstPrin = 0;
      for (let t = 1; t <= yrs; t++) {
        const beg = bal;
        let interest = Math.round(beg * rate);
        let prin = pmt - interest;
        if (t === yrs) {
          prin = beg;
          interest = pmt - prin;
        }
        bal = beg - prin;
        if (t === 1) { firstInt = interest; firstPrin = prin; }
        rows +=
          "<tr><td>第" + t + '期</td><td class="num">' + fmtYen(beg) + '</td><td class="num">' + fmtYen(pmt) +
          '</td><td class="num">' + fmtYen(interest) + '</td><td class="num">' + fmtYen(prin) +
          '</td><td class="num">' + fmtYen(bal) + '</td><td class="num">' + fmtYen(rouDep) + "</td></tr>";
      }

      document.getElementById("lsOut").innerHTML =
        '<div class="kpi-grid">' +
        '<div class="kpi-box"><div class="kpi-lbl">リース負債（当初現在価値）</div><div class="kpi-val accent">' + fmtYen(pv) + "</div></div>" +
        '<div class="kpi-box"><div class="kpi-lbl">使用権資産（当初計上額）</div><div class="kpi-val">' + fmtYen(rouInit) + "</div></div>" +
        '<div class="kpi-box"><div class="kpi-lbl">年次減価償却費（定額法）</div><div class="kpi-val">' + fmtYen(rouDep) + "</div></div>" +
        "</div>" +
        '<div class="table-wrap"><table><thead><tr><th>期</th><th class="num">期首負債</th><th class="num">支払額</th><th class="num">支払利息</th><th class="num">元本返済</th><th class="num">期末負債</th><th class="num">使用権償却</th></tr></thead><tbody>' +
        rows + "</tbody></table></div>" +
        '<p class="sim-note"><strong>第1期末の仕訳:</strong> <code>支払利息 ' + fmtYen(firstInt) + " ＋ リース負債 " + fmtYen(firstPrin) + " / 現金預金 " + fmtYen(pmt) + "</code> ＋ <code>減価償却費 " + fmtYen(rouDep) + " / 使用権資産累計額 " + fmtYen(rouDep) + "</code></p>";
    };
    body.querySelectorAll("input").forEach((inp) => (inp.oninput = update));
    update();
  }

  function mountNpv() {
    const body = document.getElementById("simBody");
    body.innerHTML =
      '<div class="sim-grid">' +
      '<div class="sim-controls">' +
      "<h3>設備投資 NPV / IRR / 取替投資（型10）</h3>" +
      '<label>新設備取得原価 (万円)<input id="npvCap" type="number" step="50" value="600"></label>' +
      '<label>旧設備売却収入 (万円)<input id="npvOldSell" type="number" step="10" value="120"></label>' +
      '<label>旧設備簿価 (万円)<input id="npvOldBv" type="number" step="10" value="200"></label>' +
      '<label>年次現金節約額 (万円)<input id="npvSav" type="number" step="10" value="180"></label>' +
      '<label>耐用年数 (年)<input id="npvYrs" type="number" min="2" max="10" value="4"></label>' +
      '<label>実効税率 (%)<input id="npvTax" type="number" min="0" max="50" step="5" value="30"></label>' +
      '<label>割引率 WACC (%)<input id="npvWacc" type="number" min="1" max="25" step="0.5" value="8"></label>' +
      "</div>" +
      '<div class="sim-viz"><div id="npvSvg"></div><div id="npvKpi" class="kpi-grid"></div></div>' +
      "</div>";

    const update = () => {
      const cap = (+document.getElementById("npvCap").value || 0) * 10000;
      const oldSell = (+document.getElementById("npvOldSell").value || 0) * 10000;
      const oldBv = (+document.getElementById("npvOldBv").value || 0) * 10000;
      const sav = (+document.getElementById("npvSav").value || 0) * 10000;
      const yrs = Math.max(2, Math.min(10, Math.round(+document.getElementById("npvYrs").value || 4)));
      const tax = (+document.getElementById("npvTax").value || 30) / 100;
      const wacc = (+document.getElementById("npvWacc").value || 8) / 100;

      const sellTaxShield = (oldBv - oldSell) * tax;
      const cf0 = -cap + oldSell + sellTaxShield;
      const diffDep = (cap - oldBv) / yrs;
      const annCF = sav * (1 - tax) + diffDep * tax;

      const calcNpvAt = (r) => {
        let sum = cf0;
        for (let t = 1; t <= yrs; t++) sum += annCF / Math.pow(1 + r, t);
        return sum;
      };
      const npv = calcNpvAt(wacc);

      // Bisection for IRR
      let irrText = "算出不可";
      if (cf0 < 0 && annCF > 0) {
        let lo = -0.5, hi = 2.0;
        for (let k = 0; k < 40; k++) {
          const mid = (lo + hi) / 2;
          if (calcNpvAt(mid) > 0) lo = mid;
          else hi = mid;
        }
        irrText = fmtNum(((lo + hi) / 2) * 100, 2) + "%";
      }

      // Cumulative Discounted CF SVG
      const cumPoints = [cf0];
      let cur = cf0;
      for (let t = 1; t <= yrs; t++) {
        cur += annCF / Math.pow(1 + wacc, t);
        cumPoints.push(cur);
      }
      const maxAbs = Math.max(...cumPoints.map(Math.abs), 1);
      const W = 480, H = 220, pL = 56, pR = 20, pT = 20, pB = 30;
      const sx = (i) => pL + (i / yrs) * (W - pL - pR);
      const sy = (y) => pT + ((maxAbs - y) / (2 * maxAbs)) * (H - pT - pB);
      const poly = cumPoints.map((y, i) => sx(i) + "," + sy(y)).join(" ");

      document.getElementById("npvSvg").innerHTML =
        '<svg viewBox="0 0 ' + W + " " + H + '" class="sim-svg">' +
        '<line x1="' + pL + '" y1="' + sy(0) + '" x2="' + (W - pR) + '" y2="' + sy(0) + '" stroke="currentColor" stroke-dasharray="4,4" opacity="0.5"/>' +
        '<polyline fill="none" stroke="#3730a3" stroke-width="2.5" points="' + poly + '"/>' +
        cumPoints.map((y, i) => '<circle cx="' + sx(i) + '" cy="' + sy(y) + '" r="4" fill="' + (y >= 0 ? "#0f766e" : "#b91c1c") + '"/><text x="' + sx(i) + '" y="' + (H - 8) + '" font-size="10" text-anchor="middle" fill="currentColor">T=' + i + "</text>").join("") +
        "</svg>";

      document.getElementById("npvKpi").innerHTML =
        '<div class="kpi-box"><div class="kpi-lbl">T=0 正味投資額</div><div class="kpi-val">' + fmtYen(cf0) + "</div></div>" +
        '<div class="kpi-box"><div class="kpi-lbl">年次差額CF (税引後)</div><div class="kpi-val">' + fmtYen(annCF) + "</div></div>" +
        '<div class="kpi-box"><div class="kpi-lbl">NPV (判定: ' + (npv >= 0 ? "採用" : "棄却") + ')</div><div class="kpi-val ' + (npv >= 0 ? "emerald-txt" : "danger-txt") + '">' + fmtYen(npv) + "</div></div>" +
        '<div class="kpi-box"><div class="kpi-lbl">内部利益率 (IRR)</div><div class="kpi-val accent">' + irrText + "</div></div>";
    };
    body.querySelectorAll("input").forEach((inp) => (inp.oninput = update));
    update();
  }

  function mountDep() {
    const body = document.getElementById("simBody");
    body.innerHTML =
      '<div class="sim-grid">' +
      '<div class="sim-controls">' +
      "<h3>減価償却：定額法 vs 200%定率法（2027年3級新論点）</h3>" +
      '<label>取得原価 (円)<input id="depCost" type="number" step="100000" value="1000000"></label>' +
      '<label>耐用年数 (年)<input id="depLife" type="number" min="3" max="10" value="5"></label>' +
      '<label>初年度使用月数 (月)<input id="depMo" type="number" min="1" max="12" value="12"></label>' +
      "</div>" +
      '<div class="sim-viz"><div id="depSvg"></div><div id="depTbl"></div></div>' +
      "</div>";

    const update = () => {
      const cost = Math.max(1000, +document.getElementById("depCost").value || 1000000);
      const life = Math.max(3, Math.min(10, Math.round(+document.getElementById("depLife").value || 5)));
      const mo = Math.max(1, Math.min(12, Math.round(+document.getElementById("depMo").value || 12)));
      const dbRate = 2 / life;
      const slAnn = Math.round(cost / life);

      let bvSL = cost, bvDB = cost;
      const slList = [], dbList = [];
      let rows = "";
      const totalYrs = mo < 12 ? life + 1 : life;
      for (let y = 1; y <= totalYrs; y++) {
        const mFrac = y === 1 ? mo / 12 : y === totalYrs && mo < 12 ? (12 - mo) / 12 : 1;
        let dSL = y === totalYrs ? Math.max(0, bvSL - 1) : Math.min(Math.max(0, bvSL - 1), Math.round(slAnn * mFrac));
        bvSL -= dSL;

        const remSpan = totalYrs - y + 1;
        let dDB = Math.round(bvDB * dbRate * mFrac);
        const remSL = Math.round(bvDB / remSpan);
        if (dDB < remSL && y > 1) dDB = remSL;
        if (y === totalYrs || bvDB - dDB < 1) dDB = Math.max(0, bvDB - 1);
        bvDB -= dDB;
        slList.push(dSL);
        dbList.push(dDB);
        rows += "<tr><td>" + y + '年目</td><td class="num">' + fmtYen(dSL) + '</td><td class="num">' + fmtYen(bvSL) + '</td><td class="num">' + fmtYen(dDB) + '</td><td class="num">' + fmtYen(bvDB) + "</td></tr>";
      }

      const maxD = Math.max(...slList, ...dbList, 1);
      const W = 480, H = 200, pL = 40, pR = 16, pT = 18, pB = 26;
      const grpW = (W - pL - pR) / totalYrs;
      const sy = (v) => H - pB - (v / maxD) * (H - pT - pB);
      let bars = "";
      for (let i = 0; i < totalYrs; i++) {
        const x0 = pL + i * grpW + 4;
        const bw = Math.max(6, (grpW - 12) / 2);
        bars += '<rect x="' + x0 + '" y="' + sy(slList[i]) + '" width="' + bw + '" height="' + (H - pB - sy(slList[i])) + '" fill="#0f766e"/>';
        bars += '<rect x="' + (x0 + bw + 2) + '" y="' + sy(dbList[i]) + '" width="' + bw + '" height="' + (H - pB - sy(dbList[i])) + '" fill="#3730a3"/>';
        bars += '<text x="' + (x0 + bw) + '" y="' + (H - 8) + '" font-size="10" text-anchor="middle" fill="currentColor">' + (i + 1) + "年</text>";
      }

      document.getElementById("depSvg").innerHTML =
        '<svg viewBox="0 0 ' + W + " " + H + '" class="sim-svg">' +
        '<line x1="' + pL + '" y1="' + (H - pB) + '" x2="' + (W - pR) + '" y2="' + (H - pB) + '" stroke="currentColor" opacity="0.4"/>' +
        bars +
        '<text x="' + (W - 140) + '" y="14" font-size="10" fill="#0f766e">■ 定額法</text>' +
        '<text x="' + (W - 75) + '" y="14" font-size="10" fill="#3730a3">■ 200%定率法</text>' +
        "</svg>";

      document.getElementById("depTbl").innerHTML =
        '<div class="table-wrap"><table><thead><tr><th>年度</th><th class="num">定額法償却</th><th class="num">定額法簿価</th><th class="num">定率法償却</th><th class="num">定率法簿価</th></tr></thead><tbody>' +
        rows + "</tbody></table></div>";
    };
    body.querySelectorAll("input").forEach((inp) => (inp.oninput = update));
    update();
  }

  /* =========================================================================
   * 3. LEARNING ANALYTICS DASHBOARD (📊 学習分析)
   * ========================================================================= */
  function renderAnalyticsView() {
    const root = document.getElementById("analyticsView");
    if (!root) return;

    const units = DATA.items.filter((it) => it.part !== "guide");
    const masteredUnits = units.filter(isDocMastered);
    const allDrills = DATA.drills || [];
    const masteredDrills = allDrills.filter((c) => state.srs[c.id] && state.srs[c.id].level >= 2);

    // Review Reminders (Day 0 -> Day 1 -> Day 7 -> Day 21)
    const now = Date.now();
    const reminders = [];
    let totalStamps = 0;
    units.forEach((u) => {
      const r = state.reviews[u.id] || {};
      ["day0", "day1", "day7", "day21"].forEach((k) => { if (r[k]) totalStamps++; });
      let nextStage = null, prevTs = null, waitDays = 0;
      if (r.day0 && !r.day1) { nextStage = "Day 1"; prevTs = r.day0; waitDays = 1; }
      else if (r.day1 && !r.day7) { nextStage = "Day 7"; prevTs = r.day1; waitDays = 6; }
      else if (r.day7 && !r.day21) { nextStage = "Day 21"; prevTs = r.day7; waitDays = 14; }
      if (nextStage) {
        const daysElapsed = typeof prevTs === "string" ? Math.floor((now - Date.parse(prevTs)) / 86400000) : 0;
        reminders.push({ doc: u, nextStage, daysElapsed, due: daysElapsed >= waitDays });
      }
    });

    // Weak units in SRS
    const weakMap = {};
    allDrills.forEach((c) => {
      const rec = state.srs[c.id];
      if (rec && rec.level === 0) weakMap[c.docId] = (weakMap[c.docId] || 0) + 1;
    });
    const weakUnits = Object.keys(weakMap)
      .map((id) => ({ doc: DATA.items.find((x) => x.id === id), cnt: weakMap[id] }))
      .filter((x) => x.doc)
      .sort((a, b) => b.cnt - a.cnt)
      .slice(0, 8);

    const makeBars = (groups, filterFn) =>
      groups
        .map((g) => {
          const list = DATA.items.filter((it) => filterFn(it, g));
          if (list.length === 0) return "";
          const done = list.filter(isDocMastered).length;
          const pct = Math.round((done / list.length) * 100);
          return (
            '<div class="bar-row"><div class="bar-label"><span>' + escapeHtml(g.name) + "</span><span>" + done + " / " + list.length + " (" + pct + '%)</span></div>' +
            '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>'
          );
        })
        .join("");

    let html =
      '<div class="studio-header">' +
      "<div><h2>📊 学習アナリティクス＆復習ダッシュボード</h2>" +
      '<p class="studio-sub">全64巻の習得率、貫通ライン別バランス、分散復習スケジュール、仕訳道場の弱点を可視化します。</p></div></div>';

    html +=
      '<div class="kpi-grid">' +
      '<div class="kpi-box"><div class="kpi-lbl">総合単元習得率</div><div class="kpi-val accent">' + Math.round((masteredUnits.length / Math.max(1, units.length)) * 100) + "% (" + masteredUnits.length + "/" + units.length + ")</div></div>" +
      '<div class="kpi-box"><div class="kpi-lbl">仕訳道場マスター</div><div class="kpi-val emerald-txt">' + masteredDrills.length + " / " + allDrills.length + "問</div></div>" +
      '<div class="kpi-box"><div class="kpi-lbl">復習待ち単元</div><div class="kpi-val amber-txt">' + reminders.length + "件</div></div>" +
      '<div class="kpi-box"><div class="kpi-lbl">分散復習スタンプ</div><div class="kpi-val">' + totalStamps + "回</div></div>" +
      "</div>";

    html += '<div class="analytics-two-col">';
    html += '<div class="studio-card"><h3>級別・パート別 進捗</h3>' + makeBars(DATA.parts, (it, g) => it.part === g.id) + "</div>";
    html += '<div class="studio-card"><h3>貫通ライン別（Line A〜F）マスター度</h3>' + makeBars(DATA.lines, (it, g) => it.line.includes(g.id)) + "</div>";
    html += "</div>";

    html += '<div class="analytics-two-col">';
    html += '<div class="studio-card"><h3>⏰ 分散復習リマインダー</h3>';
    if (reminders.length === 0) {
      html += '<p class="studio-sub">各単元右上の「Day 0」ボタンを押すと、Day 1 / Day 7 / Day 21 の復習キューが自動生成されます。</p>';
    } else {
      reminders.slice(0, 10).forEach((rem) => {
        html +=
          '<div class="list-action-row"><div><span class="meta-pill accent">' + escapeHtml(rem.doc.id) + "</span> " +
          escapeHtml(rem.doc.title) + ' <span class="meta-pill ' + (rem.due ? "danger-pill" : "amber") + '">次: ' + rem.nextStage + (rem.due ? " (期限到来)" : " (" + rem.daysElapsed + "日経過)") + "</span></div>" +
          '<button type="button" class="mask-btn jump-doc-btn" data-doc="' + escapeHtml(rem.doc.id) + '">復習する</button></div>';
      });
    }
    html += "</div>";

    html += '<div class="studio-card"><h3>🎯 仕訳道場・弱点単元ランキング</h3>';
    if (weakUnits.length === 0) {
      html += '<p class="studio-sub">仕訳道場で「🔴 要復習」に分類されたカードはありません。</p>';
    } else {
      weakUnits.forEach((w) => {
        html +=
          '<div class="list-action-row"><div><span class="meta-pill accent">' + escapeHtml(w.doc.id) + "</span> " +
          escapeHtml(w.doc.title) + ' <span class="meta-pill danger-pill">要復習 ' + w.cnt + "問</span></div>" +
          '<button type="button" class="mask-btn jump-weak-drill-btn" data-doc="' + escapeHtml(w.doc.id) + '">特訓する</button></div>';
      });
    }
    html += "</div></div>";

    root.innerHTML = html;
    root.querySelectorAll(".jump-doc-btn").forEach((b) => {
      b.onclick = () => openDoc(b.dataset.doc);
    });
    root.querySelectorAll(".jump-weak-drill-btn").forEach((b) => {
      b.onclick = () => {
        drillState.part = "all";
        drillState.queueMode = "weak";
        drillState.docFilter = b.dataset.doc;
        rebuildDeck(false);
        switchStudioMode("drill");
      };
    });
  }

  /* =========================================================================
   * 5. CHEAT SHEET & RED-SHEET RECALL STUDIO (⚡ 暗記シート)
   * ========================================================================= */
  if (!Array.isArray(state.pinnedCheats)) state.pinnedCheats = [];

  const cheatState = {
    tab: "all", // "all" | "CS-01".."CS-06" | "pinned"
    query: "",
    redSheet: true,
    tempRevealAll: false
  };

  let cachedCheatTables = null;

  function formatInlineCheat(text) {
    let s = escapeHtml(String(text || ""));
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return s;
  }

  function parseMarkdownTableRow(line) {
    let t = line.trim();
    if (t.startsWith("|")) t = t.slice(1);
    if (t.endsWith("|")) t = t.slice(0, -1);
    return t.split("|").map((c) => c.trim());
  }

  function isSeparatorTableRow(line) {
    const t = line.trim();
    return /^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(t);
  }

  function extractCheatTables() {
    if (cachedCheatTables) return cachedCheatTables;
    const docs = (DATA.items || []).filter((it) => it.part === "cheat" && it.available && it.markdown);
    const tables = [];
    docs.forEach((doc) => {
      const lines = doc.markdown.split(/\r?\n/);
      let h2 = "";
      let h3 = "";
      let tableIdx = 0;
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        if (line.startsWith("## ")) {
          h2 = line.slice(3).trim();
          h3 = "";
          i++;
          continue;
        }
        if (line.startsWith("### ")) {
          h3 = line.slice(4).trim();
          i++;
          continue;
        }
        if (line.trim().startsWith("|") && i + 1 < lines.length && isSeparatorTableRow(lines[i + 1])) {
          const headers = parseMarkdownTableRow(line);
          i += 2;
          const rows = [];
          while (i < lines.length && lines[i].trim().startsWith("|")) {
            const cells = parseMarkdownTableRow(lines[i]);
            if (cells.length >= 2) {
              while (cells.length < headers.length) cells.push("");
              const rowId = doc.id + "::" + tableIdx + "::" + rows.length;
              rows.push({ id: rowId, cells: cells.slice(0, headers.length) });
            }
            i++;
          }
          if (rows.length > 0) {
            tables.push({
              docId: doc.id,
              docTitle: doc.title,
              section: h3 ? h2 + " / " + h3 : h2 || doc.title,
              headers,
              rows
            });
            tableIdx++;
          }
          continue;
        }
        i++;
      }
    });
    cachedCheatTables = tables;
    return tables;
  }

  function togglePinCheat(rowId) {
    const idx = state.pinnedCheats.indexOf(rowId);
    if (idx >= 0) state.pinnedCheats.splice(idx, 1);
    else state.pinnedCheats.push(rowId);
    saveState();
  }

  function renderCheatResults() {
    const container = document.getElementById("cheatResults");
    if (!container) return;
    const allTables = extractCheatTables();
    const q = cheatState.query.trim().toLowerCase();
    const pinnedSet = new Set(state.pinnedCheats);

    let matchedRows = 0;
    let html = "";

    allTables.forEach((tbl) => {
      if (cheatState.tab !== "all" && cheatState.tab !== "pinned" && tbl.docId !== cheatState.tab) return;

      const filteredRows = tbl.rows.filter((r) => {
        if (cheatState.tab === "pinned" && !pinnedSet.has(r.id)) return false;
        if (!q) return true;
        const hay = (tbl.docId + " " + tbl.docTitle + " " + tbl.section + " " + r.cells.join(" ")).toLowerCase();
        return hay.includes(q);
      });

      if (filteredRows.length === 0) return;
      matchedRows += filteredRows.length;

      // For CS-05 (No. | キーワード | ...), keep col 0 & col 1 visible, mask col 2+.
      // For CS-02 mini journals (取引 | 借方科目 | 借方金額 | 貸方科目 | 貸方金額), keep col 0 visible, mask col 1+.
      // Otherwise keep col 0 visible, mask col 1..min(last) (all answer/logic columns).
      const firstHeader = tbl.headers[0] || "";
      const visibleColLimit = firstHeader === "No." ? 2 : 1;

      html +=
        '<div class="studio-card cheat-sheet-card">' +
        '<div class="cheat-card-head">' +
        '<div><span class="meta-pill accent">' + escapeHtml(tbl.docId) + '</span> <strong>' + escapeHtml(tbl.section) + '</strong></div>' +
        '<button type="button" class="mask-btn cheat-open-doc" data-doc="' + escapeHtml(tbl.docId) + '">📖 このシートを全文で読む</button>' +
        '</div>' +
        '<div class="cheat-table-wrap"><table class="cheat-table"><thead><tr>' +
        '<th class="pin-col">📌</th>' +
        tbl.headers.map((h) => "<th>" + formatInlineCheat(h) + "</th>").join("") +
        "</tr></thead><tbody>";

      filteredRows.forEach((r) => {
        const isPinned = pinnedSet.has(r.id);
        html += '<tr class="' + (isPinned ? "cheat-row-pinned" : "") + '">';
        html +=
          '<td class="pin-col"><button type="button" class="pin-btn' + (isPinned ? " pinned" : "") + '" data-pin-id="' + escapeHtml(r.id) + '" title="苦手・重点項目としてピン留め">' +
          (isPinned ? "★" : "☆") +
          "</button></td>";
        r.cells.forEach((cell, cIdx) => {
          const isTarget = cIdx >= visibleColLimit && cell.trim() !== "" && cell.trim() !== "—";
          if (isTarget && cheatState.redSheet) {
            const revCls = cheatState.tempRevealAll ? " revealed" : "";
            html += '<td><span class="cheat-mask' + revCls + '" tabindex="0" role="button" title="クリックで開示／再隠蔽">' + formatInlineCheat(cell) + "</span></td>";
          } else {
            html += "<td>" + formatInlineCheat(cell) + "</td>";
          }
        });
        html += "</tr>";
      });

      html += "</tbody></table></div></div>";
    });

    if (matchedRows === 0) {
      html =
        '<div class="studio-card"><p class="studio-sub">' +
        (cheatState.tab === "pinned"
          ? "まだピン留めされた項目がありません。各行左端の ☆ を押すとここに集約されます。"
          : "条件に一致する暗記項目が見つかりませんでした。") +
        "</p></div>";
    }

    container.innerHTML = html;

    container.querySelectorAll(".cheat-open-doc").forEach((b) => {
      b.onclick = () => openDoc(b.dataset.doc);
    });
    container.querySelectorAll(".pin-btn").forEach((b) => {
      b.onclick = () => {
        togglePinCheat(b.dataset.pinId);
        renderCheatView(true);
      };
    });
    container.querySelectorAll(".cheat-mask").forEach((m) => {
      const toggle = () => m.classList.toggle("revealed");
      m.onclick = toggle;
      m.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      };
    });
  }

  function renderCheatView(preserveInputFocus = false) {
    const root = document.getElementById("cheatView");
    if (!root) return;

    const docs = (DATA.items || []).filter((it) => it.part === "cheat" && it.available);
    const pinCount = state.pinnedCheats.length;

    const tabs = [{ id: "all", label: "すべて" }]
      .concat(docs.map((d) => ({ id: d.id, label: d.id })))
      .concat([{ id: "pinned", label: "📌 ピン留め (" + pinCount + ")" }]);

    if (!preserveInputFocus || !document.getElementById("cheatResults")) {
      let html =
        '<div class="studio-shell">' +
        '<div class="studio-hero"><div>' +
        '<h2>⚡ 本質チートシート＆赤シート暗記スタジオ</h2>' +
        '<p class="studio-sub">Part VII（CS-01〜CS-06）の全基準比較・仕訳トリガー・工簿公式・理論80語・罠を横断検索。赤シートONで答えのセルをタップ開示できます。</p>' +
        "</div>" +
        '<div class="cheat-top-actions">' +
        '<button type="button" id="cheatRedToggleBtn" class="tool-btn' + (cheatState.redSheet ? " active" : "") + '">' +
        (cheatState.redSheet ? "🔴 赤シート ON" : "⚪ 赤シート OFF") +
        "</button>" +
        '<button type="button" id="cheatRevealAllBtn" class="mask-btn"' + (!cheatState.redSheet ? " disabled" : "") + ">" +
        (cheatState.tempRevealAll ? "🙈 すべて再隠蔽" : "👁 すべて一時開示") +
        "</button>" +
        "</div></div>";

      html += '<div class="studio-card cheat-toolbar">';
      html += '<div class="cheat-tabs">';
      tabs.forEach((t) => {
        html +=
          '<button type="button" class="sim-tab-btn cheat-tab-btn' + (cheatState.tab === t.id ? " active" : "") + '" data-ctab="' + escapeHtml(t.id) + '">' +
          escapeHtml(t.label) +
          "</button>";
      });
      html += "</div>";
      html +=
        '<div class="cheat-search-wrap">' +
        '<input id="cheatSearchInput" class="cheat-search" type="search" placeholder="キーワード横断検索（例：新リース、のれん、シュラッター、200%、CR、NPV）..." value="' +
        escapeHtml(cheatState.query) +
        '" />' +
        "</div></div>";

      html += '<div id="cheatResults"></div></div>';
      root.innerHTML = html;

      document.getElementById("cheatRedToggleBtn").onclick = () => {
        cheatState.redSheet = !cheatState.redSheet;
        cheatState.tempRevealAll = false;
        renderCheatView(false);
      };
      document.getElementById("cheatRevealAllBtn").onclick = () => {
        cheatState.tempRevealAll = !cheatState.tempRevealAll;
        renderCheatView(false);
      };
      root.querySelectorAll(".cheat-tab-btn").forEach((b) => {
        b.onclick = () => {
          cheatState.tab = b.dataset.ctab;
          renderCheatView(false);
        };
      });
      document.getElementById("cheatSearchInput").addEventListener("input", (e) => {
        cheatState.query = e.target.value;
        renderCheatResults();
      });
    } else {
      const pinTab = root.querySelector('.cheat-tab-btn[data-ctab="pinned"]');
      if (pinTab) pinTab.textContent = "📌 ピン留め (" + pinCount + ")";
    }

    renderCheatResults();
  }

  window.BokiStudioTools = {
    onModeChange(mode) {
      if (mode === "drill") renderDrillView();
      else if (mode === "sim") renderSimView();
      else if (mode === "analytics") renderAnalyticsView();
      else if (mode === "cheat") renderCheatView();
    }
  };
})();
