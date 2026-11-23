(function () {
  "use strict";

  const studio = window.BokiStudio;
  if (!studio) return;

  const {
    DATA,
    state,
    saveState,
    openDoc,
    switchStudioMode,
    isDocMastered,
    escapeHtml,
    MISTAKE_REASONS,
    getTodayKey,
    recordStudyActivity,
    getStreakDays,
    previewSm2Interval,
    recordSrsReview,
    isCardDue,
    isCardLeech,
    getUnitReviewStatus,
    getDueSummary,
    toggleDocReviewStage
  } = studio;
  if (!state.srs) state.srs = {};
  if (!state.mistakes) state.mistakes = {};
  if (!state.studyLog) state.studyLog = {};
  if (!Array.isArray(state.cbtHistory)) state.cbtHistory = [];
  if (!state.prefs) state.prefs = { drillMode: "input", cbtView: "single", sessionLimit: 10 };

  const fmtYen = (n) => Math.round(n).toLocaleString("ja-JP") + "円";
  const fmtNum = (n, d = 0) =>
    Number(n).toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });

  /* =========================================================================
   * 0. SHARED ESSENCE CLASSIFIER, DIAGNOSIS, INLINE CALC, SM-2 & MISTAKE UI
   * ========================================================================= */
  const INLINE_CALC_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="2" width="10" height="12" rx="1.5"/><line x1="5.25" y1="5" x2="10.75" y2="5"/><line x1="5.5" y1="8.25" x2="6.5" y2="8.25"/><line x1="9.5" y1="8.25" x2="10.5" y2="8.25"/><line x1="5.5" y1="11" x2="6.5" y2="11"/><line x1="9.5" y1="11" x2="10.5" y2="11"/></svg>';
  const CLOCK_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8.5" r="5.25"/><polyline points="8 5.5 8 8.5 10 9.75"/><line x1="6.25" y1="1.75" x2="9.75" y2="1.75"/></svg>';

  function classifySubjectElement(sub) {
    const s = String(sub || "").trim();
    if (!s) return "";
    if (s.includes("減価償却累計額") || (s.includes("貸倒引当金") && !s.includes("繰入") && !s.includes("戻入"))) {
      return "評価勘定";
    }
    if (s === "自己株式") return "純資産(控除)";
    if (
      /^(資本金|資本準備金|資本剰余金|その他資本剰余金|利益準備金|繰越利益剰余金|利益剰余金期首残高|別途積立金|剰余金の配当|非支配株主持分|その他有価証券評価差額金|繰延ヘッジ損益)$/.test(s) ||
      (s.includes("新株予約権") && !s.includes("戻入益")) ||
      s === "繰延内部利益"
    ) {
      return "純資産";
    }
    if (
      /^売上($|高|（)/.test(s) ||
      s === "完成工事高" ||
      s.startsWith("受取") ||
      s === "役務収益" ||
      s === "有価証券利息" ||
      s.includes("戻入") ||
      (s.endsWith("益") && !s.includes("損益") && !s.includes("利益"))
    ) {
      return "収益";
    }
    if (
      /^(仕入|売上原価|完成工事原価|役務原価|給料|賃金・給料|賞与|法定福利費|租税公課|繰延内部利益控除|非支配株主に帰属する当期純利益)$/.test(s) ||
      s.includes("繰入") ||
      (s.includes("償却") && !s.includes("累計額")) ||
      s.startsWith("支払") ||
      s.endsWith("費") ||
      (s.includes("損") && !s.includes("損益") && !s.includes("引当金")) ||
      (s.includes("法人税") && !s.includes("未払") && !s.includes("仮払") && !s.includes("未収"))
    ) {
      return "費用";
    }
    if (
      /^(買掛金|当座借越|電子記録債務|資産除去債務|保証債務|諸負債)$/.test(s) ||
      s.includes("未払") ||
      s.includes("前受") ||
      s.includes("仮受") ||
      s.includes("預り金") ||
      s.includes("借入金") ||
      s.includes("引当金") ||
      s.includes("負債") ||
      s === "社債" ||
      s === "新株予約権付社債"
    ) {
      return "負債";
    }
    if (/^(製造間接費|仕掛品|材料|製品|仕損品|賃金|標準原価改定差額)/.test(s) || s.includes("差異")) {
      return "原価・製造";
    }
    if (/^(仮払金|現金過不足|火災未決算|損益|諸口|本店|履行差額)$/.test(s)) {
      return "仮・清算";
    }
    return "資産";
  }

  function elementDirectionLabel(elem, side) {
    if (!elem) return "";
    if (side === "d") {
      if (elem === "資産") return "資産 +";
      if (elem === "負債") return "負債 -";
      if (elem === "純資産") return "純資産 -";
      if (elem === "純資産(控除)") return "純資産 -";
      if (elem === "費用") return "費用 発生";
      if (elem === "収益") return "収益 取消";
      if (elem === "評価勘定") return "評価勘定 -";
      return elem + " (借)";
    }
    if (elem === "資産") return "資産 -";
    if (elem === "負債") return "負債 +";
    if (elem === "純資産") return "純資産 +";
    if (elem === "純資産(控除)") return "純資産 +";
    if (elem === "収益") return "収益 発生";
    if (elem === "費用") return "費用 取消";
    if (elem === "評価勘定") return "評価勘定 +";
    return elem + " (貸)";
  }

  function formatFiveElementHint(card) {
    const dElems = [];
    const cElems = [];
    (card.rows || []).forEach((r) => {
      if (r.dSub) dElems.push(elementDirectionLabel(classifySubjectElement(r.dSub), "d"));
      if (r.cSub) cElems.push(elementDirectionLabel(classifySubjectElement(r.cSub), "c"));
    });
    const doc = (DATA.items || []).find((it) => it.id === card.docId);
    const fmtStr = doc && doc.formats && doc.formats.length ? doc.formats.join(" / ") : "仕訳思考";
    return {
      debit: Array.from(new Set(dElems)).join(" · ") || "—",
      credit: Array.from(new Set(cElems)).join(" · ") || "—",
      formats: fmtStr
    };
  }

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

  function getPremiseSummary(body, focusLine) {
    if (!focusLine || !body) return "";
    const lines = String(body).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l === focusLine.trim() || /^(\d+[.)]|[(（]\d+[)）])/.test(l)) break;
      out.push(l);
      if (out.length >= 2) break;
    }
    return out.join(" ");
  }

  function extractMultisets(rows, isUser) {
    const dPairs = [];
    const cPairs = [];
    let dSum = 0;
    let cSum = 0;
    (rows || []).forEach((r) => {
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

  function diagnoseJournalAnswer(userRows, answerRows, opts) {
    const subjectsOnly = !!(opts && opts.subjectsOnly);
    const user = extractMultisets(userRows, true);
    const ans = extractMultisets(answerRows, false);

    if (user.dPairs.length === 0 && user.cPairs.length === 0) {
      return {
        status: "wrong",
        message: subjectsOnly ? "借方・貸方の勘定科目を入力してください。" : "借方・貸方の勘定科目と金額を入力してください。",
        details: [],
        dUserSum: 0,
        cUserSum: 0,
        suggestedQuality: 0
      };
    }

    const pairsEqual = (a, b) =>
      a.length === b.length && a.every((x, idx) => x.sub === b[idx].sub && x.amt === b[idx].amt);
    const subsEqual = (a, b) => {
      const sa = a.map((x) => x.sub).filter(Boolean).sort();
      const sb = b.map((x) => x.sub).filter(Boolean).sort();
      return sa.length === sb.length && sa.every((x, idx) => x === sb[idx]);
    };

    const subMatch = subsEqual(user.dPairs, ans.dPairs) && subsEqual(user.cPairs, ans.cPairs);
    if (subjectsOnly) {
      if (subMatch) {
        return {
          status: "perfect",
          message: "完全正解 — 借方・貸方の勘定科目がすべて一致しています。",
          details: [],
          dUserSum: 0,
          cUserSum: 0,
          suggestedQuality: 2
        };
      }
      const reversedSub = subsEqual(user.dPairs, ans.cPairs) && subsEqual(user.cPairs, ans.dPairs);
      const details = [];
      if (reversedSub) {
        details.push("借方と貸方が逆になっています（5要素の増減方向を確認しましょう）。");
      } else {
        const dDiffCnt = ans.dPairs.length - user.dPairs.length;
        const cDiffCnt = ans.cPairs.length - user.cPairs.length;
        if (dDiffCnt !== 0 || cDiffCnt !== 0) {
          details.push("科目数：借方 " + user.dPairs.length + "/" + ans.dPairs.length + "、貸方 " + user.cPairs.length + "/" + ans.cPairs.length);
        }
      }
      return {
        status: "wrong",
        message: "不正解（要復習）— 下の模範仕訳と5要素の向きを確認しましょう。",
        details,
        dUserSum: 0,
        cUserSum: 0,
        suggestedQuality: 0
      };
    }

    const exactMatch = pairsEqual(user.dPairs, ans.dPairs) && pairsEqual(user.cPairs, ans.cPairs);
    if (exactMatch) {
      return {
        status: "perfect",
        message: "完全正解 — 科目・金額・貸借すべて一致しています。",
        details: [],
        dUserSum: user.dSum,
        cUserSum: user.cSum,
        suggestedQuality: 2
      };
    }

    const details = [];
    if (user.dSum !== user.cSum) {
      details.push("入力の借貸合計が不一致です（差額 " + fmtYen(Math.abs(user.dSum - user.cSum)) + "）。");
    }

    if (subMatch) {
      if (user.dSum !== ans.dSum) {
        details.push("借方合計の差：" + fmtYen(user.dSum) + "（模範 " + fmtYen(ans.dSum) + "）");
      }
      if (user.cSum !== ans.cSum) {
        details.push("貸方合計の差：" + fmtYen(user.cSum) + "（模範 " + fmtYen(ans.cSum) + "）");
      }
      return {
        status: "partial",
        message: "惜しい — 勘定科目は完全一致ですが、金額の算定または配分を見直しましょう。",
        details,
        dUserSum: user.dSum,
        cUserSum: user.cSum,
        suggestedQuality: 1
      };
    }

    const reversedPairs = pairsEqual(user.dPairs, ans.cPairs) && pairsEqual(user.cPairs, ans.dPairs);
    const reversedSubs = subsEqual(user.dPairs, ans.cPairs) && subsEqual(user.cPairs, ans.dPairs);
    if (reversedPairs || reversedSubs) {
      details.push("借方と貸方が逆になっています（5要素の増減方向を再確認しましょう）。");
    } else {
      const missingD = ans.dPairs.filter((a) => !user.dPairs.some((u) => u.sub === a.sub)).map((a) => a.sub);
      const missingC = ans.cPairs.filter((a) => !user.cPairs.some((u) => u.sub === a.sub)).map((a) => a.sub);
      if (missingD.length) details.push("借方に不足・異なる科目があります（" + missingD.length + "件）。");
      if (missingC.length) details.push("貸方に不足・異なる科目があります（" + missingC.length + "件）。");
    }

    return {
      status: "wrong",
      message: "不正解（要復習）— 下の模範仕訳と差分ポイントを確認しましょう。",
      details,
      dUserSum: user.dSum,
      cUserSum: user.cSum,
      suggestedQuality: 0
    };
  }

  /* Inline Mini Calculator */
  const inlineCalcState = {
    open: false,
    expr: "",
    resultText: "0",
    numVal: null,
    history: []
  };

  function evalInlineCalcExpr(rawExpr) {
    const cleaned = String(rawExpr || "")
      .replace(/[０-９．＋－×÷（）]/g, (ch) => {
        if (ch === "．") return ".";
        if (ch === "＋") return "+";
        if (ch === "－") return "-";
        if (ch === "×") return "*";
        if (ch === "÷") return "/";
        if (ch === "（") return "(";
        if (ch === "）") return ")";
        return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
      })
      .replace(/,/g, "")
      .replace(/\s+/g, "");
    if (!cleaned) return { ok: false, text: "0", num: null };
    if (!/^[0-9+\-*/().]+$/.test(cleaned)) return { ok: false, text: "式エラー", num: null };
    try {
      const val = Function('"use strict"; return (' + cleaned + ")")();
      if (typeof val !== "number" || !isFinite(val)) return { ok: false, text: "式エラー", num: null };
      const rounded = Math.round(val * 10000) / 10000;
      return {
        ok: true,
        text: rounded.toLocaleString("ja-JP", { maximumFractionDigits: 4 }),
        num: rounded,
        expr: cleaned
      };
    } catch (e) {
      return { ok: false, text: "式エラー", num: null };
    }
  }

  function renderInlineCalcHtml() {
    if (!inlineCalcState.open) return "";
    return (
      '<div class="inline-calc-box" id="inlineCalcBox">' +
      '<div class="inline-calc-row">' +
      '<input id="inlineCalcInput" type="text" class="drill-cell-input inline-calc-input" placeholder="計算式 (例: 630000*0.02)" value="' + escapeHtml(inlineCalcState.expr) + '" aria-label="ミニ電卓の計算式" />' +
      '<button type="button" class="secondary-btn" id="inlineCalcEvalBtn">＝</button>' +
      '<span id="inlineCalcResult" class="inline-calc-result">' + escapeHtml(inlineCalcState.resultText) + "</span>" +
      '<button type="button" class="primary-btn" id="inlineCalcTransferBtn"' + (inlineCalcState.numVal === null ? " disabled" : "") + ">金額欄へ転記</button>" +
      "</div>" +
      (inlineCalcState.history.length
        ? '<div class="inline-calc-history">' + inlineCalcState.history.map((h) => "<span>" + escapeHtml(h) + "</span>").join(" · ") + "</div>"
        : "") +
      "</div>"
    );
  }

  function bindInlineCalc(root, onTransfer) {
    const box = root.querySelector("#inlineCalcBox");
    if (!box) return;
    const inp = box.querySelector("#inlineCalcInput");
    const resEl = box.querySelector("#inlineCalcResult");
    const trBtn = box.querySelector("#inlineCalcTransferBtn");
    const runEval = () => {
      inlineCalcState.expr = inp.value;
      const ev = evalInlineCalcExpr(inp.value);
      inlineCalcState.resultText = ev.text;
      inlineCalcState.numVal = ev.num;
      if (ev.ok && ev.expr) {
        const entry = ev.expr + "=" + ev.text;
        if (inlineCalcState.history[0] !== entry) {
          inlineCalcState.history = [entry].concat(inlineCalcState.history).slice(0, 3);
        }
      }
      if (resEl) resEl.textContent = ev.text;
      if (trBtn) trBtn.disabled = ev.num === null;
    };
    box.querySelector("#inlineCalcEvalBtn").onclick = runEval;
    inp.addEventListener("input", () => {
      inlineCalcState.expr = inp.value;
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        runEval();
      }
    });
    if (trBtn) {
      trBtn.onclick = () => {
        if (inlineCalcState.numVal === null) runEval();
        if (inlineCalcState.numVal !== null && typeof onTransfer === "function") {
          onTransfer(inlineCalcState.numVal);
        }
      };
    }
  }

  /* Mistake Notebook Helper */
  function ensureMistakeRecord(cardId) {
    if (!state.mistakes[cardId]) {
      state.mistakes[cardId] = { reasons: [], note: "", count: 0, lastWrongAt: "" };
    }
    if (!Array.isArray(state.mistakes[cardId].reasons)) state.mistakes[cardId].reasons = [];
    return state.mistakes[cardId];
  }

  function bumpMistakeCount(cardId) {
    const m = ensureMistakeRecord(cardId);
    m.count = (m.count || 0) + 1;
    m.lastWrongAt = new Date().toISOString();
    saveState();
  }

  function renderMistakeTagBoxHtml(cardId) {
    const rec = state.mistakes[cardId] || { reasons: [], note: "", count: 0 };
    const selected = new Set(rec.reasons || []);
    return (
      '<div class="mistake-tag-box" data-mistake-card="' + escapeHtml(cardId) + '">' +
      '<div class="mistake-tag-head"><span class="mistake-tag-title">誤答原因タグ・1行メモ</span>' +
      (rec.count ? '<span class="meta-pill">誤答 ' + rec.count + "回</span>" : "") +
      "</div>" +
      '<div class="mistake-chips-row">' +
      MISTAKE_REASONS.map((r) => {
        const on = selected.has(r);
        return '<button type="button" class="mistake-chip' + (on ? " active" : "") + '" data-reason="' + escapeHtml(r) + '" aria-pressed="' + (on ? "true" : "false") + '">' + escapeHtml(r) + "</button>";
      }).join("") +
      "</div>" +
      '<input type="text" class="drill-cell-input mistake-note-input" placeholder="次間違えないための1行メモ（自動保存）..." value="' + escapeHtml(rec.note || "") + '" aria-label="誤答メモ" />' +
      "</div>"
    );
  }

  function bindMistakeTagBox(root, cardId) {
    const box = root.querySelector('.mistake-tag-box[data-mistake-card="' + cardId + '"]');
    if (!box) return;
    box.querySelectorAll(".mistake-chip").forEach((btn) => {
      btn.onclick = () => {
        const rec = ensureMistakeRecord(cardId);
        const r = btn.dataset.reason;
        const idx = rec.reasons.indexOf(r);
        if (idx >= 0) rec.reasons.splice(idx, 1);
        else rec.reasons.push(r);
        btn.classList.toggle("active", idx < 0);
        btn.setAttribute("aria-pressed", idx < 0 ? "true" : "false");
        saveState();
      };
    });
    const noteInp = box.querySelector(".mistake-note-input");
    if (noteInp) {
      noteInp.addEventListener("input", () => {
        const rec = ensureMistakeRecord(cardId);
        rec.note = noteInp.value;
        saveState();
      });
    }
  }

  /* SM-2 4-step Rating Bar */
  function renderSm2BarHtml(cardId, autoAppliedQuality) {
    const rec = state.srs[cardId];
    const items = [
      { q: 0, label: "もう一度", cls: "srs-bad" },
      { q: 1, label: "難しい", cls: "srs-mid" },
      { q: 2, label: "普通", cls: "srs-good" },
      { q: 3, label: "簡単", cls: "srs-easy" }
    ];
    let h = '<div class="drill-srs-bar">';
    h += '<div class="srs-header-line"><span class="srs-label">' +
      (typeof autoAppliedQuality === "number"
        ? "復習間隔を調整（1〜4キーで変更して次問へ / Enterでこのまま次問）："
        : "理解度記録 SM-2（1〜4キー）：") +
      "</span></div>";
    h += '<div class="sm2-rating-grid">';
    items.forEach((it) => {
      const pv = previewSm2Interval(rec, it.q);
      const isAuto = autoAppliedQuality === it.q;
      h +=
        '<button type="button" class="srs-btn ' + it.cls + (isAuto ? " is-recommended" : "") + '" data-sm2-q="' + it.q + '">' +
        '<span class="srs-btn-title">' + it.label + ' <kbd>' + (it.q + 1) + "</kbd></span>" +
        '<span class="srs-btn-sub">' + escapeHtml(pv.label) + "</span>" +
        "</button>";
    });
    h += "</div></div>";
    return h;
  }

  function bindSm2Bar(root, onRate) {
    root.querySelectorAll("[data-sm2-q]").forEach((b) => {
      b.onclick = () => onRate(Number(b.dataset.sm2Q));
    });
  }

  function renderSessionProgressHtml(doneCount, totalCount) {
    if (!totalCount || totalCount <= 0) return "";
    const pct = Math.min(100, Math.round((doneCount / totalCount) * 100));
    return (
      '<div class="session-progress-wrap">' +
      '<div class="session-progress-track"><div class="session-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="session-progress-label">集中セット ' + Math.min(doneCount + 1, totalCount) + " / " + totalCount + "</span>" +
      "</div>"
    );
  }

  function renderSessionSummaryHtml(title, logList, wrongBtnId, retryBtnId, backBtnId) {
    const total = logList.length;
    const okCount = logList.filter((x) => x.ok).length;
    const wrongList = logList.filter((x) => !x.ok);
    const pct = total ? Math.round((okCount / total) * 100) : 0;
    const totalSec = logList.reduce((acc, x) => acc + (x.sec || 0), 0);
    const avgSec = total ? Math.round(totalSec / total) : 0;

    const reasonCounts = {};
    wrongList.forEach((w) => {
      const m = state.mistakes[w.cardId];
      if (m && Array.isArray(m.reasons)) {
        m.reasons.forEach((r) => { reasonCounts[r] = (reasonCounts[r] || 0) + 1; });
      }
    });
    const reasonEntries = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);

    let h = '<div class="studio-card session-summary-card">';
    h += "<h2>" + escapeHtml(title) + "</h2>";
    h += '<div class="kpi-grid">';
    h += '<div class="kpi-box"><div class="kpi-lbl">正答数</div><div class="kpi-val accent">' + okCount + " / " + total + "</div></div>";
    h += '<div class="kpi-box"><div class="kpi-lbl">正答率</div><div class="kpi-val emerald-txt">' + pct + "%</div></div>";
    h += '<div class="kpi-box"><div class="kpi-lbl">平均解答時間</div><div class="kpi-val">' + avgSec + "秒</div></div>";
    h += '<div class="kpi-box"><div class="kpi-lbl">要復習</div><div class="kpi-val danger-txt">' + wrongList.length + "問</div></div>";
    h += "</div>";
    if (reasonEntries.length) {
      h += '<div class="summary-reasons"><strong>今回の誤答原因：</strong>' +
        reasonEntries.map(([r, c]) => '<span class="meta-pill">' + escapeHtml(r) + " (" + c + ")</span>").join(" ") +
        "</div>";
    }
    h += '<div class="drill-actions" style="margin-top:16px; display:flex; flex-wrap:wrap; gap:8px;">';
    if (wrongList.length > 0 && wrongBtnId) {
      h += '<button type="button" class="primary-btn" id="' + wrongBtnId + '">間違えた問題だけ再挑戦（' + wrongList.length + "問）</button>";
    }
    if (retryBtnId) {
      h += '<button type="button" class="' + (wrongList.length ? "secondary-btn" : "primary-btn") + '" id="' + retryBtnId + '">もう1セット解く</button>';
    }
    if (backBtnId) {
      h += '<button type="button" class="mask-btn" id="' + backBtnId + '">通常モードへ戻る</button>';
    }
    h += "</div></div>";
    return h;
  }

  /* =========================================================================
   * 1. DOJO SHELL & TAB BAR + TODAY'S REVIEW HUB + MISTAKE NOTEBOOK
   * ========================================================================= */
  const drillState = {
    hasInitializedTab: false,
    dojoTab: "journal", // "today" | "journal" | "calc" | "theory" | "cbt" | "past"
    mode: state.prefs.drillMode || "input", // "input" | "subject" | "flash"
    mobileFiltersOpen: false,
    part: "all",
    queueMode: "all", // "all" | "due" | "unmastered" | "leech"
    sessionLimit: typeof state.prefs.sessionLimit === "number" ? state.prefs.sessionLimit : 10,
    docFilter: "",
    deck: [],
    idx: 0,
    revealStep: 0, // flash mode: 0 hidden, 1 subjects, 2 full
    inputRows: [{ dSub: "", dAmt: "", cSub: "", cAmt: "" }],
    insertTarget: "dSub",
    lastFocusedCell: { row: 0, field: "dSub" },
    lastFocusedAmtCell: { row: 0, field: "dAmt" },
    hintLevel: 0,
    gradeResult: null,
    autoAppliedQuality: null,
    cardStartedAt: Date.now(),
    sessionLog: [],
    sessionSummary: null,
    blitzActive: false,
    blitzTotal: 10,
    blitzCount: 0,
    blitzScore: 0,
    blitzSec: 0,
    blitzTimer: null
  };

  const todayState = {
    subTab: "queue", // "queue" | "mistakes"
    mistakeFilter: "all",
    runnerActive: false,
    runnerLimit: 10,
    runnerDeck: [],
    runnerIdx: 0,
    runnerLog: [],
    runnerSummary: null,
    runnerJournalMode: state.prefs.drillMode || "input",
    runnerTheoryMode: "choice",
    cardStartedAt: Date.now(),
    // per-card transient state in mixed runner
    jRows: [{ dSub: "", dAmt: "", cSub: "", cAmt: "" }],
    jInsertTarget: "dSub",
    jFocusedCell: { row: 0, field: "dSub" },
    jFocusedAmt: { row: 0, field: "dAmt" },
    jHintLevel: 0,
    jRevealStep: 0,
    jGrade: null,
    jAutoQ: null,
    cVal: "",
    cSign: "favorable",
    cHint: 0,
    cResult: null,
    cAutoQ: null,
    tPicked: -1,
    tRevealed: false,
    tAutoQ: null
  };

  function resetInputForCard() {
    drillState.inputRows = [{ dSub: "", dAmt: "", cSub: "", cAmt: "" }];
    drillState.insertTarget = "dSub";
    drillState.lastFocusedCell = { row: 0, field: "dSub" };
    drillState.lastFocusedAmtCell = { row: 0, field: "dAmt" };
    drillState.hintLevel = 0;
    drillState.gradeResult = null;
    drillState.autoAppliedQuality = null;
    drillState.cardStartedAt = Date.now();
  }

  function resetRunnerTransient() {
    todayState.jRows = [{ dSub: "", dAmt: "", cSub: "", cAmt: "" }];
    todayState.jInsertTarget = "dSub";
    todayState.jFocusedCell = { row: 0, field: "dSub" };
    todayState.jFocusedAmt = { row: 0, field: "dAmt" };
    todayState.jHintLevel = 0;
    todayState.jRevealStep = 0;
    todayState.jGrade = null;
    todayState.jAutoQ = null;
    todayState.cVal = "";
    todayState.cSign = "favorable";
    todayState.cHint = 0;
    todayState.cResult = null;
    todayState.cAutoQ = null;
    todayState.tPicked = -1;
    todayState.tRevealed = false;
    todayState.tAutoQ = null;
    todayState.cardStartedAt = Date.now();
  }

  function renderDojoTabBar() {
    const jCnt = (DATA.drills || []).length;
    const cCnt = (DATA.calcDrills || []).length;
    const tCnt = (DATA.theoryDrills || []).length;
    const dueSum = getDueSummary();
    const tabs = [
      { id: "today", label: "今日の復習" + (dueSum.totalDue > 0 ? " (" + dueSum.totalDue + ")" : "") },
      { id: "journal", label: "仕訳 (" + jCnt + ")" },
      { id: "calc", label: "工簿数値 (" + cCnt + ")" },
      { id: "theory", label: "理論穴埋め (" + tCnt + ")" },
      { id: "cbt", label: "CBT模試" },
      { id: "past", label: "公式過去問" }
    ];
    let h = '<div class="sim-tabs dojo-main-tabs">';
    tabs.forEach((t) => {
      h += '<button type="button" class="sim-tab-btn dojo-tab-btn' + (drillState.dojoTab === t.id ? " active" : "") + '" data-dojotab="' + t.id + '">' + escapeHtml(t.label) + "</button>";
    });
    h += "</div>";
    return h;
  }

  function bindDojoTabBar(root) {
    root.querySelectorAll(".dojo-tab-btn").forEach((b) => {
      b.onclick = () => {
        stopBlitz();
        drillState.dojoTab = b.dataset.dojotab;
        drillState.hasInitializedTab = true;
        renderDrillView();
      };
    });
    const activeTab = root.querySelector(".dojo-tab-btn.active");
    if (activeTab && typeof activeTab.scrollIntoView === "function") {
      activeTab.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }

  function build7DayForecastSvg() {
    const allCards = [].concat(DATA.drills || [], DATA.calcDrills || [], DATA.theoryDrills || []);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * 86400000);
      const endMs = d.getTime() + 86400000 - 1;
      const startMs = d.getTime();
      let cnt = 0;
      allCards.forEach((c) => {
        const rec = state.srs[c.id];
        if (!rec || !rec.dueAt) return;
        const ts = Date.parse(rec.dueAt);
        if (!Number.isFinite(ts)) return;
        if (i === 0 ? ts <= endMs : ts >= startMs && ts <= endMs) cnt++;
      });
      days.push({ label: i === 0 ? "今日" : i + "日後", cnt });
    }
    const maxCnt = Math.max(4, ...days.map((d) => d.cnt));
    const W = 420;
    const H = 108;
    const padL = 16;
    const padR = 16;
    const padT = 20;
    const padB = 24;
    const bw = Math.floor((W - padL - padR) / 7);
    let bars = "";
    days.forEach((d, i) => {
      const barH = Math.round((d.cnt / maxCnt) * (H - padT - padB));
      const x = padL + i * bw + 8;
      const y = H - padB - barH;
      const fill = i === 0 ? "var(--accent)" : "var(--border-strong)";
      bars += '<rect x="' + x + '" y="' + y + '" width="' + (bw - 16) + '" height="' + Math.max(2, barH) + '" rx="2" fill="' + fill + '"/>';
      bars += '<text x="' + (x + (bw - 16) / 2) + '" y="' + Math.max(12, y - 5) + '" text-anchor="middle" font-size="10" font-weight="600" fill="var(--text)">' + d.cnt + "</text>";
      bars += '<text x="' + (x + (bw - 16) / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="var(--text-muted)">' + d.label + "</text>";
    });
    return '<svg class="forecast-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="今後7日間の復習予定数">' + bars + "</svg>";
  }

  function findCardById(cardId) {
    let found = (DATA.drills || []).find((c) => c.id === cardId);
    if (found) return { kind: "journal", card: found };
    found = (DATA.calcDrills || []).find((c) => c.id === cardId);
    if (found) return { kind: "calc", card: found };
    found = (DATA.theoryDrills || []).find((c) => c.id === cardId);
    if (found) return { kind: "theory", card: found };
    return null;
  }

  function startMixedRunner(items) {
    todayState.runnerDeck = items.slice();
    todayState.runnerIdx = 0;
    todayState.runnerLog = [];
    todayState.runnerSummary = null;
    todayState.runnerActive = items.length > 0;
    resetRunnerTransient();
    renderDrillView();
  }

  function renderTodayHub(root) {
    if (todayState.runnerSummary) {
      let html = renderDojoTabBar() +
        renderSessionSummaryHtml(
          "横断ミックス復習 完了",
          todayState.runnerLog,
          "runnerRetryWrongBtn",
          "runnerRestartBtn",
          "runnerBackHubBtn"
        );
      root.innerHTML = html;
      bindDojoTabBar(root);
      const wb = document.getElementById("runnerRetryWrongBtn");
      if (wb) {
        wb.onclick = () => {
          const wrongItems = todayState.runnerLog.filter((x) => !x.ok).map((x) => findCardById(x.cardId)).filter(Boolean);
          startMixedRunner(wrongItems);
        };
      }
      const rb = document.getElementById("runnerRestartBtn");
      if (rb) {
        rb.onclick = () => {
          const due = getDueSummary().allDueCards;
          const lim = todayState.runnerLimit > 0 ? due.slice(0, todayState.runnerLimit) : due;
          startMixedRunner(lim);
        };
      }
      document.getElementById("runnerBackHubBtn").onclick = () => {
        todayState.runnerActive = false;
        todayState.runnerSummary = null;
        renderDrillView();
      };
      return;
    }

    if (todayState.runnerActive) {
      renderMixedRunnerView(root);
      return;
    }

    const dueSum = getDueSummary();
    const todayLog = state.studyLog[getTodayKey()] || { reviews: 0, correct: 0, units: 0, cbt: 0 };
    const streak = getStreakDays();
    const units = (DATA.items || []).filter((it) => it.part !== "guide" && it.available);
    const upcomingUnits = units
      .map((u) => ({ doc: u, status: getUnitReviewStatus(u) }))
      .filter((x) => x.status.nextStage && x.status.nextStage !== "day0")
      .sort((a, b) => (a.status.dueAtMs || 0) - (b.status.dueAtMs || 0));

    let html = renderDojoTabBar() +
      '<div class="studio-header">' +
      "<div><h2>今日の復習ハブ＆間違いノート</h2>" +
      '<p class="studio-sub">仕訳・工簿・理論の復習期限到来カードと Day 1 / Day 7 / Day 21 の単元復習を1か所で消化します。</p></div>' +
      '<div class="drill-submode-tabs">' +
      '<button type="button" class="sim-tab-btn' + (todayState.subTab === "queue" ? " active" : "") + '" data-today-sub="queue">今日のキュー (' + dueSum.totalDue + ")</button>" +
      '<button type="button" class="sim-tab-btn' + (todayState.subTab === "mistakes" ? " active" : "") + '" data-today-sub="mistakes">間違いノート</button>' +
      "</div></div>";

    if (todayState.subTab === "queue") {
      html += '<div class="kpi-grid">';
      html += '<div class="kpi-box"><div class="kpi-lbl">期限到来カード</div><div class="kpi-val accent">' + dueSum.allDueCards.length + "問</div></div>";
      html += '<div class="kpi-box"><div class="kpi-lbl">期限到来単元</div><div class="kpi-val amber-txt">' + dueSum.dueUnits.length + "単元</div></div>";
      html += '<div class="kpi-box"><div class="kpi-lbl">今日の演習数</div><div class="kpi-val emerald-txt">' + (todayLog.reviews || 0) + "問</div></div>";
      html += '<div class="kpi-box"><div class="kpi-lbl">連続学習</div><div class="kpi-val">' + streak + "日</div></div>";
      html += "</div>";

      html += '<div class="today-hub-grid">';
      html += '<div class="studio-card"><h3>横断ミックス復習</h3>';
      html += '<p class="studio-sub" style="margin-bottom:10px;">仕訳 ' + dueSum.dueJournal.length + "問 · 工簿 " + dueSum.dueCalc.length + "問 · 理論 " + dueSum.dueTheory.length + "問 が復習期限を迎えています。</p>";
      html += '<div class="drill-filters-grid" style="margin-bottom:12px;">';
      html += '<select id="todayLimitSel" class="studio-select" aria-label="ミックス復習の出題上限">';
      [
        { v: 10, l: "10問集中セット" },
        { v: 20, l: "20問セット" },
        { v: 0, l: "期限到来すべて (" + dueSum.allDueCards.length + ")" }
      ].forEach((op) => {
        html += '<option value="' + op.v + '"' + (todayState.runnerLimit === op.v ? " selected" : "") + ">" + escapeHtml(op.l) + "</option>";
      });
      html += "</select>";
      html += '<button type="button" class="primary-btn" id="startMixedDueBtn"' + (dueSum.allDueCards.length === 0 ? " disabled" : "") + ">" +
        (dueSum.allDueCards.length > 0 ? "今日の復習を開始する" : "期限到来のカードはありません") + "</button>";
      html += "</div>";
      if (dueSum.allDueCards.length === 0) {
        html += '<p class="studio-sub">本日の復習カードはすべて消化済みです。仕訳・工簿・理論の各タブから新しい単元へ進みましょう。</p>';
      }
      html += "</div>";

      html += '<div class="studio-card"><h3>今後7日間の復習負荷予報</h3>' + build7DayForecastSvg() + "</div>";
      html += "</div>";

      html += '<div class="studio-card"><h3>単元別の分散復習キュー（Day 1 / Day 7 / Day 21）</h3>';
      if (upcomingUnits.length === 0) {
        html += '<p class="studio-sub">各単元末尾または上部の「Day 0」を押すと、翌日（Day 1）・7日後・21日後の復習キューが自動で並びます。</p>';
      } else {
        upcomingUnits.slice(0, 12).forEach((item) => {
          const st = item.status;
          const badgeCls = st.isDue ? "danger-pill" : "amber";
          const badgeTxt = st.isDue ? st.nextLabel + " 期限到来（" + st.daysElapsed + "日経過）" : st.nextLabel + "（あと" + Math.max(1, st.daysUntil || 1) + "日）";
          html +=
            '<div class="list-action-row unit-queue-row">' +
            '<div><div><span class="meta-pill accent">' + escapeHtml(item.doc.id) + "</span> <strong>" + escapeHtml(item.doc.title) + '</strong> <span class="meta-pill ' + badgeCls + '">' + escapeHtml(badgeTxt) + "</span></div>" +
            '<div class="studio-sub" style="margin-top:4px;">' + escapeHtml(st.guide) + "</div></div>" +
            '<div class="unit-queue-actions">' +
            '<button type="button" class="mask-btn today-open-doc" data-doc="' + escapeHtml(item.doc.id) + '">教材</button>' +
            '<button type="button" class="mask-btn today-open-dojo" data-doc="' + escapeHtml(item.doc.id) + '">道場</button>' +
            '<button type="button" class="secondary-btn today-mark-stage" data-doc="' + escapeHtml(item.doc.id) + '" data-stage="' + escapeHtml(st.nextStage) + '">' + escapeHtml(st.nextLabel) + " 完了</button>" +
            "</div></div>";
        });
      }
      html += "</div>";
    } else {
      // Mistake Notebook
      const allCards = [].concat(
        (DATA.drills || []).map((c) => ({ kind: "journal", label: "仕訳", card: c })),
        (DATA.calcDrills || []).map((c) => ({ kind: "calc", label: "工簿", card: c })),
        (DATA.theoryDrills || []).map((c) => ({ kind: "theory", label: "理論", card: c }))
      );
      const entries = allCards.filter((it) => {
        const m = state.mistakes[it.card.id];
        const srs = state.srs[it.card.id];
        const hasMistake = (m && (m.count > 0 || (m.reasons && m.reasons.length) || m.note)) || (srs && (srs.level === 0 || (srs.lapses || 0) > 0));
        if (!hasMistake) return false;
        if (todayState.mistakeFilter === "leech") return isCardLeech(it.card.id);
        if (todayState.mistakeFilter !== "all") {
          return !!(m && Array.isArray(m.reasons) && m.reasons.includes(todayState.mistakeFilter));
        }
        return true;
      }).sort((a, b) => {
        const la = (state.srs[a.card.id] && state.srs[a.card.id].lapses) || 0;
        const lb = (state.srs[b.card.id] && state.srs[b.card.id].lapses) || 0;
        return lb - la;
      });

      html += '<div class="studio-card">';
      html += '<div class="mistake-filter-bar">';
      const filters = [{ id: "all", label: "すべて" }, { id: "leech", label: "鬼門（複数回誤答）" }].concat(
        MISTAKE_REASONS.map((r) => ({ id: r, label: r }))
      );
      filters.forEach((f) => {
        html += '<button type="button" class="mistake-chip' + (todayState.mistakeFilter === f.id ? " active" : "") + '" data-mfilter="' + escapeHtml(f.id) + '">' + escapeHtml(f.label) + "</button>";
      });
      html += "</div>";
      html += '<div style="margin:12px 0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">' +
        '<span class="studio-sub">該当 <strong>' + entries.length + "問</strong></span>" +
        '<button type="button" class="primary-btn" id="trainMistakesBtn"' + (entries.length === 0 ? " disabled" : "") + ">絞り込んだ " + entries.length + "問を集中演習</button></div>";

      if (entries.length === 0) {
        html += '<p class="studio-sub">該当する間違いノート記録はまだありません。道場で誤答原因タグやメモを付けるとここに集約されます。</p>';
      } else {
        entries.slice(0, 40).forEach((en) => {
          const c = en.card;
          const m = state.mistakes[c.id] || { reasons: [], note: "", count: 0 };
          const srs = state.srs[c.id];
          const titleTxt = en.kind === "journal" ? (c.focusLine || c.targetLabel || c.docTitle) : en.kind === "calc" ? c.question : c.title;
          html +=
            '<div class="list-action-row mistake-entry-row">' +
            '<div style="min-width:0; flex:1;">' +
            '<div><span class="meta-pill accent">' + escapeHtml(c.docId || en.label) + '</span> <span class="meta-pill">' + en.label + "</span> " +
            (isCardLeech(c.id) ? '<span class="meta-pill danger-pill">鬼門</span> ' : "") +
            (srs && srs.lapses ? '<span class="meta-pill">誤答 ' + srs.lapses + "回</span>" : "") + "</div>" +
            '<div style="margin-top:4px; font-weight:600;">' + escapeHtml(String(titleTxt || "").slice(0, 90)) + "</div>" +
            (m.reasons && m.reasons.length ? '<div style="margin-top:4px; display:flex; flex-wrap:wrap; gap:4px;">' + m.reasons.map((r) => '<span class="meta-pill">' + escapeHtml(r) + "</span>").join("") + "</div>" : "") +
            (m.note ? '<div class="studio-sub" style="margin-top:4px;">メモ：' + escapeHtml(m.note) + "</div>" : "") +
            "</div>" +
            '<button type="button" class="mask-btn train-single-mistake" data-cid="' + escapeHtml(c.id) + '">解く</button>' +
            "</div>";
        });
      }
      html += "</div>";
    }

    root.innerHTML = html;
    bindDojoTabBar(root);

    root.querySelectorAll("[data-today-sub]").forEach((b) => {
      b.onclick = () => {
        todayState.subTab = b.dataset.todaySub;
        renderDrillView();
      };
    });

    if (todayState.subTab === "queue") {
      const limSel = document.getElementById("todayLimitSel");
      if (limSel) limSel.onchange = (e) => { todayState.runnerLimit = Number(e.target.value); };
      const stBtn = document.getElementById("startMixedDueBtn");
      if (stBtn) {
        stBtn.onclick = () => {
          const allDue = getDueSummary().allDueCards;
          const items = todayState.runnerLimit > 0 ? allDue.slice(0, todayState.runnerLimit) : allDue;
          startMixedRunner(items);
        };
      }
      root.querySelectorAll(".today-open-doc").forEach((b) => {
        b.onclick = () => openDoc(b.dataset.doc);
      });
      root.querySelectorAll(".today-open-dojo").forEach((b) => {
        b.onclick = () => window.BokiStudioTools.openUnitDojo(b.dataset.doc);
      });
      root.querySelectorAll(".today-mark-stage").forEach((b) => {
        b.onclick = () => {
          toggleDocReviewStage(b.dataset.doc, b.dataset.stage, true);
          renderDrillView();
        };
      });
    } else {
      root.querySelectorAll("[data-mfilter]").forEach((b) => {
        b.onclick = () => {
          todayState.mistakeFilter = b.dataset.mfilter;
          renderDrillView();
        };
      });
      const trAllBtn = document.getElementById("trainMistakesBtn");
      if (trAllBtn) {
        trAllBtn.onclick = () => {
          const allCards = [].concat(
            (DATA.drills || []).map((c) => ({ kind: "journal", card: c })),
            (DATA.calcDrills || []).map((c) => ({ kind: "calc", card: c })),
            (DATA.theoryDrills || []).map((c) => ({ kind: "theory", card: c }))
          );
          const list = allCards.filter((it) => {
            const m = state.mistakes[it.card.id];
            const srs = state.srs[it.card.id];
            const hasMistake = (m && (m.count > 0 || (m.reasons && m.reasons.length) || m.note)) || (srs && (srs.level === 0 || (srs.lapses || 0) > 0));
            if (!hasMistake) return false;
            if (todayState.mistakeFilter === "leech") return isCardLeech(it.card.id);
            if (todayState.mistakeFilter !== "all") return !!(m && Array.isArray(m.reasons) && m.reasons.includes(todayState.mistakeFilter));
            return true;
          });
          startMixedRunner(list);
        };
      }
      root.querySelectorAll(".train-single-mistake").forEach((b) => {
        b.onclick = () => {
          const found = findCardById(b.dataset.cid);
          if (found) startMixedRunner([found]);
        };
      });
    }
  }

  function renderMixedRunnerView(root) {
    const item = todayState.runnerDeck[todayState.runnerIdx];
    if (!item) {
      todayState.runnerSummary = true;
      renderTodayHub(root);
      return;
    }

    const advanceRunner = (quality, ok) => {
      const elapsed = Math.round((Date.now() - todayState.cardStartedAt) / 1000);
      recordSrsReview(item.card.id, quality, elapsed);
      if (quality === 0) bumpMistakeCount(item.card.id);
      todayState.runnerLog.push({ cardId: item.card.id, type: item.kind, ok, sec: elapsed });
      if (todayState.runnerIdx + 1 >= todayState.runnerDeck.length) {
        todayState.runnerSummary = true;
      } else {
        todayState.runnerIdx++;
        resetRunnerTransient();
      }
      renderDrillView();
    };

    const kindLabels = { journal: "仕訳", calc: "工簿数値", theory: "理論穴埋め" };
    let html = renderDojoTabBar() +
      '<div class="blitz-banner">' +
      "<span>横断ミックス復習：<strong>" + (todayState.runnerIdx + 1) + " / " + todayState.runnerDeck.length + "問目</strong>（" + kindLabels[item.kind] + "）</span>" +
      '<button type="button" class="mask-btn" id="runnerStopBtn">ハブへ戻る</button>' +
      "</div>" +
      renderSessionProgressHtml(todayState.runnerIdx, todayState.runnerDeck.length);

    const card = item.card;
    if (item.kind === "journal") {
      html += renderJournalCardShellHtml(card, {
        mode: todayState.runnerJournalMode,
        rows: todayState.jRows,
        insertTarget: todayState.jInsertTarget,
        hintLevel: todayState.jHintLevel,
        revealStep: todayState.jRevealStep,
        gradeResult: todayState.jGrade,
        autoAppliedQuality: todayState.jAutoQ,
        counterText: (todayState.runnerIdx + 1) + " / " + todayState.runnerDeck.length,
        prefix: "mix"
      });
    } else if (item.kind === "calc") {
      html += renderCalcCardShellHtml(card, {
        userVal: todayState.cVal,
        userSign: todayState.cSign,
        hintLevel: todayState.cHint,
        result: todayState.cResult,
        autoAppliedQuality: todayState.cAutoQ,
        counterText: (todayState.runnerIdx + 1) + " / " + todayState.runnerDeck.length,
        prefix: "mix"
      });
    } else {
      const choices = buildTheoryChoices(card, DATA.theoryDrills || []);
      html += renderTheoryCardShellHtml(card, choices, {
        mode: todayState.runnerTheoryMode,
        pickedIdx: todayState.tPicked,
        revealed: todayState.tRevealed,
        autoAppliedQuality: todayState.tAutoQ,
        counterText: (todayState.runnerIdx + 1) + " / " + todayState.runnerDeck.length,
        prefix: "mix"
      });
    }

    root.innerHTML = html;
    bindDojoTabBar(root);
    document.getElementById("runnerStopBtn").onclick = () => {
      todayState.runnerActive = false;
      todayState.runnerSummary = null;
      renderDrillView();
    };

    if (item.kind === "journal") {
      bindJournalCardShell(root, card, {
        getMode: () => todayState.runnerJournalMode,
        setMode: (m) => { todayState.runnerJournalMode = m; renderDrillView(); },
        getRows: () => todayState.jRows,
        setRows: (r) => { todayState.jRows = r; },
        getInsertTarget: () => todayState.jInsertTarget,
        setInsertTarget: (t) => { todayState.jInsertTarget = t; },
        getFocusedCell: () => todayState.jFocusedCell,
        setFocusedCell: (c) => { todayState.jFocusedCell = c; },
        getFocusedAmt: () => todayState.jFocusedAmt,
        setFocusedAmt: (c) => { todayState.jFocusedAmt = c; },
        getHintLevel: () => todayState.jHintLevel,
        setHintLevel: (l) => { todayState.jHintLevel = l; renderDrillView(); },
        getRevealStep: () => todayState.jRevealStep,
        setRevealStep: (s) => { todayState.jRevealStep = s; renderDrillView(); },
        getGrade: () => todayState.jGrade,
        setGrade: (g, aq) => { todayState.jGrade = g; todayState.jAutoQ = aq; renderDrillView(); },
        onAfterGradeRate: (q) => advanceRunner(q, q >= 2),
        onNextWithCurrentGrade: () => {
          const q = typeof todayState.jAutoQ === "number" ? todayState.jAutoQ : 2;
          advanceRunner(q, q >= 2);
        },
        rerender: () => renderDrillView()
      });
    } else if (item.kind === "calc") {
      bindCalcCardShell(root, card, {
        getVal: () => todayState.cVal,
        setVal: (v) => { todayState.cVal = v; },
        getSign: () => todayState.cSign,
        setSign: (s) => { todayState.cSign = s; renderDrillView(); },
        getHint: () => todayState.cHint,
        setHint: (h) => { todayState.cHint = h; renderDrillView(); },
        getResult: () => todayState.cResult,
        setResult: (r, aq) => { todayState.cResult = r; todayState.cAutoQ = aq; renderDrillView(); },
        onAfterRate: (q) => advanceRunner(q, q >= 2),
        onNext: () => {
          const q = typeof todayState.cAutoQ === "number" ? todayState.cAutoQ : 2;
          advanceRunner(q, q >= 2);
        },
        rerender: () => renderDrillView()
      });
    } else {
      const choices = buildTheoryChoices(card, DATA.theoryDrills || []);
      bindTheoryCardShell(root, card, choices, {
        getMode: () => todayState.runnerTheoryMode,
        setMode: (m) => { todayState.runnerTheoryMode = m; todayState.tPicked = -1; todayState.tRevealed = false; renderDrillView(); },
        getPicked: () => todayState.tPicked,
        setPicked: (p, aq) => { todayState.tPicked = p; todayState.tAutoQ = aq; renderDrillView(); },
        getRevealed: () => todayState.tRevealed,
        setRevealed: (rv) => { todayState.tRevealed = rv; renderDrillView(); },
        onAfterRate: (q) => advanceRunner(q, q >= 2),
        onNext: () => {
          const q = typeof todayState.tAutoQ === "number" ? todayState.tAutoQ : 2;
          advanceRunner(q, q >= 2);
        }
      });
    }
  }

  /* =========================================================================
   * 1A. JOURNAL DRILL DOJO v3 (仕訳道場：本質思考 × 最速入力)
   * ========================================================================= */
  function buildSubjectPalette(card) {
    const correctSet = new Set();
    (card.rows || []).forEach((r) => {
      if (r.dSub) correctSet.add(r.dSub);
      if (r.cSub) correctSet.add(r.cSub);
    });
    const docPool = new Set();
    const partPool = new Set();
    (DATA.drills || []).forEach((c) => {
      if (c.docId === card.docId) {
        (c.rows || []).forEach((r) => {
          if (r.dSub) docPool.add(r.dSub);
          if (r.cSub) docPool.add(r.cSub);
        });
      } else if (c.part === card.part) {
        (c.rows || []).forEach((r) => {
          if (r.dSub) partPool.add(r.dSub);
          if (r.cSub) partPool.add(r.cSub);
        });
      }
    });
    const docDistractors = Array.from(docPool).filter((s) => !correctSet.has(s));
    const partDistractors = Array.from(partPool).filter((s) => !correctSet.has(s) && !docPool.has(s));
    let seed = 0;
    for (let i = 0; i < card.id.length; i++) seed = (seed * 31 + card.id.charCodeAt(i)) >>> 0;
    const seededRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const shuffleArr = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(seededRand() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    };
    shuffleArr(docDistractors);
    shuffleArr(partDistractors);
    const distractors = docDistractors.concat(partDistractors);
    const targetLen = Math.min(10, Math.max(6, correctSet.size + 4));
    const combined = Array.from(correctSet).concat(distractors.slice(0, Math.max(0, targetLen - correctSet.size)));
    return shuffleArr(combined);
  }

  function renderJournalCardShellHtml(card, ctx) {
    const mode = ctx.mode; // "input" | "subject" | "flash"
    const rows = ctx.rows;
    const srsRec = state.srs[card.id];
    const srsBadge = !srsRec
      ? '<span class="meta-pill">未学習</span>'
      : isCardLeech(card.id)
      ? '<span class="meta-pill danger-pill">要復習</span>'
      : isCardDue(card.id)
      ? '<span class="meta-pill amber">復習期限</span>'
      : srsRec.level >= 2
      ? '<span class="meta-pill emerald-pill">定着 (' + (srsRec.intervalDays || 1) + "日)</span>"
      : '<span class="meta-pill amber">あいまい</span>';

    let html = '<div class="studio-card drill-card">';
    html +=
      '<div class="drill-card-meta">' +
      '<div class="drill-card-tags"><span class="meta-pill accent">' + escapeHtml(card.docId) + "</span> " +
      '<span class="meta-pill">' + escapeHtml(card.questionTitle || card.section) + "</span> " +
      srsBadge + "</div>" +
      '<div class="drill-counter">' + escapeHtml(ctx.counterText) + "</div></div>";

    html += '<div class="drill-doc-title">' + escapeHtml(card.docTitle) + "</div>";

    if (ctx.showSubmodeSwitch) {
      html += '<div class="drill-submode-tabs" style="margin-bottom:10px;">';
      [
        { id: "input", label: "入力・自動採点" },
        { id: "subject", label: "科目スピード" },
        { id: "flash", label: "フラッシュカード" }
      ].forEach((m) => {
        html += '<button type="button" class="sim-tab-btn shell-jmode-btn' + (mode === m.id ? " active" : "") + '" data-jmode="' + m.id + '">' + m.label + "</button>";
      });
      html += "</div>";
    }

    // Question Box (Collapsible premise when focusLine exists)
    html += '<div class="drill-question-box">';
    if (card.focusLine) {
      const premise = getPremiseSummary(card.questionBody, card.focusLine);
      html +=
        '<div class="drill-focus-banner drill-focus-card">' +
        '<span class="focus-badge">今回の仕訳対象（' + escapeHtml(card.targetLabel || "取引") + "）</span>" +
        '<div class="focus-text">' + formatInlineMd(card.focusLine) + "</div>" +
        (premise ? '<div class="drill-premise-summary">' + formatInlineMd(premise) + "</div>" : "") +
        "</div>";
      html +=
        '<details class="drill-premise-details"><summary>前提・問題全体を表示（他取引を含む）</summary>' +
        '<div class="drill-question-body" tabindex="0">' + formatQuestionBodyHtml(card.questionBody, card.focusLine) + "</div></details>";
    } else {
      html += '<div class="drill-question-body" tabindex="0">' + formatQuestionBodyHtml(card.questionBody, "") + "</div>";
    }
    html += "</div>";

    if (mode === "input" || mode === "subject") {
      const subjectsList = DATA.subjects || [];
      html += '<datalist id="bokiSubjectsDatalist">';
      subjectsList.forEach((s) => {
        html += '<option value="' + escapeHtml(s) + '"></option>';
      });
      html += "</datalist>";

      const activeRowIdx = Math.min((ctx.focusedRow || 0), rows.length - 1);
      html += '<div class="palette-target-bar">';
      html += '<span class="palette-target-lbl">パレット挿入先：</span>';
      html += '<div class="mobile-seg-group">';
      html += '<button type="button" class="mobile-seg-btn palette-target-btn' + (ctx.insertTarget === "dSub" ? " active" : "") + '" data-ptarget="dSub">借方 (行' + (activeRowIdx + 1) + ")</button>";
      html += '<button type="button" class="mobile-seg-btn palette-target-btn' + (ctx.insertTarget === "cSub" ? " active" : "") + '" data-ptarget="cSub">貸方 (行' + (activeRowIdx + 1) + ")</button>";
      html += "</div></div>";

      const usedSubs = new Set();
      rows.forEach((r) => {
        if (r.dSub) usedSubs.add(normalizeSubject(r.dSub));
        if (r.cSub) usedSubs.add(normalizeSubject(r.cSub));
      });
      const palette = buildSubjectPalette(card);
      html += '<div class="subject-palette subject-palette-wrap">';
      palette.forEach((sub) => {
        const isUsed = usedSubs.has(normalizeSubject(sub));
        html += '<button type="button" class="palette-chip' + (isUsed ? " is-used" : "") + '" data-sub="' + escapeHtml(sub) + '">' + escapeHtml(sub) + "</button>";
      });
      html += "</div>";

      if (mode === "subject") {
        html += '<div class="table-wrap" tabindex="0"><table class="journal-table drill-input-table drill-subject-only"><thead><tr><th>借方科目</th><th>貸方科目</th><th style="width:40px;"><span class="sr-only">操作</span></th></tr></thead><tbody>';
        rows.forEach((r, idx) => {
          const dCls = ctx.insertTarget === "dSub" && idx === activeRowIdx ? " is-target" : "";
          const cCls = ctx.insertTarget === "cSub" && idx === activeRowIdx ? " is-target" : "";
          html +=
            "<tr>" +
            '<td data-label="借方科目"><input type="text" class="drill-cell-input sub-input' + dCls + '" list="bokiSubjectsDatalist" data-row="' + idx + '" data-field="dSub" aria-label="行' + (idx + 1) + ' 借方科目" placeholder="借方科目..." value="' + escapeHtml(r.dSub) + '" /></td>' +
            '<td data-label="貸方科目"><input type="text" class="drill-cell-input sub-input' + cCls + '" list="bokiSubjectsDatalist" data-row="' + idx + '" data-field="cSub" aria-label="行' + (idx + 1) + ' 貸方科目" placeholder="貸方科目..." value="' + escapeHtml(r.cSub) + '" /></td>' +
            '<td class="del-cell">' + (rows.length > 1 ? '<button type="button" class="row-del-btn" data-del-row="' + idx + '" title="行を削除" aria-label="行' + (idx + 1) + 'を削除">✕</button>' : "") + "</td>" +
            "</tr>";
        });
        html += "</tbody></table></div>";
      } else {
        html += '<div class="table-wrap" tabindex="0"><table class="journal-table drill-input-table"><thead><tr><th>借方科目</th><th class="num">借方金額</th><th>貸方科目</th><th class="num">貸方金額</th><th style="width:40px;"><span class="sr-only">操作</span></th></tr></thead><tbody>';
        rows.forEach((r, idx) => {
          const dCls = ctx.insertTarget === "dSub" && idx === activeRowIdx ? " is-target" : "";
          const cCls = ctx.insertTarget === "cSub" && idx === activeRowIdx ? " is-target" : "";
          html +=
            "<tr>" +
            '<td data-label="借方科目"><input type="text" class="drill-cell-input sub-input' + dCls + '" list="bokiSubjectsDatalist" data-row="' + idx + '" data-field="dSub" aria-label="行' + (idx + 1) + ' 借方科目" placeholder="借方科目..." value="' + escapeHtml(r.dSub) + '" /></td>' +
            '<td data-label="借方金額"><input type="text" inputmode="numeric" class="drill-cell-input amt-input num" data-row="' + idx + '" data-field="dAmt" aria-label="行' + (idx + 1) + ' 借方金額" placeholder="0" value="' + escapeHtml(r.dAmt) + '" /></td>' +
            '<td data-label="貸方科目"><input type="text" class="drill-cell-input sub-input' + cCls + '" list="bokiSubjectsDatalist" data-row="' + idx + '" data-field="cSub" aria-label="行' + (idx + 1) + ' 貸方科目" placeholder="貸方科目..." value="' + escapeHtml(r.cSub) + '" /></td>' +
            '<td data-label="貸方金額"><input type="text" inputmode="numeric" class="drill-cell-input amt-input num" data-row="' + idx + '" data-field="cAmt" aria-label="行' + (idx + 1) + ' 貸方金額" placeholder="0" value="' + escapeHtml(r.cAmt) + '" /></td>' +
            '<td class="del-cell">' + (rows.length > 1 ? '<button type="button" class="row-del-btn" data-del-row="' + idx + '" title="行を削除" aria-label="行' + (idx + 1) + 'を削除">✕</button>' : "") + "</td>" +
            "</tr>";
        });
        html += "</tbody></table></div>";
      }

      html += '<div class="drill-live-bar">';
      html += '<div class="amt-quick-bar">';
      html += '<button type="button" class="mask-btn" id="drillAddRowBtn">＋ 行を追加</button>';
      if (mode === "input") {
        html += '<button type="button" class="mask-btn" id="drillZero3Btn">+000</button>';
        html += '<button type="button" class="mask-btn" id="drillZero4Btn">+0000</button>';
        html += '<button type="button" class="mask-btn" id="drillBalanceFillBtn" title="貸借の差額を自動補完 (D)">差額補完</button>';
        html += '<button type="button" class="mask-btn' + (inlineCalcState.open ? " active" : "") + '" id="drillInlineCalcToggleBtn" title="ミニ電卓 (C)">' + INLINE_CALC_SVG + " 電卓</button>";
      }
      html += "</div>";
      if (mode === "input") {
        html += '<div id="drillLiveBalance" class="live-balance-group"></div>';
      }
      html += "</div>";

      if (mode === "input") html += renderInlineCalcHtml();

      if (ctx.hintLevel > 0) {
        const fh = formatFiveElementHint(card);
        html += '<div class="drill-hint-box hint-stepper-box">';
        html += '<div class="hint-step-row"><strong>Hint 1（5要素・型）：</strong><code>' + escapeHtml(fh.formats) + "</code> ／ 借方：<strong>" + escapeHtml(fh.debit) + "</strong> ｜ 貸方：<strong>" + escapeHtml(fh.credit) + "</strong></div>";
        if (ctx.hintLevel >= 2) {
          const dSubs = Array.from(new Set((card.rows || []).map((r) => r.dSub).filter(Boolean)));
          const cSubs = Array.from(new Set((card.rows || []).map((r) => r.cSub).filter(Boolean)));
          html += '<div class="hint-step-row"><strong>Hint 2（科目構成・' + card.rows.length + "行）：</strong>借方 [" + escapeHtml(dSubs.join("・")) + "] ／ 貸方 [" + escapeHtml(cSubs.join("・")) + "]</div>";
        }
        if (ctx.hintLevel >= 3 && card.explanation) {
          const expShort = String(card.explanation).split(/\r?\n/).filter(Boolean).slice(0, 2).join(" ");
          html += '<div class="hint-step-row"><strong>Hint 3（論点の急所）：</strong>' + formatInlineMd(expShort) + "</div>";
        }
        html += "</div>";
      }

      html += '<div class="drill-controls-row">';
      html += '<div class="drill-reveal-btns">';
      html += '<button type="button" class="primary-btn" id="drillCheckBtn">判定する（採点）</button>';
      html += '<button type="button" class="secondary-btn" id="drillHintBtn">' +
        (ctx.hintLevel === 0 ? "ヒント 1/3" : ctx.hintLevel < 3 ? "次のヒント (" + (ctx.hintLevel + 1) + "/3)" : "ヒントを隠す") +
        "</button>";
      html += '<button type="button" class="mask-btn" id="drillOpenDocBtn">単元テキスト</button>';
      html += "</div>";
      if (!ctx.hideNavBtns) {
        html += '<div class="drill-nav-btns"><button type="button" class="mask-btn" id="drillPrevBtn">← 前</button><button type="button" class="mask-btn" id="drillNextBtn">次 →</button></div>';
      }
      html += "</div>";

      if (ctx.gradeResult) {
        const res = ctx.gradeResult;
        const cls = res.status === "perfect" ? "grade-perfect" : res.status === "partial" ? "grade-partial" : "grade-wrong";
        html += '<div class="grade-result-box ' + cls + '">';
        html += '<div class="grade-msg">' + escapeHtml(res.message) + "</div>";
        if (res.details && res.details.length) {
          html += '<ul class="grade-diff-list">' + res.details.map((d) => "<li>" + escapeHtml(d) + "</li>").join("") + "</ul>";
        }
        html += '<div class="grade-answer-title">模範仕訳</div>';
        html += '<div class="table-wrap" tabindex="0"><table class="journal-table drill-table"><thead><tr><th>借方科目</th><th class="num">借方金額</th><th>貸方科目</th><th class="num">貸方金額</th></tr></thead><tbody>';
        card.rows.forEach((r) => {
          html += "<tr><td>" + escapeHtml(r.dSub) + '</td><td class="num">' + escapeHtml(r.dAmt) + "</td><td>" + escapeHtml(r.cSub) + '</td><td class="num">' + escapeHtml(r.cAmt) + "</td></tr>";
        });
        html += "</tbody></table></div>";
        if (card.explanation) {
          html += '<div class="drill-explanation-box"><strong>解説・誤答パターン分析</strong><div class="exp-body">' + formatQuestionBodyHtml(card.explanation, "") + "</div></div>";
        }
        html += renderMistakeTagBoxHtml(card.id);
        html += renderSm2BarHtml(card.id, ctx.autoAppliedQuality);
        html += '<div style="margin-top:12px;"><button type="button" class="primary-btn" id="drillAfterGradeNextBtn">次の問題へ →</button></div>';
        html += "</div>";
      }
    } else {
      // Flashcard Mode
      html += '<div class="table-wrap" tabindex="0"><table class="journal-table drill-table"><thead><tr><th>借方科目</th><th class="num">借方金額</th><th>貸方科目</th><th class="num">貸方金額</th></tr></thead><tbody>';
      card.rows.forEach((r) => {
        const showSub = ctx.revealStep >= 1;
        const showAmt = ctx.revealStep >= 2;
        const dSubHtml = r.dSub ? (showSub ? escapeHtml(r.dSub) : '<span class="drill-mask">？</span>') : "";
        const dAmtHtml = r.dAmt ? (showAmt ? escapeHtml(r.dAmt) : '<span class="drill-mask">？円</span>') : "";
        const cSubHtml = r.cSub ? (showSub ? escapeHtml(r.cSub) : '<span class="drill-mask">？</span>') : "";
        const cAmtHtml = r.cAmt ? (showAmt ? escapeHtml(r.cAmt) : '<span class="drill-mask">？円</span>') : "";
        html += "<tr><td>" + dSubHtml + '</td><td class="num">' + dAmtHtml + "</td><td>" + cSubHtml + '</td><td class="num">' + cAmtHtml + "</td></tr>";
      });
      html += "</tbody></table></div>";

      if (ctx.revealStep >= 2 && card.explanation) {
        html += '<div class="drill-explanation-box"><strong>解説・誤答パターン分析</strong><div class="exp-body">' + formatQuestionBodyHtml(card.explanation, "") + "</div></div>";
      }
      if (ctx.revealStep >= 2) {
        html += renderMistakeTagBoxHtml(card.id);
      }

      html += '<div class="drill-controls-row">';
      html += '<div class="drill-reveal-btns">';
      html += '<button type="button" class="secondary-btn" id="drillRevealSubBtn">科目だけ表示</button>';
      html += '<button type="button" class="primary-btn" id="drillRevealAllBtn">すべて表示＆解説</button>';
      html += '<button type="button" class="mask-btn" id="drillOpenDocBtn">単元テキスト</button>';
      html += "</div>";
      if (!ctx.hideNavBtns) {
        html += '<div class="drill-nav-btns"><button type="button" class="mask-btn" id="drillPrevBtn">← 前</button><button type="button" class="mask-btn" id="drillNextBtn">次 →</button></div>';
      }
      html += "</div>";

      html += renderSm2BarHtml(card.id, null);
    }

    html += "</div>";
    return html;
  }

  function updateLiveBalanceBarFor(rows) {
    const bar = document.getElementById("drillLiveBalance");
    if (!bar) return;
    let dSum = 0;
    let cSum = 0;
    (rows || []).forEach((r) => {
      dSum += parseInputAmount(r.dAmt);
      cSum += parseInputAmount(r.cAmt);
    });
    const diff = Math.abs(dSum - cSum);
    const balanced = dSum > 0 && dSum === cSum;
    bar.innerHTML =
      '<span>借方: <strong>' + fmtYen(dSum) + "</strong></span>" +
      '<span>貸方: <strong>' + fmtYen(cSum) + "</strong></span>" +
      (dSum === 0 && cSum === 0
        ? '<span class="meta-pill">未入力</span>'
        : balanced
        ? '<span class="meta-pill emerald-pill">貸借一致</span>'
        : '<span class="meta-pill danger-pill">差額 ' + fmtYen(diff) + "</span>");
  }

  function applyBalanceFillToRows(rows, focusedAmtCell) {
    let dSum = 0;
    let cSum = 0;
    rows.forEach((r) => {
      dSum += parseInputAmount(r.dAmt);
      cSum += parseInputAmount(r.cAmt);
    });
    const diff = dSum - cSum;
    if (diff === 0) return false;
    if (diff > 0) {
      const idx = focusedAmtCell && focusedAmtCell.field === "cAmt" ? Math.min(focusedAmtCell.row, rows.length - 1) : 0;
      const cur = parseInputAmount(rows[idx].cAmt);
      rows[idx].cAmt = String(cur + diff);
    } else {
      const idx = focusedAmtCell && focusedAmtCell.field === "dAmt" ? Math.min(focusedAmtCell.row, rows.length - 1) : 0;
      const cur = parseInputAmount(rows[idx].dAmt);
      rows[idx].dAmt = String(cur + Math.abs(diff));
    }
    return true;
  }

  function bindJournalCardShell(root, card, ops) {
    root.querySelectorAll(".shell-jmode-btn").forEach((b) => {
      b.onclick = () => ops.setMode(b.dataset.jmode);
    });
    const openDocBtn = document.getElementById("drillOpenDocBtn");
    if (openDocBtn) openDocBtn.onclick = () => openDoc(card.docId);
    const prevBtn = document.getElementById("drillPrevBtn");
    if (prevBtn && ops.onPrev) prevBtn.onclick = ops.onPrev;
    const nextBtn = document.getElementById("drillNextBtn");
    if (nextBtn && ops.onNext) nextBtn.onclick = ops.onNext;

    const mode = ops.getMode();
    const rows = ops.getRows();

    if (mode === "input" || mode === "subject") {
      if (mode === "input") updateLiveBalanceBarFor(rows);

      root.querySelectorAll(".palette-target-btn").forEach((b) => {
        b.onclick = () => {
          ops.setInsertTarget(b.dataset.ptarget);
          const fc = ops.getFocusedCell();
          ops.setFocusedCell({ row: fc.row, field: b.dataset.ptarget });
          ops.rerender();
        };
      });

      root.querySelectorAll(".drill-cell-input").forEach((inp) => {
        if (!inp.dataset.field) return;
        const rIdx = Number(inp.dataset.row);
        const fld = inp.dataset.field;
        inp.addEventListener("focus", () => {
          if (fld === "dSub" || fld === "cSub") {
            ops.setFocusedCell({ row: rIdx, field: fld });
            ops.setInsertTarget(fld);
          } else if (fld === "dAmt" || fld === "cAmt") {
            ops.setFocusedAmt({ row: rIdx, field: fld });
          }
        });
        inp.addEventListener("input", () => {
          rows[rIdx][fld] = inp.value;
          if (mode === "input") updateLiveBalanceBarFor(rows);
        });
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            e.stopPropagation();
            if (ops.getGrade()) {
              ops.onNextWithCurrentGrade();
            } else {
              document.getElementById("drillCheckBtn")?.click();
            }
          }
        });
      });

      root.querySelectorAll(".palette-chip").forEach((chip) => {
        chip.onclick = () => {
          const fc = ops.getFocusedCell() || { row: 0, field: "dSub" };
          const r = Math.min(fc.row, rows.length - 1);
          const fld = ops.getInsertTarget() === "cSub" ? "cSub" : "dSub";
          rows[r][fld] = chip.dataset.sub;
          if (mode === "subject") {
            const nextFld = fld === "dSub" ? "cSub" : "dSub";
            ops.setInsertTarget(nextFld);
            ops.setFocusedCell({ row: r, field: nextFld });
            ops.rerender();
            const nextInp = root.querySelector('.drill-cell-input[data-row="' + r + '"][data-field="' + nextFld + '"]');
            if (nextInp) nextInp.focus();
          } else {
            const domInp = root.querySelector('.drill-cell-input[data-row="' + r + '"][data-field="' + fld + '"]');
            if (domInp) domInp.value = chip.dataset.sub;
            const amtFld = fld === "dSub" ? "dAmt" : "cAmt";
            const nextSub = fld === "dSub" ? "cSub" : "dSub";
            ops.setInsertTarget(nextSub);
            ops.setFocusedCell({ row: r, field: nextSub });
            ops.setFocusedAmt({ row: r, field: amtFld });
            const amtInp = root.querySelector('.drill-cell-input[data-row="' + r + '"][data-field="' + amtFld + '"]');
            if (amtInp) amtInp.focus();
          }
        };
      });

      root.querySelectorAll(".row-del-btn").forEach((b) => {
        b.onclick = () => {
          rows.splice(Number(b.dataset.delRow), 1);
          ops.rerender();
        };
      });

      const addBtn = document.getElementById("drillAddRowBtn");
      if (addBtn) {
        addBtn.onclick = () => {
          rows.push({ dSub: "", dAmt: "", cSub: "", cAmt: "" });
          ops.rerender();
        };
      }

      const multFocusedAmt = (zeros) => {
        const fa = ops.getFocusedAmt() || { row: 0, field: "dAmt" };
        const r = Math.min(fa.row, rows.length - 1);
        const fld = fa.field === "cAmt" ? "cAmt" : "dAmt";
        const cur = String(rows[r][fld] || "").trim();
        if (!cur || cur === "0") return;
        rows[r][fld] = cur + zeros;
        ops.rerender();
        const dom = root.querySelector('.drill-cell-input[data-row="' + r + '"][data-field="' + fld + '"]');
        if (dom) dom.focus();
      };
      const z3 = document.getElementById("drillZero3Btn");
      if (z3) z3.onclick = () => multFocusedAmt("000");
      const z4 = document.getElementById("drillZero4Btn");
      if (z4) z4.onclick = () => multFocusedAmt("0000");

      const bf = document.getElementById("drillBalanceFillBtn");
      if (bf) {
        bf.onclick = () => {
          if (applyBalanceFillToRows(rows, ops.getFocusedAmt())) ops.rerender();
        };
      }

      const calcToggle = document.getElementById("drillInlineCalcToggleBtn");
      if (calcToggle) {
        calcToggle.onclick = () => {
          inlineCalcState.open = !inlineCalcState.open;
          ops.rerender();
        };
      }

      bindInlineCalc(root, (val) => {
        const fa = ops.getFocusedAmt() || { row: 0, field: "dAmt" };
        const r = Math.min(fa.row, rows.length - 1);
        const fld = fa.field === "cAmt" ? "cAmt" : "dAmt";
        rows[r][fld] = String(Math.round(val));
        ops.rerender();
      });

      const hintBtn = document.getElementById("drillHintBtn");
      if (hintBtn) {
        hintBtn.onclick = () => {
          const cur = ops.getHintLevel();
          ops.setHintLevel(cur >= 3 ? 0 : cur + 1);
        };
      }

      const chkBtn = document.getElementById("drillCheckBtn");
      if (chkBtn) {
        chkBtn.onclick = () => {
          const diag = diagnoseJournalAnswer(rows, card.rows, { subjectsOnly: mode === "subject" });
          const isEmpty = diag.dUserSum === 0 && diag.cUserSum === 0 && mode === "input" &&
            rows.every((r) => !normalizeSubject(r.dSub) && !normalizeSubject(r.cSub));
          if (isEmpty) {
            ops.setGrade(diag, null);
            return;
          }
          const q = diag.suggestedQuality;
          recordSrsReview(card.id, q);
          if (q === 0) bumpMistakeCount(card.id);
          ops.setGrade(diag, q);
        };
      }

      if (ops.getGrade()) {
        bindMistakeTagBox(root, card.id);
        bindSm2Bar(root, (q) => ops.onAfterGradeRate(q));
        const afterBtn = document.getElementById("drillAfterGradeNextBtn");
        if (afterBtn) afterBtn.onclick = () => ops.onNextWithCurrentGrade();
      }
    } else {
      const subBtn = document.getElementById("drillRevealSubBtn");
      if (subBtn) subBtn.onclick = () => ops.setRevealStep(1);
      const allBtn = document.getElementById("drillRevealAllBtn");
      if (allBtn) allBtn.onclick = () => ops.setRevealStep(2);
      if (ops.getRevealStep() >= 2) bindMistakeTagBox(root, card.id);
      bindSm2Bar(root, (q) => ops.onAfterGradeRate(q));
    }
  }

  function getFilteredDrills() {
    const all = DATA.drills || [];
    const nowMs = Date.now();
    return all.filter((c) => {
      if (drillState.part !== "all" && c.part !== drillState.part) return false;
      if (drillState.docFilter && c.docId !== drillState.docFilter) return false;
      const rec = state.srs[c.id];
      const lvl = rec ? rec.level : 0;
      if (drillState.queueMode === "due" && !isCardDue(c.id, nowMs)) return false;
      if (drillState.queueMode === "unmastered" && rec && lvl >= 2) return false;
      if (drillState.queueMode === "leech" && !isCardLeech(c.id)) return false;
      return true;
    });
  }

  function rebuildDeck(shuffleIt = false, customIds = null) {
    let list = customIds
      ? (DATA.drills || []).filter((c) => customIds.includes(c.id))
      : getFilteredDrills().slice();
    if (shuffleIt) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
      }
    }
    if (!customIds && drillState.sessionLimit > 0 && list.length > drillState.sessionLimit) {
      list = list.slice(0, drillState.sessionLimit);
    }
    drillState.deck = list;
    drillState.idx = 0;
    drillState.revealStep = 0;
    drillState.sessionLog = [];
    drillState.sessionSummary = null;
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
    drillState.sessionLimit = 10;
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
      if (el) el.textContent = drillState.blitzSec + "秒";
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
      renderDojoTabBar() +
      renderSessionSummaryHtml(
        "10問タイムアタック完了（所要 " + elapsed + "秒）",
        drillState.sessionLog.length ? drillState.sessionLog : Array.from({ length: total }, (_, i) => ({ cardId: "b" + i, ok: i < score, sec: Math.round(elapsed / Math.max(1, total)) })),
        "blitzRetryWrongBtn",
        "blitzRetryBtn",
        "blitzBackBtn"
      );
    bindDojoTabBar(root);
    const wb = document.getElementById("blitzRetryWrongBtn");
    if (wb) {
      wb.onclick = () => {
        const wrongIds = drillState.sessionLog.filter((x) => !x.ok).map((x) => x.cardId);
        if (wrongIds.length) {
          rebuildDeck(false, wrongIds);
          renderDrillView();
        }
      };
    }
    document.getElementById("blitzRetryBtn").onclick = startBlitz;
    document.getElementById("blitzBackBtn").onclick = () => {
      rebuildDeck(false);
      renderDrillView();
    };
  }

  function advanceDrillCard(delta, logEntry) {
    if (logEntry) {
      drillState.sessionLog.push(logEntry);
    }
    if (drillState.blitzActive && delta > 0) {
      drillState.blitzCount++;
      if (logEntry && logEntry.ok) drillState.blitzScore++;
      if (drillState.blitzCount >= drillState.blitzTotal) {
        showBlitzSummary();
        return;
      }
    }
    if (!drillState.blitzActive && delta > 0 && drillState.sessionLimit > 0 && drillState.idx + 1 >= drillState.deck.length && drillState.sessionLog.length > 0) {
      drillState.sessionSummary = true;
      renderDrillView();
      return;
    }
    if (drillState.deck.length === 0) return;
    drillState.idx = (drillState.idx + delta + drillState.deck.length) % drillState.deck.length;
    drillState.revealStep = 0;
    resetInputForCard();
    renderDrillView();
  }

  function renderDrillView() {
    const root = document.getElementById("drillView");
    if (!root) return;

    if (!drillState.hasInitializedTab) {
      drillState.hasInitializedTab = true;
      const due = getDueSummary();
      drillState.dojoTab = due.totalDue > 0 ? "today" : "journal";
    }

    if (drillState.dojoTab === "today") {
      renderTodayHub(root);
      return;
    }
    if (drillState.dojoTab === "calc") {
      renderCalcDojo(root);
      return;
    }
    if (drillState.dojoTab === "theory") {
      renderTheoryDojo(root);
      return;
    }
    if (drillState.dojoTab === "cbt") {
      renderCbtDojo(root);
      return;
    }
    if (drillState.dojoTab === "past") {
      renderPastExamArchive(root);
      return;
    }

    if (drillState.sessionSummary) {
      root.innerHTML = renderDojoTabBar() + renderSessionSummaryHtml(
        "仕訳道場 集中セット完了",
        drillState.sessionLog,
        "journalRetryWrongBtn",
        "journalRetrySetBtn",
        "journalResetSetBtn"
      );
      bindDojoTabBar(root);
      const wb = document.getElementById("journalRetryWrongBtn");
      if (wb) {
        wb.onclick = () => {
          const ids = drillState.sessionLog.filter((x) => !x.ok).map((x) => x.cardId);
          rebuildDeck(false, ids);
          renderDrillView();
        };
      }
      document.getElementById("journalRetrySetBtn").onclick = () => {
        rebuildDeck(true);
        renderDrillView();
      };
      document.getElementById("journalResetSetBtn").onclick = () => {
        drillState.sessionLimit = 0;
        state.prefs.sessionLimit = 0;
        saveState();
        rebuildDeck(false);
        renderDrillView();
      };
      return;
    }

    if (drillState.deck.length === 0 && !drillState.blitzActive) {
      rebuildDeck(false);
    }

    const allCards = DATA.drills || [];
    const masteredCnt = allCards.filter((c) => state.srs[c.id] && state.srs[c.id].level >= 2).length;
    const dueCnt = allCards.filter((c) => isCardDue(c.id)).length;
    const weakCnt = allCards.filter((c) => isCardLeech(c.id)).length;

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

    const docMap = new Map();
    allCards.forEach((c) => {
      if (drillState.part !== "all" && c.part !== drillState.part) return;
      if (!docMap.has(c.docId)) docMap.set(c.docId, { id: c.docId, title: c.docTitle, cnt: 0 });
      docMap.get(c.docId).cnt++;
    });

    const activeFilterCount = (drillState.part !== "all" ? 1 : 0) + (drillState.docFilter ? 1 : 0) + (drillState.queueMode !== "all" ? 1 : 0);

    let html = renderDojoTabBar() +
      '<div class="mobile-drill-bar mobile-only">' +
      '<div class="mobile-seg-group">' +
      '<button type="button" class="mobile-seg-btn drill-submode-btn' + (drillState.mode === "input" ? " active" : "") + '" data-dmode="input">入力</button>' +
      '<button type="button" class="mobile-seg-btn drill-submode-btn' + (drillState.mode === "subject" ? " active" : "") + '" data-dmode="subject">科目</button>' +
      '<button type="button" class="mobile-seg-btn drill-submode-btn' + (drillState.mode === "flash" ? " active" : "") + '" data-dmode="flash">カード</button>' +
      "</div>" +
      '<div class="mobile-drill-actions">' +
      '<button type="button" class="mask-btn' + (drillState.mobileFiltersOpen ? " active" : "") + '" id="drillMobileFilterBtn" aria-expanded="' + (drillState.mobileFiltersOpen ? "true" : "false") + '">絞込' + (activeFilterCount ? " (" + activeFilterCount + ")" : "") + "</button>" +
      '<button type="button" class="primary-btn" id="drillMobileBlitzBtn">10問</button>' +
      "</div></div>" +
      '<div class="studio-header drill-view-header">' +
      "<div><h2>仕訳道場</h2>" +
      '<p class="studio-sub">全単元・模試連動 <strong>' + allCards.length + "問</strong>。5要素思考ヒント・差分採点・SM-2復習に対応しています。</p></div>" +
      '<div class="drill-stats-pills">' +
      '<span class="meta-pill accent">習得済 ' + masteredCnt + " / " + allCards.length + "</span>" +
      '<span class="meta-pill amber">期限 ' + dueCnt + "件</span>" +
      '<span class="meta-pill danger-pill">要復習 ' + weakCnt + "件</span>" +
      "</div></div>";

    html += '<div class="drill-toolbar">';
    html += '<div class="drill-submode-tabs">';
    html += '<button type="button" class="sim-tab-btn drill-submode-btn' + (drillState.mode === "input" ? " active" : "") + '" data-dmode="input">入力・自動採点</button>';
    html += '<button type="button" class="sim-tab-btn drill-submode-btn' + (drillState.mode === "subject" ? " active" : "") + '" data-dmode="subject">科目スピード</button>';
    html += '<button type="button" class="sim-tab-btn drill-submode-btn' + (drillState.mode === "flash" ? " active" : "") + '" data-dmode="flash">フラッシュカード</button>';
    html += "</div>";

    html += '<div id="drillFilterPanel" class="drill-filter-panel' + (drillState.mobileFiltersOpen ? " open" : "") + '">';
    html += '<div class="drill-filters-grid">';
    html += '<select id="drillPartSelect" class="studio-select" aria-label="出題範囲を選択">';
    partOptions.forEach((op) => {
      html += '<option value="' + op.id + '"' + (drillState.part === op.id ? " selected" : "") + ">" + escapeHtml(op.label) + "</option>";
    });
    html += "</select>";

    html += '<select id="drillDocSelect" class="studio-select" aria-label="単元を選択">';
    html += '<option value="">すべての単元</option>';
    Array.from(docMap.values()).forEach((d) => {
      html += '<option value="' + escapeHtml(d.id) + '"' + (drillState.docFilter === d.id ? " selected" : "") + ">" + escapeHtml(d.id + " (" + d.cnt + ")") + "</option>";
    });
    html += "</select>";

    html += '<select id="drillQueueSelect" class="studio-select" aria-label="出題フィルタを選択">';
    html += '<option value="all"' + (drillState.queueMode === "all" ? " selected" : "") + ">すべて表示</option>";
    html += '<option value="due"' + (drillState.queueMode === "due" ? " selected" : "") + ">復習期限到来 (" + dueCnt + ")</option>";
    html += '<option value="unmastered"' + (drillState.queueMode === "unmastered" ? " selected" : "") + ">未習得のみ</option>";
    html += '<option value="leech"' + (drillState.queueMode === "leech" ? " selected" : "") + ">鬼門・要復習 (" + weakCnt + ")</option>";
    html += "</select>";

    html += '<select id="drillLimitSelect" class="studio-select" aria-label="セット問数を選択">';
    html += '<option value="10"' + (drillState.sessionLimit === 10 ? " selected" : "") + ">10問セット</option>";
    html += '<option value="20"' + (drillState.sessionLimit === 20 ? " selected" : "") + ">20問セット</option>";
    html += '<option value="0"' + (drillState.sessionLimit === 0 ? " selected" : "") + ">無制限（全件）</option>";
    html += "</select>";

    html += '<div class="drill-quick-actions">';
    html += '<button type="button" class="mask-btn" id="drillShuffleBtn">シャッフル</button>';
    html += '<button type="button" class="primary-btn" id="drillBlitzBtn">10問アタック</button>';
    html += "</div></div></div></div>";

    if (drillState.blitzActive) {
      const dispNum = Math.min(drillState.blitzCount + 1, drillState.blitzTotal);
      html +=
        '<div class="blitz-banner">' +
        "<span>タイムアタック中: <strong>" + dispNum + " / " + drillState.blitzTotal + "問目</strong>（正解 " + drillState.blitzScore + "）</span>" +
        '<span id="blitzTimerBadge" class="inline-clock">' + CLOCK_SVG + " " + drillState.blitzSec + "秒</span>" +
        '<button type="button" class="mask-btn" id="blitzStopBtn">中断</button>' +
        "</div>";
    } else if (drillState.sessionLimit > 0 && drillState.deck.length > 0) {
      html += renderSessionProgressHtml(drillState.idx, drillState.deck.length);
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

    html += renderJournalCardShellHtml(card, {
      mode: drillState.mode,
      rows: drillState.inputRows,
      insertTarget: drillState.insertTarget,
      focusedRow: drillState.lastFocusedCell.row,
      hintLevel: drillState.hintLevel,
      revealStep: drillState.revealStep,
      gradeResult: drillState.gradeResult,
      autoAppliedQuality: drillState.autoAppliedQuality,
      counterText: (drillState.idx + 1) + " / " + drillState.deck.length
    });

    root.innerHTML = html;
    bindDrillToolbar();

    bindJournalCardShell(root, card, {
      getMode: () => drillState.mode,
      setMode: (m) => {
        drillState.mode = m;
        state.prefs.drillMode = m;
        saveState();
        renderDrillView();
      },
      getRows: () => drillState.inputRows,
      setRows: (r) => { drillState.inputRows = r; },
      getInsertTarget: () => drillState.insertTarget,
      setInsertTarget: (t) => { drillState.insertTarget = t; },
      getFocusedCell: () => drillState.lastFocusedCell,
      setFocusedCell: (c) => { drillState.lastFocusedCell = c; },
      getFocusedAmt: () => drillState.lastFocusedAmtCell,
      setFocusedAmt: (c) => { drillState.lastFocusedAmtCell = c; },
      getHintLevel: () => drillState.hintLevel,
      setHintLevel: (l) => { drillState.hintLevel = l; renderDrillView(); },
      getRevealStep: () => drillState.revealStep,
      setRevealStep: (s) => { drillState.revealStep = s; renderDrillView(); },
      getGrade: () => drillState.gradeResult,
      setGrade: (g, aq) => { drillState.gradeResult = g; drillState.autoAppliedQuality = aq; renderDrillView(); },
      onAfterGradeRate: (q) => {
        const elapsed = Math.round((Date.now() - drillState.cardStartedAt) / 1000);
        recordSrsReview(card.id, q, elapsed);
        if (q === 0) bumpMistakeCount(card.id);
        advanceDrillCard(1, { cardId: card.id, type: "journal", ok: q >= 2, sec: elapsed });
      },
      onNextWithCurrentGrade: () => {
        const elapsed = Math.round((Date.now() - drillState.cardStartedAt) / 1000);
        const q = typeof drillState.autoAppliedQuality === "number" ? drillState.autoAppliedQuality : 2;
        advanceDrillCard(1, { cardId: card.id, type: "journal", ok: q >= 2, sec: elapsed });
      },
      onPrev: () => advanceDrillCard(-1, null),
      onNext: () => advanceDrillCard(1, null),
      rerender: () => renderDrillView()
    });
  }

  function bindDrillToolbar() {
    const rootEl = document.getElementById("drillView");
    if (rootEl) bindDojoTabBar(rootEl);
    document.querySelectorAll(".drill-submode-btn").forEach((b) => {
      b.onclick = () => {
        drillState.mode = b.dataset.dmode;
        state.prefs.drillMode = drillState.mode;
        saveState();
        renderDrillView();
      };
    });
    const pSel = document.getElementById("drillPartSelect");
    if (pSel) pSel.onchange = (e) => { stopBlitz(); drillState.part = e.target.value; drillState.docFilter = ""; rebuildDeck(false); renderDrillView(); };
    const dSel = document.getElementById("drillDocSelect");
    if (dSel) dSel.onchange = (e) => { stopBlitz(); drillState.docFilter = e.target.value; rebuildDeck(false); renderDrillView(); };
    const qSel = document.getElementById("drillQueueSelect");
    if (qSel) qSel.onchange = (e) => { stopBlitz(); drillState.queueMode = e.target.value; rebuildDeck(false); renderDrillView(); };
    const lSel = document.getElementById("drillLimitSelect");
    if (lSel) lSel.onchange = (e) => { stopBlitz(); drillState.sessionLimit = Number(e.target.value); state.prefs.sessionLimit = drillState.sessionLimit; saveState(); rebuildDeck(false); renderDrillView(); };
    const sBtn = document.getElementById("drillShuffleBtn");
    if (sBtn) sBtn.onclick = () => { stopBlitz(); rebuildDeck(true); renderDrillView(); };
    const bBtn = document.getElementById("drillBlitzBtn");
    if (bBtn) bBtn.onclick = startBlitz;
    const mbBtn = document.getElementById("drillMobileBlitzBtn");
    if (mbBtn) mbBtn.onclick = startBlitz;
    const mfBtn = document.getElementById("drillMobileFilterBtn");
    if (mfBtn) {
      mfBtn.onclick = () => {
        drillState.mobileFiltersOpen = !drillState.mobileFiltersOpen;
        const panel = document.getElementById("drillFilterPanel");
        if (panel) panel.classList.toggle("open", drillState.mobileFiltersOpen);
        mfBtn.classList.toggle("active", drillState.mobileFiltersOpen);
        mfBtn.setAttribute("aria-expanded", drillState.mobileFiltersOpen ? "true" : "false");
      };
    }
    const stBtn = document.getElementById("blitzStopBtn");
    if (stBtn) stBtn.onclick = () => { stopBlitz(); rebuildDeck(false); renderDrillView(); };
  }

  /* =========================================================================
   * 1B. INDUSTRIAL & COST CALCULATION DOJO (工簿・原計 数値道場)
   * ========================================================================= */
  const calcDojoState = {
    part: "all",
    queueMode: "all",
    sessionLimit: 10,
    deck: [],
    idx: 0,
    userVal: "",
    userSign: "favorable",
    hintLevel: 0,
    result: null,
    autoAppliedQuality: null,
    cardStartedAt: Date.now(),
    sessionLog: [],
    sessionSummary: null
  };

  function parseDecimalInput(s) {
    const half = String(s || "").replace(/[０-９．－]/g, (ch) => {
      if (ch === "．") return ".";
      if (ch === "－") return "-";
      return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    });
    const cleaned = half.replace(/[,円個倍%\s\u3000]/g, "");
    if (!cleaned || isNaN(Number(cleaned))) return null;
    return Number(cleaned);
  }

  function maskCalcFormula(formula) {
    return String(formula || "").replace(/\d[\d,.]*/g, "□");
  }

  function rebuildCalcDeck(shuffleIt = false, customIds = null) {
    const all = DATA.calcDrills || [];
    const nowMs = Date.now();
    let list = customIds
      ? all.filter((c) => customIds.includes(c.id))
      : all.filter((c) => {
          if (calcDojoState.part !== "all" && c.part !== calcDojoState.part) return false;
          const rec = state.srs[c.id];
          if (calcDojoState.queueMode === "due" && !isCardDue(c.id, nowMs)) return false;
          if (calcDojoState.queueMode === "unmastered" && rec && rec.level >= 2) return false;
          if (calcDojoState.queueMode === "leech" && !isCardLeech(c.id)) return false;
          return true;
        });
    if (shuffleIt) {
      list = list.slice();
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = list[i]; list[i] = list[j]; list[j] = t;
      }
    }
    if (!customIds && calcDojoState.sessionLimit > 0 && list.length > calcDojoState.sessionLimit) {
      list = list.slice(0, calcDojoState.sessionLimit);
    }
    calcDojoState.deck = list;
    calcDojoState.idx = 0;
    calcDojoState.userVal = "";
    calcDojoState.hintLevel = 0;
    calcDojoState.result = null;
    calcDojoState.autoAppliedQuality = null;
    calcDojoState.sessionLog = [];
    calcDojoState.sessionSummary = null;
    calcDojoState.cardStartedAt = Date.now();
  }

  function renderCalcCardShellHtml(item, ctx) {
    const srsRec = state.srs[item.id];
    const srsBadge = !srsRec
      ? '<span class="meta-pill">未学習</span>'
      : isCardLeech(item.id)
      ? '<span class="meta-pill danger-pill">要復習</span>'
      : isCardDue(item.id)
      ? '<span class="meta-pill amber">復習期限</span>'
      : srsRec.level >= 2
      ? '<span class="meta-pill emerald-pill">正解済</span>'
      : '<span class="meta-pill amber">あいまい</span>';

    let html = '<div class="studio-card drill-card">';
    html += '<div class="drill-card-meta"><div><span class="meta-pill accent">' + escapeHtml(item.docId) + '</span> <span class="meta-pill">' + escapeHtml(item.topic) + '</span> <span class="meta-pill">' + escapeHtml(item.format) + "</span> " + srsBadge + '</div><div class="drill-counter">' + escapeHtml(ctx.counterText) + "</div></div>";
    html += '<div class="drill-question-box"><div class="focus-text">' + formatInlineMd(item.question) + "</div></div>";

    html += '<div class="calc-input-row">';
    html += '<label class="calc-num-label">解答数値:<input id="calcAnsInput" type="text" inputmode="decimal" class="drill-cell-input num" style="max-width:200px;" placeholder="例: 12000" value="' + escapeHtml(ctx.userVal) + '" /></label>';
    html += '<span class="calc-unit-pill">' + escapeHtml(item.answerUnit) + "</span>";
    if (item.varianceSign !== "none") {
      html += '<div class="drill-submode-tabs">';
      html += '<button type="button" class="sim-tab-btn calc-sign-btn' + (ctx.userSign === "favorable" ? " active" : "") + '" data-sign="favorable">有利差異 (貸方/+)</button>';
      html += '<button type="button" class="sim-tab-btn calc-sign-btn' + (ctx.userSign === "unfavorable" ? " active" : "") + '" data-sign="unfavorable">不利差異 (借方/-)</button>';
      html += "</div>";
    }
    html += '<button type="button" class="mask-btn' + (inlineCalcState.open ? " active" : "") + '" id="calcInlineToggleBtn">' + INLINE_CALC_SVG + " 電卓</button>";
    html += "</div>";

    html += renderInlineCalcHtml();

    if (ctx.hintLevel > 0) {
      html += '<div class="drill-hint-box hint-stepper-box">';
      html += '<div class="hint-step-row"><strong>Hint 1（下書き型・論点）：</strong><code>' + escapeHtml(item.format) + "</code> ／ " + escapeHtml(item.topic) + "</div>";
      if (ctx.hintLevel >= 2) {
        html += '<div class="hint-step-row"><strong>Hint 2（式の構造）：</strong><code>' + escapeHtml(maskCalcFormula(item.formula)) + "</code></div>";
      }
      html += "</div>";
    }

    html += '<div class="drill-controls-row"><div class="drill-reveal-btns">';
    html += '<button type="button" class="primary-btn" id="calcCheckBtn">判定する（採点）</button>';
    html += '<button type="button" class="secondary-btn" id="calcHintBtn">' +
      (ctx.hintLevel === 0 ? "ヒント 1/2" : ctx.hintLevel === 1 ? "式の構造を見る (2/2)" : "ヒントを隠す") +
      "</button>";
    html += '<button type="button" class="mask-btn" id="calcOpenDocBtn">単元テキスト</button>';
    html += "</div>";
    if (!ctx.hideNavBtns) {
      html += '<div class="drill-nav-btns"><button type="button" class="mask-btn" id="calcPrevBtn">← 前</button><button type="button" class="mask-btn" id="calcNextBtn">次 →</button></div>';
    }
    html += "</div>";

    if (ctx.result) {
      const r = ctx.result;
      const signJp = item.varianceSign === "favorable" ? "（有利差異）" : item.varianceSign === "unfavorable" ? "（不利差異）" : "";
      html += '<div class="grade-result-box ' + (r.ok ? "grade-perfect" : "grade-wrong") + '">';
      html += '<div class="grade-msg">' + escapeHtml(r.msg) + "</div>";
      html += '<div style="margin-bottom:8px;"><strong>正解：</strong><code>' + fmtNum(item.answerNum, String(item.answerNum).includes(".") ? 1 : 0) + escapeHtml(item.answerUnit + signJp) + "</code></div>";
      html += '<div class="drill-explanation-box"><strong>計算式・解説</strong><div><code>' + escapeHtml(item.formula) + '</code></div><div class="exp-body">' + escapeHtml(item.explanation) + "</div></div>";
      html += renderMistakeTagBoxHtml(item.id);
      html += renderSm2BarHtml(item.id, ctx.autoAppliedQuality);
      html += '<div style="margin-top:12px;"><button type="button" class="primary-btn" id="calcAfterNextBtn">次の問題へ →</button></div>';
      html += "</div>";
    }
    html += "</div>";
    return html;
  }

  function bindCalcCardShell(root, item, ops) {
    const pb = document.getElementById("calcPrevBtn");
    if (pb && ops.onPrev) pb.onclick = ops.onPrev;
    const nb = document.getElementById("calcNextBtn");
    if (nb && ops.onNext) nb.onclick = ops.onNext;
    const ob = document.getElementById("calcOpenDocBtn");
    if (ob) ob.onclick = () => openDoc(item.docId);

    const inp = document.getElementById("calcAnsInput");
    if (inp) {
      inp.oninput = (e) => { ops.setVal(e.target.value); };
      inp.onkeydown = (e) => {
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          e.stopPropagation();
          if (ops.getResult()) ops.onNext();
          else document.getElementById("calcCheckBtn")?.click();
        }
      };
    }

    root.querySelectorAll(".calc-sign-btn").forEach((b) => {
      b.onclick = () => ops.setSign(b.dataset.sign);
    });

    const cToggle = document.getElementById("calcInlineToggleBtn");
    if (cToggle) {
      cToggle.onclick = () => {
        inlineCalcState.open = !inlineCalcState.open;
        ops.rerender();
      };
    }
    bindInlineCalc(root, (val) => {
      ops.setVal(String(val));
      ops.rerender();
    });

    const hBtn = document.getElementById("calcHintBtn");
    if (hBtn) {
      hBtn.onclick = () => {
        const cur = ops.getHint();
        ops.setHint(cur >= 2 ? 0 : cur + 1);
      };
    }

    document.getElementById("calcCheckBtn").onclick = () => {
      const uNum = parseDecimalInput(ops.getVal());
      if (uNum === null) {
        ops.setResult({ ok: false, msg: "数値を入力してください。" }, null);
        return;
      }
      const numMatch = Math.abs(Math.abs(uNum) - Math.abs(Number(item.answerNum))) < 0.05 &&
        (Number(item.answerNum) < 0 ? uNum < 0 || item.varianceSign !== "none" : true);
      let effSign = ops.getSign();
      if (item.varianceSign !== "none" && uNum < 0) effSign = "unfavorable";
      const signMatch = item.varianceSign === "none" || effSign === item.varianceSign;
      const ok = numMatch && signMatch;
      const q = ok ? 2 : 0;
      recordSrsReview(item.id, q);
      if (!ok) bumpMistakeCount(item.id);
      ops.setResult({
        ok,
        msg: ok ? "正解 — 計算ロジックが正確に身についています。" : (!numMatch ? "数値が異なります。下の公式と下書き型を確認しましょう。" : "数値は正解ですが、有利差異／不利差異の判定が逆です。")
      }, q);
    };

    if (ops.getResult()) {
      bindMistakeTagBox(root, item.id);
      bindSm2Bar(root, (q) => ops.onAfterRate(q));
      const an = document.getElementById("calcAfterNextBtn");
      if (an) an.onclick = ops.onNext;
    }
  }

  function renderCalcDojo(root) {
    const all = DATA.calcDrills || [];
    if (calcDojoState.sessionSummary) {
      root.innerHTML = renderDojoTabBar() + renderSessionSummaryHtml(
        "工簿数値道場 集中セット完了",
        calcDojoState.sessionLog,
        "calcRetryWrongBtn",
        "calcRetrySetBtn",
        "calcResetSetBtn"
      );
      bindDojoTabBar(root);
      const wb = document.getElementById("calcRetryWrongBtn");
      if (wb) {
        wb.onclick = () => {
          rebuildCalcDeck(false, calcDojoState.sessionLog.filter((x) => !x.ok).map((x) => x.cardId));
          renderCalcDojo(root);
        };
      }
      document.getElementById("calcRetrySetBtn").onclick = () => { rebuildCalcDeck(true); renderCalcDojo(root); };
      document.getElementById("calcResetSetBtn").onclick = () => { calcDojoState.sessionLimit = 0; rebuildCalcDeck(false); renderCalcDojo(root); };
      return;
    }

    if (calcDojoState.deck.length === 0) rebuildCalcDeck(false);
    const list = calcDojoState.deck;
    if (calcDojoState.idx >= list.length) calcDojoState.idx = 0;

    const masteredCnt = all.filter((c) => state.srs[c.id] && state.srs[c.id].level >= 2).length;
    const dueCnt = all.filter((c) => isCardDue(c.id)).length;

    let html = renderDojoTabBar() +
      '<div class="studio-header">' +
      "<div><h2>工業簿記・原価計算 数値道場（全" + all.length + "問）</h2>" +
      '<p class="studio-sub">シュラッター図・総合原価・標準原価・CVP・意思決定・NPVの計算力を数値入力＋内蔵電卓で直接採点します。</p></div>' +
      '<div class="drill-stats-pills"><span class="meta-pill accent">習得済 ' + masteredCnt + " / " + all.length + '</span><span class="meta-pill amber">期限 ' + dueCnt + "件</span></div></div>";

    html += '<div class="drill-toolbar"><div class="drill-filters-grid">';
    html += '<select id="calcPartSel" class="studio-select" aria-label="工簿範囲を選択">';
    html += '<option value="all"' + (calcDojoState.part === "all" ? " selected" : "") + ">全範囲 (" + all.length + ")</option>";
    html += '<option value="L2I"' + (calcDojoState.part === "L2I" ? " selected" : "") + ">2級 工業簿記 (" + all.filter((c) => c.part === "L2I").length + ")</option>";
    html += '<option value="L1I"' + (calcDojoState.part === "L1I" ? " selected" : "") + ">1級 工簿・原価計算 (" + all.filter((c) => c.part === "L1I").length + ")</option>";
    html += "</select>";
    html += '<select id="calcQueueSel" class="studio-select" aria-label="工簿出題状態を選択">';
    html += '<option value="all"' + (calcDojoState.queueMode === "all" ? " selected" : "") + ">すべて</option>";
    html += '<option value="due"' + (calcDojoState.queueMode === "due" ? " selected" : "") + ">復習期限到来 (" + dueCnt + ")</option>";
    html += '<option value="unmastered"' + (calcDojoState.queueMode === "unmastered" ? " selected" : "") + ">未習得のみ</option>";
    html += '<option value="leech"' + (calcDojoState.queueMode === "leech" ? " selected" : "") + ">要復習・鬼門</option>";
    html += "</select>";
    html += '<select id="calcLimitSel" class="studio-select" aria-label="工簿セット数">';
    html += '<option value="10"' + (calcDojoState.sessionLimit === 10 ? " selected" : "") + ">10問セット</option>";
    html += '<option value="0"' + (calcDojoState.sessionLimit === 0 ? " selected" : "") + ">全問</option>";
    html += "</select>";
    html += '<div class="drill-quick-actions"><button type="button" class="mask-btn" id="calcShuffleBtn">シャッフル</button><button type="button" class="mask-btn" id="calcNextQuickBtn">次へ →</button></div>';
    html += "</div></div>";

    if (calcDojoState.sessionLimit > 0 && list.length > 0) {
      html += renderSessionProgressHtml(calcDojoState.idx, list.length);
    }

    const item = list[calcDojoState.idx];
    if (!item) {
      html += '<div class="studio-card"><p>条件に一致する工簿問題がありません。</p><button type="button" class="primary-btn" id="resetCalcFilterBtn">すべて表示</button></div>';
      root.innerHTML = html;
      bindDojoTabBar(root);
      const rb = document.getElementById("resetCalcFilterBtn");
      if (rb) rb.onclick = () => { calcDojoState.part = "all"; calcDojoState.queueMode = "all"; rebuildCalcDeck(false); renderCalcDojo(root); };
      return;
    }

    html += renderCalcCardShellHtml(item, {
      userVal: calcDojoState.userVal,
      userSign: calcDojoState.userSign,
      hintLevel: calcDojoState.hintLevel,
      result: calcDojoState.result,
      autoAppliedQuality: calcDojoState.autoAppliedQuality,
      counterText: (calcDojoState.idx + 1) + " / " + list.length
    });

    root.innerHTML = html;
    bindDojoTabBar(root);

    document.getElementById("calcPartSel").onchange = (e) => { calcDojoState.part = e.target.value; rebuildCalcDeck(false); renderCalcDojo(root); };
    document.getElementById("calcQueueSel").onchange = (e) => { calcDojoState.queueMode = e.target.value; rebuildCalcDeck(false); renderCalcDojo(root); };
    document.getElementById("calcLimitSel").onchange = (e) => { calcDojoState.sessionLimit = Number(e.target.value); rebuildCalcDeck(false); renderCalcDojo(root); };
    document.getElementById("calcShuffleBtn").onclick = () => { rebuildCalcDeck(true); renderCalcDojo(root); };

    const goCalc = (d, logEntry) => {
      if (logEntry) calcDojoState.sessionLog.push(logEntry);
      if (d > 0 && calcDojoState.sessionLimit > 0 && calcDojoState.idx + 1 >= list.length && calcDojoState.sessionLog.length > 0) {
        calcDojoState.sessionSummary = true;
        renderCalcDojo(root);
        return;
      }
      calcDojoState.idx = (calcDojoState.idx + d + list.length) % list.length;
      calcDojoState.userVal = "";
      calcDojoState.hintLevel = 0;
      calcDojoState.result = null;
      calcDojoState.autoAppliedQuality = null;
      calcDojoState.cardStartedAt = Date.now();
      renderCalcDojo(root);
    };
    document.getElementById("calcNextQuickBtn").onclick = () => goCalc(1, null);

    bindCalcCardShell(root, item, {
      getVal: () => calcDojoState.userVal,
      setVal: (v) => { calcDojoState.userVal = v; },
      getSign: () => calcDojoState.userSign,
      setSign: (s) => { calcDojoState.userSign = s; renderCalcDojo(root); },
      getHint: () => calcDojoState.hintLevel,
      setHint: (h) => { calcDojoState.hintLevel = h; renderCalcDojo(root); },
      getResult: () => calcDojoState.result,
      setResult: (r, aq) => { calcDojoState.result = r; calcDojoState.autoAppliedQuality = aq; renderCalcDojo(root); },
      onAfterRate: (q) => {
        const elapsed = Math.round((Date.now() - calcDojoState.cardStartedAt) / 1000);
        recordSrsReview(item.id, q, elapsed);
        if (q === 0) bumpMistakeCount(item.id);
        goCalc(1, { cardId: item.id, type: "calc", ok: q >= 2, sec: elapsed });
      },
      onPrev: () => goCalc(-1, null),
      onNext: () => {
        const elapsed = Math.round((Date.now() - calcDojoState.cardStartedAt) / 1000);
        const entry = calcDojoState.result ? { cardId: item.id, type: "calc", ok: !!calcDojoState.result.ok, sec: elapsed } : null;
        goCalc(1, entry);
      },
      rerender: () => renderCalcDojo(root)
    });
  }

  /* =========================================================================
   * 1C. THEORY KEYWORDS & ARGUMENTS DOJO (理論 穴埋め道場 130問)
   * ========================================================================= */
  const theoryDojoState = {
    source: "all",
    mode: "choice", // "choice" | "recall"
    queueMode: "all",
    sessionLimit: 10,
    deck: [],
    idx: 0,
    pickedIdx: -1,
    revealed: false,
    autoAppliedQuality: null,
    cardStartedAt: Date.now(),
    sessionLog: [],
    sessionSummary: null
  };

  function buildTheoryChoices(item, all) {
    const sameCat = all.filter((x) => x.id !== item.id && x.answer !== item.answer && x.category === item.category && x.source === item.source).map((x) => x.answer);
    const sameSrc = all.filter((x) => x.id !== item.id && x.answer !== item.answer && x.source === item.source && x.category !== item.category).map((x) => x.answer);
    const otherPool = all.filter((x) => x.id !== item.id && x.answer !== item.answer && x.source !== item.source).map((x) => x.answer);
    let seed = 0;
    for (let i = 0; i < item.id.length; i++) seed = (seed * 31 + item.id.charCodeAt(i)) >>> 0;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const shuffle = (arr) => {
      const u = Array.from(new Set(arr));
      for (let i = u.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const t = u[i]; u[i] = u[j]; u[j] = t;
      }
      return u;
    };
    const merged = shuffle(sameCat).concat(shuffle(sameSrc)).concat(shuffle(otherPool));
    const uniqueDist = Array.from(new Set(merged)).filter((x) => x !== item.answer);
    const choices = [item.answer].concat(uniqueDist.slice(0, 3));
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = choices[i]; choices[i] = choices[j]; choices[j] = t;
    }
    return choices;
  }

  function rebuildTheoryDeck(shuffleIt = false, customIds = null) {
    const all = DATA.theoryDrills || [];
    const nowMs = Date.now();
    let list = customIds
      ? all.filter((t) => customIds.includes(t.id))
      : all.filter((t) => {
          if (theoryDojoState.source !== "all" && t.source !== theoryDojoState.source) return false;
          const rec = state.srs[t.id];
          if (theoryDojoState.queueMode === "due" && !isCardDue(t.id, nowMs)) return false;
          if (theoryDojoState.queueMode === "unmastered" && rec && rec.level >= 2) return false;
          if (theoryDojoState.queueMode === "leech" && !isCardLeech(t.id)) return false;
          return true;
        });
    if (shuffleIt) {
      list = list.slice();
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
      }
    }
    if (!customIds && theoryDojoState.sessionLimit > 0 && list.length > theoryDojoState.sessionLimit) {
      list = list.slice(0, theoryDojoState.sessionLimit);
    }
    theoryDojoState.deck = list;
    theoryDojoState.idx = 0;
    theoryDojoState.pickedIdx = -1;
    theoryDojoState.revealed = false;
    theoryDojoState.autoAppliedQuality = null;
    theoryDojoState.sessionLog = [];
    theoryDojoState.sessionSummary = null;
    theoryDojoState.cardStartedAt = Date.now();
  }

  function renderTheoryCardShellHtml(item, choices, ctx) {
    const mode = ctx.mode; // "choice" | "recall"
    const answered = mode === "choice" ? ctx.pickedIdx >= 0 : ctx.revealed;
    const maskedPrompt = item.source === "EX-05" && item.answer && item.prompt.includes(item.answer)
      ? item.prompt.replace(item.answer, "【 ？？？ 】")
      : item.prompt;
    const dispTitle = item.source === "CS-05" ? "この本質定義に当てはまる理論キーワードは？" : item.title;

    let html = '<div class="studio-card drill-card">';
    html += '<div class="drill-card-meta"><div><span class="meta-pill accent">' + escapeHtml(item.source) + '</span> <span class="meta-pill">' + escapeHtml(item.category) + '</span></div><div class="drill-counter">' + escapeHtml(ctx.counterText) + "</div></div>";
    html += '<div class="drill-doc-title">' + escapeHtml(dispTitle) + "</div>";

    if (ctx.showModeSwitch) {
      html += '<div class="drill-submode-tabs" style="margin-bottom:10px;">';
      html += '<button type="button" class="sim-tab-btn shell-tmode-btn' + (mode === "choice" ? " active" : "") + '" data-tmode="choice">4択スピード (1〜4キー)</button>';
      html += '<button type="button" class="sim-tab-btn shell-tmode-btn' + (mode === "recall" ? " active" : "") + '" data-tmode="recall">自力想起（記述対策）</button>';
      html += "</div>";
    }

    html += '<div class="drill-question-box"><div class="focus-text">' + formatInlineMd(maskedPrompt) + "</div></div>";

    if (mode === "choice") {
      html += '<div class="theory-choices-grid">';
      choices.forEach((ch, cIdx) => {
        let cls = "theory-choice-btn";
        if (answered) {
          if (ch === item.answer) cls += " choice-correct";
          else if (cIdx === ctx.pickedIdx) cls += " choice-wrong";
        }
        html += '<button type="button" class="' + cls + '" data-cidx="' + cIdx + '"' + (answered ? " disabled" : "") + ">" + (cIdx + 1) + ". " + escapeHtml(ch) + "</button>";
      });
      html += "</div>";

      if (answered) {
        const ok = choices[ctx.pickedIdx] === item.answer;
        html += '<div class="grade-result-box ' + (ok ? "grade-perfect" : "grade-wrong") + '">';
        html += '<div class="grade-msg">' + (ok ? "正解！" : "不正解 — 正解は「" + escapeHtml(item.answer) + "」です。") + "</div>";
        html += '<div class="drill-explanation-box"><strong>理論根拠・対比の急所</strong><div class="exp-body">' + formatInlineMd(item.explanation || item.prompt) + "</div></div>";
        html += renderMistakeTagBoxHtml(item.id);
        html += renderSm2BarHtml(item.id, ctx.autoAppliedQuality);
        html += '<div class="drill-controls-row" style="margin-top:12px;"><button type="button" class="mask-btn" id="theoryOpenDocBtn">関連単元を開く</button><button type="button" class="primary-btn" id="theoryAfterNextBtn">次の問題へ →</button></div>';
        html += "</div>";
      } else if (!ctx.hideNavBtns) {
        html += '<div class="drill-controls-row"><div class="drill-nav-btns"><button type="button" class="mask-btn" id="theoryPrevBtn">← 前</button><button type="button" class="mask-btn" id="theoryNextBtn">次 →</button></div></div>';
      }
    } else {
      // Recall mode
      if (!ctx.revealed) {
        html += '<div class="drill-controls-row"><div class="drill-reveal-btns"><button type="button" class="primary-btn" id="theoryRecallRevealBtn">答えと理論根拠を表示 (Space)</button><button type="button" class="mask-btn" id="theoryOpenDocBtn">関連単元を開く</button></div>';
        if (!ctx.hideNavBtns) {
          html += '<div class="drill-nav-btns"><button type="button" class="mask-btn" id="theoryPrevBtn">← 前</button><button type="button" class="mask-btn" id="theoryNextBtn">次 →</button></div>';
        }
        html += "</div>";
      } else {
        html += '<div class="grade-result-box grade-perfect">';
        html += '<div class="grade-msg">正解キーワード：' + escapeHtml(item.answer) + "</div>";
        html += '<div class="drill-explanation-box"><strong>結論・理論根拠</strong><div class="exp-body">' + formatInlineMd(item.prompt) + "</div>" +
          (item.explanation ? '<div class="exp-body" style="margin-top:6px;">' + formatInlineMd(item.explanation) + "</div>" : "") + "</div>";
        html += renderMistakeTagBoxHtml(item.id);
        html += renderSm2BarHtml(item.id, null);
        html += '<div class="drill-controls-row" style="margin-top:12px;"><button type="button" class="mask-btn" id="theoryOpenDocBtn">関連単元を開く</button></div>';
        html += "</div>";
      }
    }
    html += "</div>";
    return html;
  }

  function bindTheoryCardShell(root, item, choices, ops) {
    root.querySelectorAll(".shell-tmode-btn").forEach((b) => {
      b.onclick = () => ops.setMode(b.dataset.tmode);
    });
    const pb = document.getElementById("theoryPrevBtn"); if (pb && ops.onPrev) pb.onclick = ops.onPrev;
    const nb = document.getElementById("theoryNextBtn"); if (nb && ops.onNext) nb.onclick = ops.onNext;
    const an = document.getElementById("theoryAfterNextBtn"); if (an) an.onclick = ops.onNext;
    const od = document.getElementById("theoryOpenDocBtn"); if (od) od.onclick = () => openDoc(item.docId);

    const mode = ops.getMode();
    if (mode === "choice") {
      root.querySelectorAll(".theory-choice-btn").forEach((b) => {
        b.onclick = () => {
          const idx = Number(b.dataset.cidx);
          const ok = choices[idx] === item.answer;
          const q = ok ? 2 : 0;
          recordSrsReview(item.id, q);
          if (!ok) bumpMistakeCount(item.id);
          ops.setPicked(idx, q);
        };
      });
      if (ops.getPicked() >= 0) {
        bindMistakeTagBox(root, item.id);
        bindSm2Bar(root, (q) => ops.onAfterRate(q));
      }
    } else {
      const rvBtn = document.getElementById("theoryRecallRevealBtn");
      if (rvBtn) rvBtn.onclick = () => ops.setRevealed(true);
      if (ops.getRevealed()) {
        bindMistakeTagBox(root, item.id);
        bindSm2Bar(root, (q) => ops.onAfterRate(q));
      }
    }
  }

  function renderTheoryDojo(root) {
    const all = DATA.theoryDrills || [];
    if (theoryDojoState.sessionSummary) {
      root.innerHTML = renderDojoTabBar() + renderSessionSummaryHtml(
        "理論穴埋め道場 集中セット完了",
        theoryDojoState.sessionLog,
        "theoryRetryWrongBtn",
        "theoryRetrySetBtn",
        "theoryResetSetBtn"
      );
      bindDojoTabBar(root);
      const wb = document.getElementById("theoryRetryWrongBtn");
      if (wb) {
        wb.onclick = () => {
          rebuildTheoryDeck(false, theoryDojoState.sessionLog.filter((x) => !x.ok).map((x) => x.cardId));
          renderTheoryDojo(root);
        };
      }
      document.getElementById("theoryRetrySetBtn").onclick = () => { rebuildTheoryDeck(true); renderTheoryDojo(root); };
      document.getElementById("theoryResetSetBtn").onclick = () => { theoryDojoState.sessionLimit = 0; rebuildTheoryDeck(false); renderTheoryDojo(root); };
      return;
    }

    if (theoryDojoState.deck.length === 0) rebuildTheoryDeck(false);
    const list = theoryDojoState.deck;
    if (theoryDojoState.idx >= list.length) theoryDojoState.idx = 0;

    const masteredCnt = all.filter((t) => state.srs[t.id] && state.srs[t.id].level >= 2).length;
    const dueCnt = all.filter((t) => isCardDue(t.id)).length;

    let html = renderDojoTabBar() +
      '<div class="studio-header">' +
      "<div><h2>1級会計学・原価計算 理論穴埋め道場（全" + all.length + "問）</h2>" +
      '<p class="studio-sub">EX-05（頻出論証50選）と CS-05（理論キーワード80語）。同一カテゴリ近接4択＋自力想起モードに対応。</p></div>' +
      '<div class="drill-stats-pills"><span class="meta-pill accent">習得済 ' + masteredCnt + " / " + all.length + '</span><span class="meta-pill amber">期限 ' + dueCnt + "件</span></div></div>";

    html += '<div class="drill-toolbar">';
    html += '<div class="drill-submode-tabs">';
    html += '<button type="button" class="sim-tab-btn theory-mode-btn' + (theoryDojoState.mode === "choice" ? " active" : "") + '" data-thmode="choice">4択スピード</button>';
    html += '<button type="button" class="sim-tab-btn theory-mode-btn' + (theoryDojoState.mode === "recall" ? " active" : "") + '" data-thmode="recall">自力想起（記述対策）</button>';
    html += "</div>";
    html += '<div class="drill-filters-grid">';
    html += '<select id="theorySrcSel" class="studio-select" aria-label="理論出典を選択">';
    html += '<option value="all"' + (theoryDojoState.source === "all" ? " selected" : "") + ">すべて (" + all.length + ")</option>";
    html += '<option value="EX-05"' + (theoryDojoState.source === "EX-05" ? " selected" : "") + ">EX-05 1級重要論証 (" + all.filter((t) => t.source === "EX-05").length + ")</option>";
    html += '<option value="CS-05"' + (theoryDojoState.source === "CS-05" ? " selected" : "") + ">CS-05 理論キーワード (" + all.filter((t) => t.source === "CS-05").length + ")</option>";
    html += "</select>";
    html += '<select id="theoryQueueSel" class="studio-select" aria-label="理論出題状態を選択">';
    html += '<option value="all"' + (theoryDojoState.queueMode === "all" ? " selected" : "") + ">すべて</option>";
    html += '<option value="due"' + (theoryDojoState.queueMode === "due" ? " selected" : "") + ">復習期限到来 (" + dueCnt + ")</option>";
    html += '<option value="unmastered"' + (theoryDojoState.queueMode === "unmastered" ? " selected" : "") + ">未習得のみ</option>";
    html += '<option value="leech"' + (theoryDojoState.queueMode === "leech" ? " selected" : "") + ">要復習・鬼門</option>";
    html += "</select>";
    html += '<select id="theoryLimitSel" class="studio-select" aria-label="理論セット数">';
    html += '<option value="10"' + (theoryDojoState.sessionLimit === 10 ? " selected" : "") + ">10問セット</option>";
    html += '<option value="0"' + (theoryDojoState.sessionLimit === 0 ? " selected" : "") + ">全問</option>";
    html += "</select>";
    html += '<div class="drill-quick-actions"><button type="button" class="mask-btn" id="theoryShuffleBtn">シャッフル</button><button type="button" class="mask-btn" id="theoryNextQuickBtn">次へ →</button></div>';
    html += "</div></div>";

    if (theoryDojoState.sessionLimit > 0 && list.length > 0) {
      html += renderSessionProgressHtml(theoryDojoState.idx, list.length);
    }

    const item = list[theoryDojoState.idx];
    if (!item) {
      html += '<div class="studio-card"><p>条件に一致する理論問題がありません。</p><button type="button" class="primary-btn" id="resetTheoryFilterBtn">すべて表示</button></div>';
      root.innerHTML = html;
      bindDojoTabBar(root);
      const rb = document.getElementById("resetTheoryFilterBtn");
      if (rb) rb.onclick = () => { theoryDojoState.source = "all"; theoryDojoState.queueMode = "all"; rebuildTheoryDeck(false); renderTheoryDojo(root); };
      return;
    }

    const choices = buildTheoryChoices(item, all);
    html += renderTheoryCardShellHtml(item, choices, {
      mode: theoryDojoState.mode,
      pickedIdx: theoryDojoState.pickedIdx,
      revealed: theoryDojoState.revealed,
      autoAppliedQuality: theoryDojoState.autoAppliedQuality,
      counterText: (theoryDojoState.idx + 1) + " / " + list.length
    });

    root.innerHTML = html;
    bindDojoTabBar(root);

    root.querySelectorAll(".theory-mode-btn").forEach((b) => {
      b.onclick = () => {
        theoryDojoState.mode = b.dataset.thmode;
        theoryDojoState.pickedIdx = -1;
        theoryDojoState.revealed = false;
        renderTheoryDojo(root);
      };
    });
    document.getElementById("theorySrcSel").onchange = (e) => { theoryDojoState.source = e.target.value; rebuildTheoryDeck(false); renderTheoryDojo(root); };
    document.getElementById("theoryQueueSel").onchange = (e) => { theoryDojoState.queueMode = e.target.value; rebuildTheoryDeck(false); renderTheoryDojo(root); };
    document.getElementById("theoryLimitSel").onchange = (e) => { theoryDojoState.sessionLimit = Number(e.target.value); rebuildTheoryDeck(false); renderTheoryDojo(root); };
    document.getElementById("theoryShuffleBtn").onclick = () => { rebuildTheoryDeck(true); renderTheoryDojo(root); };

    const goTh = (d, logEntry) => {
      if (logEntry) theoryDojoState.sessionLog.push(logEntry);
      if (d > 0 && theoryDojoState.sessionLimit > 0 && theoryDojoState.idx + 1 >= list.length && theoryDojoState.sessionLog.length > 0) {
        theoryDojoState.sessionSummary = true;
        renderTheoryDojo(root);
        return;
      }
      theoryDojoState.idx = (theoryDojoState.idx + d + list.length) % list.length;
      theoryDojoState.pickedIdx = -1;
      theoryDojoState.revealed = false;
      theoryDojoState.autoAppliedQuality = null;
      theoryDojoState.cardStartedAt = Date.now();
      renderTheoryDojo(root);
    };
    document.getElementById("theoryNextQuickBtn").onclick = () => goTh(1, null);

    bindTheoryCardShell(root, item, choices, {
      getMode: () => theoryDojoState.mode,
      setMode: (m) => { theoryDojoState.mode = m; renderTheoryDojo(root); },
      getPicked: () => theoryDojoState.pickedIdx,
      setPicked: (p, aq) => { theoryDojoState.pickedIdx = p; theoryDojoState.autoAppliedQuality = aq; renderTheoryDojo(root); },
      getRevealed: () => theoryDojoState.revealed,
      setRevealed: (rv) => { theoryDojoState.revealed = rv; renderTheoryDojo(root); },
      onAfterRate: (q) => {
        const elapsed = Math.round((Date.now() - theoryDojoState.cardStartedAt) / 1000);
        recordSrsReview(item.id, q, elapsed);
        if (q === 0) bumpMistakeCount(item.id);
        goTh(1, { cardId: item.id, type: "theory", ok: q >= 2, sec: elapsed });
      },
      onPrev: () => goTh(-1, null),
      onNext: () => {
        const elapsed = Math.round((Date.now() - theoryDojoState.cardStartedAt) / 1000);
        const answeredOk = theoryDojoState.mode === "choice" && theoryDojoState.pickedIdx >= 0
          ? choices[theoryDojoState.pickedIdx] === item.answer
          : false;
        const entry = theoryDojoState.pickedIdx >= 0 ? { cardId: item.id, type: "theory", ok: answeredOk, sec: elapsed } : null;
        goTh(1, entry);
      }
    });
  }

  /* =========================================================================
   * 1D. CBT MOCK EXAM RUNNER (本番CBT模試ランナー)
   * ========================================================================= */
  const cbtState = {
    examId: "EX-02",
    started: false,
    secLeft: 3600,
    timer: null,
    viewMode: state.prefs.cbtView || "single", // "single" | "list"
    qIdx: 0,
    answers: {}, // cardId -> Array<{ dSub, dAmt, cSub, cAmt }>
    flagged: {}, // cardId -> boolean
    focusedAmt: {}, // cardId -> { row, field }
    submitted: false,
    wrongRegistered: false,
    lastElapsedSec: 0
  };

  const CBT_EXAMS = [
    { id: "EX-02", label: "3級 実戦模試 第1回 (60分)", mins: 60 },
    { id: "EX-06", label: "3級 実戦模試 第2回 (60分)", mins: 60 },
    { id: "EX-03", label: "2級 実戦模試 第1回 (90分)", mins: 90 },
    { id: "EX-07", label: "2級 実戦模試 第2回 (90分)", mins: 90 },
    { id: "EX-04", label: "1級 本番総合模試 (90分前半)", mins: 90 }
  ];

  function stopCbtTimer() {
    if (cbtState.timer) { clearInterval(cbtState.timer); cbtState.timer = null; }
  }

  function getCbtRows(cardId) {
    const a = cbtState.answers[cardId];
    if (Array.isArray(a) && a.length > 0) return a;
    cbtState.answers[cardId] = [{ dSub: "", dAmt: "", cSub: "", cAmt: "" }];
    return cbtState.answers[cardId];
  }

  function isCbtCardAnswered(cardId) {
    return getCbtRows(cardId).some((r) => normalizeSubject(r.dSub) || normalizeSubject(r.cSub) || parseInputAmount(r.dAmt) > 0 || parseInputAmount(r.cAmt) > 0);
  }

  function renderCbtDojo(root) {
    const examMeta = CBT_EXAMS.find((e) => e.id === cbtState.examId) || CBT_EXAMS[0];
    const cards = (DATA.drills || []).filter((d) => d.docId === cbtState.examId);
    const mm = String(Math.floor(cbtState.secLeft / 60)).padStart(2, "0");
    const ss = String(cbtState.secLeft % 60).padStart(2, "0");

    let html = renderDojoTabBar() +
      '<div class="studio-header">' +
      "<div><h2>本番CBT模試ランナー</h2>" +
      '<p class="studio-sub">2027年新区分対応の模擬試験（第1回・第2回）を複数行仕訳対応で通し演習し、70%合格ラインと40%足切りを診断します。</p></div>' +
      '<div class="drill-stats-pills"><span id="cbtClockPill" class="meta-pill inline-clock ' + (cbtState.started ? "danger-pill" : "accent") + '">' + CLOCK_SVG + " " + mm + ":" + ss + "</span></div></div>";

    html += '<div class="drill-toolbar"><div class="drill-filters-grid">';
    html += '<select id="cbtExamSel" class="studio-select" aria-label="模擬試験を選択">';
    CBT_EXAMS.forEach((ex) => {
      html += '<option value="' + ex.id + '"' + (cbtState.examId === ex.id ? " selected" : "") + ">" + escapeHtml(ex.label) + "</option>";
    });
    html += "</select>";
    if (!cbtState.started) {
      html += '<button type="button" class="primary-btn" id="cbtStartBtn">試験を開始する (' + examMeta.mins + "分)</button>";
    } else {
      html += '<button type="button" class="mask-btn" id="cbtResetBtn">リセット</button>';
    }
    html += '<button type="button" class="mask-btn" id="cbtOpenFullDocBtn">模試全文・総合問題を見る</button>';
    html += "</div></div>";

    if (!cbtState.started && !cbtState.submitted) {
      html += '<div class="studio-card"><h3>' + escapeHtml(examMeta.label) + '</h3><p class="studio-sub">収録仕訳タスク：<strong>' + cards.length + "問</strong>。複数行の複合仕訳にも完全対応しています。開始ボタンを押すとカウントダウンが始まります。</p></div>";
      if (state.cbtHistory && state.cbtHistory.length > 0) {
        html += '<div class="studio-card"><h3>最近の模試受験履歴</h3>';
        state.cbtHistory.slice(0, 5).forEach((h) => {
          html += '<div class="list-action-row"><div><span class="meta-pill accent">' + escapeHtml(h.examId) + "</span> " + escapeHtml(h.label) + ' <span class="studio-sub">' + escapeHtml(h.date.slice(0, 10)) + "</span></div>" +
            '<span class="meta-pill ' + (h.pct >= 70 && !h.cutWarn ? "emerald-pill" : "amber") + '">' + h.score + "/" + h.total + " (" + h.pct + "%)</span></div>";
        });
        html += "</div>";
      }
      root.innerHTML = html;
      bindDojoTabBar(root);
      document.getElementById("cbtExamSel").onchange = (e) => {
        stopCbtTimer();
        cbtState.examId = e.target.value;
        const m = CBT_EXAMS.find((x) => x.id === cbtState.examId);
        cbtState.secLeft = (m ? m.mins : 60) * 60;
        cbtState.answers = {};
        cbtState.flagged = {};
        cbtState.qIdx = 0;
        cbtState.submitted = false;
        cbtState.wrongRegistered = false;
        renderCbtDojo(root);
      };
      document.getElementById("cbtOpenFullDocBtn").onclick = () => openDoc(cbtState.examId);
      document.getElementById("cbtStartBtn").onclick = () => {
        cbtState.started = true;
        cbtState.submitted = false;
        cbtState.wrongRegistered = false;
        cbtState.qIdx = 0;
        cbtState.secLeft = examMeta.mins * 60;
        stopCbtTimer();
        cbtState.timer = setInterval(() => {
          if (cbtState.secLeft > 0) cbtState.secLeft--;
          const p = document.getElementById("cbtClockPill");
          if (p) {
            const m2 = String(Math.floor(cbtState.secLeft / 60)).padStart(2, "0");
            const s2 = String(cbtState.secLeft % 60).padStart(2, "0");
            p.innerHTML = CLOCK_SVG + " " + m2 + ":" + s2;
          }
          if (cbtState.secLeft === 0) stopCbtTimer();
        }, 1000);
        renderCbtDojo(root);
      };
      return;
    }

    const subjectsList = DATA.subjects || [];
    html += '<datalist id="cbtSubjectsDatalist">';
    subjectsList.forEach((s) => { html += '<option value="' + escapeHtml(s) + '"></option>'; });
    html += "</datalist>";

    // Evaluate all cards using multi-row diagnoseJournalAnswer
    let score = 0;
    const secStats = {};
    const evalMap = {};
    const wrongCardIds = [];
    let answeredCnt = 0;
    let flaggedCnt = 0;

    cards.forEach((c) => {
      const rows = getCbtRows(c.id);
      if (isCbtCardAnswered(c.id)) answeredCnt++;
      if (cbtState.flagged[c.id]) flaggedCnt++;
      const diag = diagnoseJournalAnswer(rows, c.rows, { subjectsOnly: false });
      const ok = diag.status === "perfect";
      evalMap[c.id] = { ok, diag };
      if (!secStats[c.section]) secStats[c.section] = { total: 0, ok: 0 };
      secStats[c.section].total++;
      if (ok) { score++; secStats[c.section].ok++; }
      else wrongCardIds.push(c.id);
    });

    if (cbtState.submitted) {
      const pct = cards.length ? Math.round((score / cards.length) * 100) : 0;
      const cutWarn = Object.entries(secStats).some(([, st]) => st.total >= 3 && (st.ok / st.total) < 0.4);
      html += '<div class="studio-card grade-result-box ' + (pct >= 70 && !cutWarn ? "grade-perfect" : "grade-partial") + '">';
      html += "<h3>CBT採点結果：" + score + " / " + cards.length + " 問正解（" + pct + "%）</h3>";
      html += '<div class="kpi-grid">';
      html += '<div class="kpi-box"><div class="kpi-lbl">総合判定 (70%基準)</div><div class="kpi-val ' + (pct >= 70 ? "emerald-txt" : "danger-txt") + '">' + (pct >= 70 ? "合格圏" : "要強化") + "</div></div>";
      html += '<div class="kpi-box"><div class="kpi-lbl">40%足切り防衛</div><div class="kpi-val ' + (cutWarn ? "danger-txt" : "emerald-txt") + '">' + (cutWarn ? "40%未満セクションあり" : "全セクションクリア") + "</div></div>";
      html += '<div class="kpi-box"><div class="kpi-lbl">所要時間</div><div class="kpi-val">' + Math.floor(cbtState.lastElapsedSec / 60) + "分" + (cbtState.lastElapsedSec % 60) + "秒</div></div>";
      html += "</div>";
      Object.entries(secStats).forEach(([sec, st]) => {
        const sp = Math.round((st.ok / st.total) * 100);
        html += '<div class="list-action-row"><span>' + escapeHtml(sec) + '</span><span class="meta-pill ' + (sp < 40 ? "danger-pill" : "emerald-pill") + '">' + st.ok + " / " + st.total + " (" + sp + "%)</span></div>";
      });
      if (wrongCardIds.length > 0) {
        html += '<div style="margin-top:12px;">' +
          '<button type="button" class="primary-btn" id="cbtRegisterWrongBtn"' + (cbtState.wrongRegistered ? " disabled" : "") + ">" +
          (cbtState.wrongRegistered ? "今日の復習キューへ登録済み (" + wrongCardIds.length + "問)" : "間違えた問題（" + wrongCardIds.length + "問）を復習キューへ一括登録") +
          "</button></div>";
      }
      html += "</div>";
    }

    // Status & View Mode Strip + Q1..Qn Nav Strip
    html += '<div class="cbt-meta-bar">';
    html += '<div class="cbt-status-pills"><span class="meta-pill accent">回答済 ' + answeredCnt + " / " + cards.length + '</span><span class="meta-pill amber">見直し ' + flaggedCnt + "件</span></div>";
    html += '<div class="cbt-view-actions"><div class="mobile-seg-group">' +
      '<button type="button" class="mobile-seg-btn cbt-vmode-btn' + (cbtState.viewMode === "single" ? " active" : "") + '" data-vmode="single">1問集中</button>' +
      '<button type="button" class="mobile-seg-btn cbt-vmode-btn' + (cbtState.viewMode === "list" ? " active" : "") + '" data-vmode="list">全問一覧</button>' +
      "</div>" +
      '<button type="button" class="mask-btn' + (inlineCalcState.open ? " active" : "") + '" id="cbtInlineCalcBtn">' + INLINE_CALC_SVG + " 電卓</button>" +
      "</div></div>";

    html += renderInlineCalcHtml();

    html += '<div class="cbt-nav-strip" tabindex="0" role="navigation" aria-label="CBT問題ジャンプ">';
    cards.forEach((c, i) => {
      const isAct = cbtState.viewMode === "single" && i === cbtState.qIdx;
      const ansd = isCbtCardAnswered(c.id);
      const flg = !!cbtState.flagged[c.id];
      let cls = "cbt-q-pill";
      if (isAct) cls += " is-active";
      if (cbtState.submitted) cls += evalMap[c.id].ok ? " is-correct" : " is-wrong";
      else if (flg) cls += " is-flagged";
      else if (ansd) cls += " is-answered";
      html += '<button type="button" class="' + cls + '" data-cbt-jump="' + i + '">Q' + (i + 1) + "</button>";
    });
    html += "</div>";

    const renderSingleCbtCard = (c, idx) => {
      const rows = getCbtRows(c.id);
      const isFlag = !!cbtState.flagged[c.id];
      const ev = evalMap[c.id];
      let ch = '<div class="studio-card cbt-q-card">';
      ch += '<div class="drill-card-meta"><div><span class="meta-pill accent">Q' + (idx + 1) + '</span> <span class="meta-pill">' + escapeHtml(c.section) + "</span></div>" +
        '<button type="button" class="mask-btn cbt-flag-btn' + (isFlag ? " active" : "") + '" data-flag-cid="' + escapeHtml(c.id) + '">' + (isFlag ? "見直し中 ✓" : "見直しフラグ") + "</button></div>";
      ch += '<div class="focus-text" style="margin-bottom:10px;">' + formatInlineMd(c.focusLine || c.questionBody) + "</div>";
      ch += '<div class="table-wrap" tabindex="0"><table class="journal-table drill-input-table"><thead><tr><th>借方科目</th><th class="num">借方金額</th><th>貸方科目</th><th class="num">貸方金額</th><th style="width:40px;"><span class="sr-only">操作</span></th></tr></thead><tbody>';
      rows.forEach((r, rIdx) => {
        ch += "<tr>" +
          '<td data-label="借方科目"><input type="text" class="drill-cell-input cbt-inp" list="cbtSubjectsDatalist" data-cid="' + escapeHtml(c.id) + '" data-row="' + rIdx + '" data-fld="dSub" aria-label="Q' + (idx + 1) + ' 行' + (rIdx + 1) + ' 借方科目" value="' + escapeHtml(r.dSub) + '" placeholder="借方科目..." /></td>' +
          '<td data-label="借方金額"><input type="text" inputmode="numeric" class="drill-cell-input num cbt-inp" data-cid="' + escapeHtml(c.id) + '" data-row="' + rIdx + '" data-fld="dAmt" aria-label="Q' + (idx + 1) + ' 行' + (rIdx + 1) + ' 借方金額" value="' + escapeHtml(r.dAmt) + '" placeholder="0" /></td>' +
          '<td data-label="貸方科目"><input type="text" class="drill-cell-input cbt-inp" list="cbtSubjectsDatalist" data-cid="' + escapeHtml(c.id) + '" data-row="' + rIdx + '" data-fld="cSub" aria-label="Q' + (idx + 1) + ' 行' + (rIdx + 1) + ' 貸方科目" value="' + escapeHtml(r.cSub) + '" placeholder="貸方科目..." /></td>' +
          '<td data-label="貸方金額"><input type="text" inputmode="numeric" class="drill-cell-input num cbt-inp" data-cid="' + escapeHtml(c.id) + '" data-row="' + rIdx + '" data-fld="cAmt" aria-label="Q' + (idx + 1) + ' 行' + (rIdx + 1) + ' 貸方金額" value="' + escapeHtml(r.cAmt) + '" placeholder="0" /></td>' +
          '<td class="del-cell">' + (rows.length > 1 ? '<button type="button" class="row-del-btn cbt-del-row" data-cid="' + escapeHtml(c.id) + '" data-row="' + rIdx + '" aria-label="行を削除">✕</button>' : "") + "</td>" +
          "</tr>";
      });
      ch += "</tbody></table></div>";
      if (!cbtState.submitted) {
        ch += '<div class="amt-quick-bar" style="margin-top:8px;">' +
          '<button type="button" class="mask-btn cbt-add-row" data-cid="' + escapeHtml(c.id) + '">＋ 行を追加</button>' +
          '<button type="button" class="mask-btn cbt-bal-fill" data-cid="' + escapeHtml(c.id) + '">差額補完</button>' +
          "</div>";
      }
      if (cbtState.submitted) {
        ch += '<div class="grade-result-box ' + (ev.ok ? "grade-perfect" : "grade-wrong") + '" style="margin-top:10px;">';
        ch += '<div class="grade-msg">' + (ev.ok ? "正解" : "不正解 — 模範仕訳") + "</div>";
        if (!ev.ok) {
          ch += '<div class="table-wrap" tabindex="0"><table class="journal-table drill-table"><thead><tr><th>借方科目</th><th class="num">借方金額</th><th>貸方科目</th><th class="num">貸方金額</th></tr></thead><tbody>';
          c.rows.forEach((mr) => {
            ch += "<tr><td>" + escapeHtml(mr.dSub) + '</td><td class="num">' + escapeHtml(mr.dAmt) + "</td><td>" + escapeHtml(mr.cSub) + '</td><td class="num">' + escapeHtml(mr.cAmt) + "</td></tr>";
          });
          ch += "</tbody></table></div>";
        }
        ch += "</div>";
      }
      ch += "</div>";
      return ch;
    };

    if (cbtState.viewMode === "single" && cards[cbtState.qIdx]) {
      html += renderSingleCbtCard(cards[cbtState.qIdx], cbtState.qIdx);
      html += '<div class="cbt-single-nav">' +
        '<button type="button" class="mask-btn" id="cbtPrevQBtn"' + (cbtState.qIdx <= 0 ? " disabled" : "") + ">← 前の問題</button>" +
        '<button type="button" class="mask-btn" id="cbtNextQBtn"' + (cbtState.qIdx >= cards.length - 1 ? " disabled" : "") + ">次の問題 →</button>" +
        "</div>";
    } else {
      cards.forEach((c, idx) => { html += renderSingleCbtCard(c, idx); });
    }

    if (!cbtState.submitted) {
      html += '<div style="margin:16px 0;"><button type="button" class="primary-btn" id="cbtSubmitBtn">模試を提出して一括採点する</button></div>';
    }

    root.innerHTML = html;
    bindDojoTabBar(root);

    document.getElementById("cbtExamSel").onchange = (e) => {
      stopCbtTimer();
      cbtState.examId = e.target.value;
      cbtState.started = false;
      cbtState.submitted = false;
      cbtState.wrongRegistered = false;
      cbtState.answers = {};
      cbtState.flagged = {};
      cbtState.qIdx = 0;
      const m = CBT_EXAMS.find((x) => x.id === cbtState.examId);
      cbtState.secLeft = (m ? m.mins : 60) * 60;
      renderCbtDojo(root);
    };
    const rBtn = document.getElementById("cbtResetBtn");
    if (rBtn) rBtn.onclick = () => {
      stopCbtTimer();
      cbtState.started = false;
      cbtState.submitted = false;
      cbtState.wrongRegistered = false;
      cbtState.answers = {};
      cbtState.flagged = {};
      cbtState.qIdx = 0;
      cbtState.secLeft = examMeta.mins * 60;
      renderCbtDojo(root);
    };
    document.getElementById("cbtOpenFullDocBtn").onclick = () => openDoc(cbtState.examId);

    root.querySelectorAll(".cbt-vmode-btn").forEach((b) => {
      b.onclick = () => {
        cbtState.viewMode = b.dataset.vmode;
        state.prefs.cbtView = cbtState.viewMode;
        saveState();
        renderCbtDojo(root);
      };
    });
    const icBtn = document.getElementById("cbtInlineCalcBtn");
    if (icBtn) icBtn.onclick = () => { inlineCalcState.open = !inlineCalcState.open; renderCbtDojo(root); };
    bindInlineCalc(root, (val) => {
      const curCard = cards[cbtState.qIdx];
      if (!curCard) return;
      const rows = getCbtRows(curCard.id);
      const fa = cbtState.focusedAmt[curCard.id] || { row: 0, field: "dAmt" };
      const r = Math.min(fa.row, rows.length - 1);
      rows[r][fa.field === "cAmt" ? "cAmt" : "dAmt"] = String(Math.round(val));
      renderCbtDojo(root);
    });

    root.querySelectorAll("[data-cbt-jump]").forEach((b) => {
      b.onclick = () => {
        cbtState.qIdx = Number(b.dataset.cbtJump);
        if (cbtState.viewMode !== "single") cbtState.viewMode = "single";
        renderCbtDojo(root);
      };
    });
    const pQb = document.getElementById("cbtPrevQBtn");
    if (pQb) pQb.onclick = () => { if (cbtState.qIdx > 0) { cbtState.qIdx--; renderCbtDojo(root); } };
    const nQb = document.getElementById("cbtNextQBtn");
    if (nQb) nQb.onclick = () => { if (cbtState.qIdx < cards.length - 1) { cbtState.qIdx++; renderCbtDojo(root); } };

    root.querySelectorAll(".cbt-flag-btn").forEach((b) => {
      b.onclick = () => {
        const cid = b.dataset.flagCid;
        cbtState.flagged[cid] = !cbtState.flagged[cid];
        renderCbtDojo(root);
      };
    });
    root.querySelectorAll(".cbt-add-row").forEach((b) => {
      b.onclick = () => {
        getCbtRows(b.dataset.cid).push({ dSub: "", dAmt: "", cSub: "", cAmt: "" });
        renderCbtDojo(root);
      };
    });
    root.querySelectorAll(".cbt-del-row").forEach((b) => {
      b.onclick = () => {
        const rows = getCbtRows(b.dataset.cid);
        rows.splice(Number(b.dataset.row), 1);
        renderCbtDojo(root);
      };
    });
    root.querySelectorAll(".cbt-bal-fill").forEach((b) => {
      b.onclick = () => {
        const cid = b.dataset.cid;
        if (applyBalanceFillToRows(getCbtRows(cid), cbtState.focusedAmt[cid])) renderCbtDojo(root);
      };
    });
    root.querySelectorAll(".cbt-inp").forEach((inp) => {
      const cid = inp.dataset.cid;
      const rIdx = Number(inp.dataset.row);
      const fld = inp.dataset.fld;
      inp.onfocus = () => {
        if (fld === "dAmt" || fld === "cAmt") cbtState.focusedAmt[cid] = { row: rIdx, field: fld };
      };
      inp.oninput = () => {
        const rows = getCbtRows(cid);
        rows[rIdx][fld] = inp.value;
      };
    });

    const subBtn = document.getElementById("cbtSubmitBtn");
    if (subBtn) {
      subBtn.onclick = () => {
        stopCbtTimer();
        cbtState.started = false;
        cbtState.submitted = true;
        cbtState.lastElapsedSec = Math.max(0, examMeta.mins * 60 - cbtState.secLeft);
        const pct = cards.length ? Math.round((score / cards.length) * 100) : 0;
        const cutWarn = Object.entries(secStats).some(([, st]) => st.total >= 3 && (st.ok / st.total) < 0.4);
        state.cbtHistory.unshift({
          id: "CBT-" + Date.now(),
          examId: examMeta.id,
          label: examMeta.label,
          date: new Date().toISOString(),
          score,
          total: cards.length,
          pct,
          cutWarn,
          elapsedSec: cbtState.lastElapsedSec
        });
        state.cbtHistory = state.cbtHistory.slice(0, 30);
        recordStudyActivity("cbt");
        saveState();
        renderCbtDojo(root);
        window.scrollTo({ top: 0, behavior: "smooth" });
      };
    }

    const regBtn = document.getElementById("cbtRegisterWrongBtn");
    if (regBtn) {
      regBtn.onclick = () => {
        wrongCardIds.forEach((cid) => {
          recordSrsReview(cid, 0);
          bumpMistakeCount(cid);
        });
        cbtState.wrongRegistered = true;
        renderCbtDojo(root);
      };
    }
  }

  /* Global Keyboard Shortcuts for Active Dojo Tab */
  document.addEventListener("keydown", (e) => {
    if (studio.getStudioMode() !== "drill" || e.isComposing) return;
    const tag = document.activeElement ? document.activeElement.tagName : "";
    const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
    if (isTyping) return;

    const tab = drillState.dojoTab;
    if (tab === "journal" && !drillState.sessionSummary) {
      const card = drillState.deck[drillState.idx];
      if (!card) return;
      if (drillState.mode === "flash") {
        if (e.code === "Space") {
          e.preventDefault();
          drillState.revealStep = drillState.revealStep >= 2 ? 0 : drillState.revealStep + 1;
          renderDrillView();
          return;
        }
        if (["1", "2", "3", "4"].includes(e.key)) {
          const q = Number(e.key) - 1;
          const elapsed = Math.round((Date.now() - drillState.cardStartedAt) / 1000);
          recordSrsReview(card.id, q, elapsed);
          if (q === 0) bumpMistakeCount(card.id);
          advanceDrillCard(1, { cardId: card.id, type: "journal", ok: q >= 2, sec: elapsed });
          return;
        }
      } else {
        if (e.key.toLowerCase() === "h") {
          drillState.hintLevel = drillState.hintLevel >= 3 ? 0 : drillState.hintLevel + 1;
          renderDrillView();
          return;
        }
        if (e.key.toLowerCase() === "c" && drillState.mode === "input") {
          inlineCalcState.open = !inlineCalcState.open;
          renderDrillView();
          return;
        }
        if (e.key.toLowerCase() === "d" && drillState.mode === "input") {
          if (applyBalanceFillToRows(drillState.inputRows, drillState.lastFocusedAmtCell)) renderDrillView();
          return;
        }
        if (drillState.gradeResult && ["1", "2", "3", "4"].includes(e.key)) {
          const q = Number(e.key) - 1;
          const elapsed = Math.round((Date.now() - drillState.cardStartedAt) / 1000);
          recordSrsReview(card.id, q, elapsed);
          if (q === 0) bumpMistakeCount(card.id);
          advanceDrillCard(1, { cardId: card.id, type: "journal", ok: q >= 2, sec: elapsed });
          return;
        }
        if (e.key === "Enter" && drillState.gradeResult) {
          const elapsed = Math.round((Date.now() - drillState.cardStartedAt) / 1000);
          const q = typeof drillState.autoAppliedQuality === "number" ? drillState.autoAppliedQuality : 2;
          advanceDrillCard(1, { cardId: card.id, type: "journal", ok: q >= 2, sec: elapsed });
          return;
        }
      }
      if (e.key === "ArrowRight" && drillState.deck.length > 0) advanceDrillCard(1, null);
      else if (e.key === "ArrowLeft" && drillState.deck.length > 0) advanceDrillCard(-1, null);
    } else if (tab === "theory" && !theoryDojoState.sessionSummary) {
      const root = document.getElementById("drillView");
      const item = theoryDojoState.deck[theoryDojoState.idx];
      if (!item || !root) return;
      if (theoryDojoState.mode === "choice") {
        if (theoryDojoState.pickedIdx < 0 && ["1", "2", "3", "4"].includes(e.key)) {
          const btn = root.querySelector('.theory-choice-btn[data-cidx="' + (Number(e.key) - 1) + '"]');
          if (btn) btn.click();
        } else if (theoryDojoState.pickedIdx >= 0 && ["1", "2", "3", "4"].includes(e.key)) {
          const sm = root.querySelector('[data-sm2-q="' + (Number(e.key) - 1) + '"]');
          if (sm) sm.click();
        } else if (theoryDojoState.pickedIdx >= 0 && e.key === "Enter") {
          document.getElementById("theoryAfterNextBtn")?.click();
        }
      } else {
        if (!theoryDojoState.revealed && (e.code === "Space" || e.key === "Enter")) {
          e.preventDefault();
          theoryDojoState.revealed = true;
          renderTheoryDojo(root);
        } else if (theoryDojoState.revealed && ["1", "2", "3", "4"].includes(e.key)) {
          const sm = root.querySelector('[data-sm2-q="' + (Number(e.key) - 1) + '"]');
          if (sm) sm.click();
        }
      }
    } else if (tab === "calc" && !calcDojoState.sessionSummary) {
      const root = document.getElementById("drillView");
      if (!root) return;
      if (calcDojoState.result && ["1", "2", "3", "4"].includes(e.key)) {
        const sm = root.querySelector('[data-sm2-q="' + (Number(e.key) - 1) + '"]');
        if (sm) sm.click();
      } else if (calcDojoState.result && e.key === "Enter") {
        document.getElementById("calcAfterNextBtn")?.click();
      }
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
      "<div><h2>会計・原価計算 5大インタラクティブ・シミュレータ</h2>" +
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
        '<line x1="' + pL + '" y1="' + pT + '" x2="' + pL + '" y2="' + (H - pB) + '" stroke="currentColor" opacity="0.35"/>' +
        '<line x1="' + pL + '" y1="' + (H - pB) + '" x2="' + (W - pR) + '" y2="' + (H - pB) + '" stroke="currentColor" opacity="0.35"/>' +
        '<line x1="' + pL + '" y1="' + sy(fix) + '" x2="' + sx(maxX) + '" y2="' + sy(fix) + '" stroke="var(--border-strong)" stroke-dasharray="4,4"/>' +
        '<line x1="' + pL + '" y1="' + sy(fix) + '" x2="' + sx(maxX) + '" y2="' + sy(fix + varR * maxX) + '" stroke="var(--accent)" stroke-width="2.2"/>' +
        '<line x1="' + pL + '" y1="' + sy(0) + '" x2="' + sx(maxX) + '" y2="' + sy(stdR * maxX) + '" stroke="var(--emerald)" stroke-width="2.2"/>' +
        '<line x1="' + sx(actH) + '" y1="' + sy(0) + '" x2="' + sx(actH) + '" y2="' + sy(Math.max(actC, budAllow, applied)) + '" stroke="var(--amber)" stroke-dasharray="3,3"/>' +
        '<line x1="' + sx(base) + '" y1="' + sy(0) + '" x2="' + sx(base) + '" y2="' + sy(fix + varR * base) + '" stroke="var(--text-muted)" stroke-dasharray="3,3"/>' +
        '<circle cx="' + sx(actH) + '" cy="' + sy(actC) + '" r="4.5" fill="var(--vermilion)"/>' +
        '<circle cx="' + sx(actH) + '" cy="' + sy(budAllow) + '" r="4" fill="var(--accent)"/>' +
        '<circle cx="' + sx(actH) + '" cy="' + sy(applied) + '" r="4" fill="var(--emerald)"/>' +
        '<text x="' + (sx(actH) + 6) + '" y="' + (sy(actC) - 4) + '" font-size="11" fill="var(--vermilion)">実際発生</text>' +
        '<text x="' + (sx(actH) + 6) + '" y="' + (sy(budAllow) - 4) + '" font-size="11" fill="var(--accent)">予算許容</text>' +
        '<text x="' + (sx(actH) + 6) + '" y="' + (sy(applied) + 12) + '" font-size="11" fill="var(--emerald)">予定配賦</text>' +
        '<text x="' + sx(base) + '" y="' + (H - 12) + '" font-size="10" text-anchor="middle" fill="currentColor">基準 ' + base + 'h</text>' +
        '<text x="' + sx(actH) + '" y="' + (H - 2) + '" font-size="10" text-anchor="middle" fill="var(--amber)">実際 ' + actH + 'h</text>' +
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
          '<circle cx="' + sx(bepQ) + '" cy="' + sy(bepS) + '" r="4.5" fill="var(--amber)"/>' +
          '<text x="' + (sx(bepQ) + 6) + '" y="' + (sy(bepS) - 6) + '" font-size="11" fill="var(--amber)">BEP ' + Math.round(bepQ) + "個</text>";
      }

      document.getElementById("cvpSvg").innerHTML =
        '<svg viewBox="0 0 ' + W + " " + H + '" class="sim-svg">' +
        '<line x1="' + pL + '" y1="' + pT + '" x2="' + pL + '" y2="' + (H - pB) + '" stroke="currentColor" opacity="0.35"/>' +
        '<line x1="' + pL + '" y1="' + (H - pB) + '" x2="' + (W - pR) + '" y2="' + (H - pB) + '" stroke="currentColor" opacity="0.35"/>' +
        '<line x1="' + pL + '" y1="' + sy(f) + '" x2="' + sx(maxQ) + '" y2="' + sy(f) + '" stroke="var(--border-strong)" stroke-dasharray="4,4"/>' +
        '<line x1="' + pL + '" y1="' + sy(f) + '" x2="' + sx(maxQ) + '" y2="' + sy(f + v * maxQ) + '" stroke="var(--vermilion)" stroke-width="2.2"/>' +
        '<line x1="' + pL + '" y1="' + sy(0) + '" x2="' + sx(maxQ) + '" y2="' + sy(p * maxQ) + '" stroke="var(--emerald)" stroke-width="2.2"/>' +
        '<line x1="' + sx(q) + '" y1="' + sy(0) + '" x2="' + sx(q) + '" y2="' + sy(Math.max(sales, totalC)) + '" stroke="var(--accent)" stroke-dasharray="3,3"/>' +
        bepMark +
        '<text x="' + (W - 75) + '" y="' + (sy(p * maxQ) + 12) + '" font-size="11" fill="var(--emerald)">売上高線</text>' +
        '<text x="' + (W - 75) + '" y="' + (sy(f + v * maxQ) + 12) + '" font-size="11" fill="var(--vermilion)">総原価線</text>' +
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
        '<line x1="' + pL + '" y1="' + sy(0) + '" x2="' + (W - pR) + '" y2="' + sy(0) + '" stroke="currentColor" stroke-dasharray="4,4" opacity="0.4"/>' +
        '<polyline fill="none" stroke="var(--accent)" stroke-width="2.2" points="' + poly + '"/>' +
        cumPoints.map((y, i) => '<circle cx="' + sx(i) + '" cy="' + sy(y) + '" r="4" fill="' + (y >= 0 ? "var(--emerald)" : "var(--vermilion)") + '"/><text x="' + sx(i) + '" y="' + (H - 8) + '" font-size="10" text-anchor="middle" fill="currentColor">T=' + i + "</text>").join("") +
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
        bars += '<rect x="' + x0 + '" y="' + sy(slList[i]) + '" width="' + bw + '" height="' + (H - pB - sy(slList[i])) + '" fill="var(--emerald)"/>';
        bars += '<rect x="' + (x0 + bw + 2) + '" y="' + sy(dbList[i]) + '" width="' + bw + '" height="' + (H - pB - sy(dbList[i])) + '" fill="var(--accent)"/>';
        bars += '<text x="' + (x0 + bw) + '" y="' + (H - 8) + '" font-size="10" text-anchor="middle" fill="currentColor">' + (i + 1) + "年</text>";
      }

      document.getElementById("depSvg").innerHTML =
        '<svg viewBox="0 0 ' + W + " " + H + '" class="sim-svg">' +
        '<line x1="' + pL + '" y1="' + (H - pB) + '" x2="' + (W - pR) + '" y2="' + (H - pB) + '" stroke="currentColor" opacity="0.35"/>' +
        bars +
        '<text x="' + (W - 140) + '" y="14" font-size="10" fill="var(--emerald)">■ 定額法</text>' +
        '<text x="' + (W - 75) + '" y="14" font-size="10" fill="var(--accent)">■ 200%定率法</text>' +
        "</svg>";

      document.getElementById("depTbl").innerHTML =
        '<div class="table-wrap" tabindex="0"><table><thead><tr><th>年度</th><th class="num">定額法償却</th><th class="num">定額法簿価</th><th class="num">定率法償却</th><th class="num">定率法簿価</th></tr></thead><tbody>' +
        rows + "</tbody></table></div>";
    };
    body.querySelectorAll("input").forEach((inp) => (inp.oninput = update));
    update();
  }

  /* =========================================================================
   * 3. LEARNING ANALYTICS DASHBOARD (学習分析)
   * ========================================================================= */
  function build28DayHeatmapSvg() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cells = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const key = getTodayKey(d);
      const row = state.studyLog && state.studyLog[key];
      const cnt = row ? (row.reviews || 0) + (row.units || 0) + (row.cbt || 0) : 0;
      cells.push({ key, cnt, col: Math.floor((27 - i) / 7), rowIdx: (27 - i) % 7 });
    }
    const maxCnt = Math.max(1, ...cells.map((c) => c.cnt));
    const size = 20;
    const gap = 4;
    const W = 4 * (size + gap) + 4;
    const H = 7 * (size + gap) + 4;
    let rects = "";
    cells.forEach((c) => {
      const x = 2 + c.col * (size + gap);
      const y = 2 + c.rowIdx * (size + gap);
      let fill = "var(--surface-alt)";
      if (c.cnt > 0) {
        const ratio = c.cnt / maxCnt;
        fill = ratio >= 0.7 ? "var(--accent)" : ratio >= 0.35 ? "var(--emerald)" : "var(--emerald-soft)";
      }
      rects += '<rect x="' + x + '" y="' + y + '" width="' + size + '" height="' + size + '" rx="3" fill="' + fill + '" stroke="var(--border)" stroke-width="1"><title>' + escapeHtml(c.key + ": " + c.cnt + "件") + "</title></rect>";
    });
    return '<svg class="heatmap-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="過去28日間の学習ヒートマップ">' + rects + "</svg>";
  }

  function renderAnalyticsView() {
    const root = document.getElementById("analyticsView");
    if (!root) return;

    const units = DATA.items.filter((it) => it.part !== "guide");
    const masteredUnits = units.filter(isDocMastered);
    const allDrills = DATA.drills || [];
    const allCalc = DATA.calcDrills || [];
    const allTheory = DATA.theoryDrills || [];
    const allAll = [].concat(allDrills, allCalc, allTheory);
    const masteredAll = allAll.filter((c) => state.srs[c.id] && state.srs[c.id].level >= 2);
    const dueSum = getDueSummary();
    const streak = getStreakDays();
    const todayRow = state.studyLog[getTodayKey()] || { reviews: 0, correct: 0, units: 0, cbt: 0 };

    let totalStamps = 0;
    units.forEach((u) => {
      const r = state.reviews[u.id] || {};
      ["day0", "day1", "day7", "day21"].forEach((k) => { if (r[k]) totalStamps++; });
    });

    // Weak units in SRS
    const weakMap = {};
    allDrills.forEach((c) => {
      if (isCardLeech(c.id)) weakMap[c.docId] = (weakMap[c.docId] || 0) + 1;
    });
    const weakUnits = Object.keys(weakMap)
      .map((id) => ({ doc: DATA.items.find((x) => x.id === id), cnt: weakMap[id] }))
      .filter((x) => x.doc)
      .sort((a, b) => b.cnt - a.cnt)
      .slice(0, 8);

    // Mistake reason breakdown
    const reasonTotals = {};
    MISTAKE_REASONS.forEach((r) => { reasonTotals[r] = 0; });
    Object.values(state.mistakes || {}).forEach((m) => {
      if (m && Array.isArray(m.reasons)) {
        m.reasons.forEach((r) => {
          if (reasonTotals[r] !== undefined) reasonTotals[r]++;
        });
      }
    });
    const maxReason = Math.max(1, ...Object.values(reasonTotals));

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
      "<div><h2>学習アナリティクス＆復習ダッシュボード</h2>" +
      '<p class="studio-sub">全単元の習得率、全546問のSM-2定着状況、28日継続ログ、誤答原因、CBT模試推移を可視化します。</p></div>' +
      '<button type="button" class="primary-btn" id="analyticsGoTodayBtn">今日の復習へ (' + dueSum.totalDue + "件)</button></div>";

    html +=
      '<div class="kpi-grid">' +
      '<div class="kpi-box"><div class="kpi-lbl">総合単元習得率</div><div class="kpi-val accent">' + Math.round((masteredUnits.length / Math.max(1, units.length)) * 100) + "% (" + masteredUnits.length + "/" + units.length + ")</div></div>" +
      '<div class="kpi-box"><div class="kpi-lbl">全道場マスター</div><div class="kpi-val emerald-txt">' + masteredAll.length + " / " + allAll.length + "問</div></div>" +
      '<div class="kpi-box"><div class="kpi-lbl">今日の復習待ち</div><div class="kpi-val amber-txt">' + dueSum.totalDue + "件</div></div>" +
      '<div class="kpi-box"><div class="kpi-lbl">連続学習 / 本日</div><div class="kpi-val">' + streak + "日 / " + (todayRow.reviews || 0) + "問</div></div>" +
      "</div>";

    html += '<div class="analytics-two-col">';
    html += '<div class="studio-card"><h3>過去28日間の学習ヒートマップ</h3>' +
      '<p class="studio-sub" style="margin-bottom:10px;">分散復習スタンプ合計：<strong>' + totalStamps + "回</strong> ／ 連続学習：<strong>" + streak + "日</strong></p>" +
      '<div class="heatmap-wrap">' + build28DayHeatmapSvg() + "</div></div>";

    html += '<div class="studio-card"><h3>誤答原因 5分類バランス</h3>';
    MISTAKE_REASONS.forEach((r) => {
      const cnt = reasonTotals[r] || 0;
      const pct = Math.round((cnt / maxReason) * 100);
      html +=
        '<div class="bar-row"><div class="bar-label"><span>' + escapeHtml(r) + "</span><span>" + cnt + '件</span></div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>';
    });
    html += '<button type="button" class="mask-btn" id="analyticsOpenMistakesBtn" style="margin-top:6px;">間違いノートで特訓する</button></div>';
    html += "</div>";

    html += '<div class="analytics-two-col">';
    html += '<div class="studio-card"><h3>級別・パート別 進捗</h3>' + makeBars(DATA.parts, (it, g) => it.part === g.id) + "</div>";
    html += '<div class="studio-card"><h3>貫通ライン別（Line A〜F）マスター度</h3>' + makeBars(DATA.lines, (it, g) => it.line.includes(g.id)) + "</div>";
    html += "</div>";

    html += '<div class="analytics-two-col">';
    html += '<div class="studio-card"><h3>分散復習リマインダー（単元）</h3>';
    if (dueSum.dueUnits.length === 0) {
      html += '<p class="studio-sub">現在期限到来中の単元はありません。各単元の「Day 0」を記録すると Day 1 / Day 7 / Day 21 が予約されます。</p>';
    } else {
      dueSum.dueUnits.slice(0, 10).forEach((rem) => {
        html +=
          '<div class="list-action-row"><div><span class="meta-pill accent">' + escapeHtml(rem.doc.id) + "</span> " +
          escapeHtml(rem.doc.title) + ' <span class="meta-pill danger-pill">' + escapeHtml(rem.status.nextLabel) + " (" + rem.status.daysElapsed + "日経過)</span></div>" +
          '<button type="button" class="mask-btn jump-doc-btn" data-doc="' + escapeHtml(rem.doc.id) + '">復習する</button></div>';
      });
    }
    html += "</div>";

    html += '<div class="studio-card"><h3>CBT模試スコア推移 ＆ 弱点単元</h3>';
    if (state.cbtHistory && state.cbtHistory.length > 0) {
      state.cbtHistory.slice(0, 5).forEach((h) => {
        html += '<div class="list-action-row"><div><span class="meta-pill accent">' + escapeHtml(h.examId) + "</span> " + escapeHtml(h.label) + '</div><span class="meta-pill ' + (h.pct >= 70 && !h.cutWarn ? "emerald-pill" : "amber") + '">' + h.score + "/" + h.total + " (" + h.pct + "%)</span></div>";
      });
    }
    if (weakUnits.length === 0) {
      html += '<p class="studio-sub" style="margin-top:8px;">道場で「要復習（鬼門）」に分類された単元はありません。</p>';
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
    document.getElementById("analyticsGoTodayBtn").onclick = () => window.BokiStudioTools.openTodayReview("queue");
    document.getElementById("analyticsOpenMistakesBtn").onclick = () => window.BokiStudioTools.openTodayReview("mistakes");
    root.querySelectorAll(".jump-doc-btn").forEach((b) => {
      b.onclick = () => openDoc(b.dataset.doc);
    });
    root.querySelectorAll(".jump-weak-drill-btn").forEach((b) => {
      b.onclick = () => {
        drillState.dojoTab = "journal";
        drillState.hasInitializedTab = true;
        drillState.part = "all";
        drillState.queueMode = "leech";
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
        '<button type="button" class="mask-btn cheat-open-doc" data-doc="' + escapeHtml(tbl.docId) + '">全文で読む</button>' +
        '</div>' +
        '<div class="cheat-table-wrap" tabindex="0"><table class="cheat-table"><thead><tr>' +
        '<th class="pin-col"><span class="sr-only">ピン留め</span>★</th>' +
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
          const colLabel = tbl.headers[cIdx] || "";
          const cellRoleCls = cIdx < visibleColLimit ? "cheat-key-cell" : "cheat-val-cell";
          const isTarget = cIdx >= visibleColLimit && cell.trim() !== "" && cell.trim() !== "—";
          if (isTarget && cheatState.redSheet) {
            const revCls = cheatState.tempRevealAll ? " revealed" : "";
            html += '<td class="' + cellRoleCls + '" data-col-label="' + escapeHtml(colLabel) + '"><span class="cheat-mask' + revCls + '" tabindex="0" role="button" title="クリックで開示／再隠蔽">' + formatInlineCheat(cell) + "</span></td>";
          } else {
            html += '<td class="' + cellRoleCls + '" data-col-label="' + escapeHtml(colLabel) + '">' + formatInlineCheat(cell) + "</td>";
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
      .concat([{ id: "pinned", label: "ピン留め (" + pinCount + ")" }]);

    if (!preserveInputFocus || !document.getElementById("cheatResults")) {
      let html =
        '<div class="studio-shell">' +
        '<div class="studio-header"><div>' +
        '<h2>本質チートシート＆赤シート暗記スタジオ</h2>' +
        '<p class="studio-sub">Part VII（CS-01〜CS-06）の全基準比較・仕訳トリガー・工簿公式・理論80語・罠を横断検索。赤シートONで答えのセルをタップ開示できます。</p>' +
        "</div>" +
        '<div class="cheat-top-actions">' +
        '<button type="button" id="cheatRedToggleBtn" class="tool-btn' + (cheatState.redSheet ? " active" : "") + '">' +
        (cheatState.redSheet ? "赤シート ON" : "赤シート OFF") +
        "</button>" +
        '<button type="button" id="cheatRevealAllBtn" class="mask-btn"' + (!cheatState.redSheet ? " disabled" : "") + ">" +
        (cheatState.tempRevealAll ? "すべて再隠蔽" : "すべて一時開示") +
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
      if (pinTab) pinTab.textContent = "ピン留め (" + pinCount + ")";
    }

    renderCheatResults();
  }

  const pastExamState = {
    filter: "l1",
    query: ""
  };

  function buildPastPassRateChartSvg(statsL1) {
    const rows = (statsL1 || [])
      .filter((r) => Array.isArray(r) && r.length >= 5)
      .map((r) => ({
        examNo: parseInt(String(r[0]), 10),
        rate: parseFloat(String(r[4]).replace(/[％%]/g, ""))
      }))
      .filter((r) => !Number.isNaN(r.examNo) && !Number.isNaN(r.rate))
      .sort((a, b) => a.examNo - b.examNo);
    if (!rows.length) return "";

    const W = 640;
    const H = 132;
    const padL = 34;
    const padR = 16;
    const padT = 18;
    const padB = 26;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const maxRate = Math.max(24, Math.ceil(Math.max(...rows.map((r) => r.rate)) / 5) * 5);

    const pts = rows.map((r, idx) => {
      const x = rows.length === 1 ? padL + innerW / 2 : padL + (idx / (rows.length - 1)) * innerW;
      const y = padT + innerH - (r.rate / maxRate) * innerH;
      return { examNo: r.examNo, rate: r.rate, x, y };
    });

    const y10 = padT + innerH - (10 / maxRate) * innerH;
    const polyPoints = pts.map((p) => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");

    let svg = '<svg class="past-chart-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="日商簿記1級 合格率推移">';
    svg += '<line x1="' + padL + '" y1="' + y10.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y10.toFixed(1) + '" stroke="var(--border-strong)" stroke-dasharray="4 4" stroke-width="1" />';
    svg += '<text x="4" y="' + (y10 + 3).toFixed(1) + '" font-size="10" fill="var(--text-muted)">10%</text>';
    svg += '<polyline fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" points="' + polyPoints + '" />';

    pts.forEach((p, idx) => {
      const showLabel = idx === 0 || idx === pts.length - 1 || idx % 2 === 0;
      svg += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.4" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"><title>第' + p.examNo + "回: " + p.rate.toFixed(1) + "%</title></circle>";
      if (showLabel) {
        svg += '<text x="' + p.x.toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle" font-size="10" fill="var(--text-muted)">' + p.examNo + "</text>";
      }
      if (idx === 0 || idx === pts.length - 1 || p.rate >= 15 || p.rate <= 8.5) {
        svg += '<text x="' + p.x.toFixed(1) + '" y="' + Math.max(12, p.y - 7).toFixed(1) + '" text-anchor="middle" font-size="10" font-weight="600" fill="var(--text)">' + p.rate.toFixed(1) + "%</text>";
      }
    });

    svg += "</svg>";
    return svg;
  }

  function renderPastExamArchive(root, preserveShell) {
    const pe = DATA.pastExams || {};
    const l1List = pe.level1Exams || [];
    const l2List = pe.level2Samples || [];
    const l3List = pe.level3Samples || [];
    const doneMap = state.pastExamDone || {};
    const doneCount = Object.keys(doneMap).filter((k) => doneMap[k]).length;

    const subjectDefs = [
      { key: "commercial", label: "商業簿記" },
      { key: "accounting", label: "会計学" },
      { key: "industrial", label: "工業簿記" },
      { key: "costing", label: "原価計算" }
    ];

    function renderPastExamBody() {
      const bodyEl = document.getElementById("pastExamBody");
      const doneKpiEl = document.getElementById("pastDoneKpiVal");
      const doneSumEl = document.getElementById("pastDoneSummaryVal");
      const curDone = Object.keys(state.pastExamDone || {}).filter((k) => state.pastExamDone[k]).length;
      if (doneKpiEl) doneKpiEl.textContent = curDone + "件";
      if (doneSumEl) doneSumEl.textContent = curDone + "件";
      if (!bodyEl) return;

      const q = (pastExamState.query || "").trim().toLowerCase();
      const filter = pastExamState.filter;
      const curDoneMap = state.pastExamDone || {};
      let html = "";

      if (filter === "l1") {
        const matched = l1List.filter((ex) => {
          if (!q) return true;
          const hay = [
            "第" + ex.examNo + "回",
            String(ex.examNo),
            ex.date || "",
            ex.examinerTakeaway || "",
            ex.note2027 || "",
            ...subjectDefs.flatMap((sd) => {
              const s = (ex.subjects && ex.subjects[sd.key]) || {};
              return [sd.label, s.summary || "", ...(s.topics || []), ...(s.unitIds || [])];
            })
          ].join(" ").toLowerCase();
          return hay.includes(q);
        });

        if (!matched.length) {
          html += '<div class="past-empty">一致する1級本試験が見つかりません。検索語を変更してください。</div>';
        } else {
          html += '<div class="past-list">';
          matched.forEach((ex) => {
            const doneKey = "L1-" + ex.examNo;
            const isDone = !!curDoneMap[doneKey];
            const rateLabel = ex.passRate && ex.passRate !== "集計中" ? "合格率 " + ex.passRate : "合格率 集計中";
            html += '<article class="past-card">';
            html += '<div class="past-card-head"><div class="past-card-meta">';
            html += '<span class="past-exam-no">第' + escapeHtml(String(ex.examNo)) + "回</span>";
            html += '<span class="past-exam-date">' + escapeHtml(ex.date || "") + "</span>";
            html += '<span class="past-badge">' + escapeHtml(rateLabel) + "</span>";
            if (typeof ex.examinees === "number") {
              html += '<span class="past-badge">' + escapeHtml(ex.examinees.toLocaleString() + "名受験") + "</span>";
            }
            html += "</div>";
            html += '<button type="button" class="past-done-btn ' + (isDone ? "is-done" : "") + '" data-done-key="' + escapeHtml(doneKey) + '">' + (isDone ? "演習済 ✓" : "演習済にする") + "</button>";
            html += "</div>";

            html += '<div class="past-links-row past-links-top">';
            if (ex.comAccPdfUrl) html += '<a class="past-ext-link" href="' + escapeHtml(ex.comAccPdfUrl) + '" target="_blank" rel="noopener noreferrer">商簿・会計 PDF</a>';
            if (ex.indCostPdfUrl) html += '<a class="past-ext-link" href="' + escapeHtml(ex.indCostPdfUrl) + '" target="_blank" rel="noopener noreferrer">工簿・原計 PDF</a>';
            if (ex.reviewPdfUrl) html += '<a class="past-ext-link" href="' + escapeHtml(ex.reviewPdfUrl) + '" target="_blank" rel="noopener noreferrer">公式 講評PDF</a>';
            if (ex.officialPageUrl) html += '<a class="past-ext-link" href="' + escapeHtml(ex.officialPageUrl) + '" target="_blank" rel="noopener noreferrer">公式ページ</a>';
            html += "</div>";

            html += '<div class="past-subjects-grid">';
            subjectDefs.forEach((sd) => {
              const sub = (ex.subjects && ex.subjects[sd.key]) || {};
              html += '<div class="past-subject-cell">';
              html += '<div class="past-subject-name">' + escapeHtml(sd.label) + "</div>";
              if (sub.summary) {
                html += '<div class="past-subject-summary">' + escapeHtml(sub.summary) + "</div>";
              }
              if (sub.topics && sub.topics.length) {
                html += '<div class="past-topics-line">' + sub.topics.map((t) => escapeHtml(t)).join(" · ") + "</div>";
              }
              if (sub.unitIds && sub.unitIds.length) {
                html += '<div class="past-units-row">' + sub.unitIds.map((uid) => '<button type="button" class="past-unit-btn" data-jump-doc="' + escapeHtml(uid) + '">' + escapeHtml(uid) + " を開く</button>").join("") + "</div>";
              }
              html += "</div>";
            });
            html += "</div>";

            if (ex.examinerTakeaway) {
              html += '<div class="past-takeaway"><strong>公式講評要点:</strong> ' + escapeHtml(ex.examinerTakeaway) + "</div>";
            }
            if (ex.note2027) {
              html += '<div class="past-note-2027"><strong>2027年改定メモ:</strong> ' + escapeHtml(ex.note2027) + "</div>";
            }
            html += "</article>";
          });
          html += "</div>";
        }
      } else if (filter === "l2" || filter === "l3") {
        const list = filter === "l2" ? l2List : l3List;
        const matched = list.filter((sample) => {
          if (!q) return true;
          const hay = [
            sample.title || "",
            sample.released || "",
            ...(sample.parts || []).flatMap((p) => [p.label || "", p.note2027 || "", ...(p.topics || []), ...(p.unitIds || [])])
          ].join(" ").toLowerCase();
          return hay.includes(q);
        });

        if (!matched.length) {
          html += '<div class="past-empty">一致するサンプル問題が見つかりません。</div>';
        } else {
          html += '<div class="past-list">';
          matched.forEach((sample) => {
            const isDone = !!curDoneMap[sample.id];
            html += '<article class="past-card">';
            html += '<div class="past-card-head"><div class="past-card-meta">';
            html += '<span class="past-exam-no">' + escapeHtml(sample.title) + "</span>";
            html += '<span class="past-exam-date">' + escapeHtml(sample.released || "") + "</span>";
            html += "</div>";
            html += '<button type="button" class="past-done-btn ' + (isDone ? "is-done" : "") + '" data-done-key="' + escapeHtml(sample.id) + '">' + (isDone ? "演習済 ✓" : "演習済にする") + "</button>";
            html += "</div>";

            html += '<div class="past-sample-parts">';
            (sample.parts || []).forEach((p) => {
              html += '<div class="past-sample-part">';
              html += '<div class="past-sample-part-head">';
              html += '<span class="past-sample-part-label">' + escapeHtml(p.label) + "</span>";
              html += '<div class="past-links-row">';
              if (p.questionPdfUrl) html += '<a class="past-ext-link" href="' + escapeHtml(p.questionPdfUrl) + '" target="_blank" rel="noopener noreferrer">問題 PDF</a>';
              if (p.answerPdfUrl) html += '<a class="past-ext-link" href="' + escapeHtml(p.answerPdfUrl) + '" target="_blank" rel="noopener noreferrer">答案 PDF</a>';
              html += "</div></div>";
              if (p.topics && p.topics.length) {
                html += '<div class="past-topics-line">' + p.topics.map((t) => escapeHtml(t)).join(" · ") + "</div>";
              }
              if (p.unitIds && p.unitIds.length) {
                html += '<div class="past-units-row">' + p.unitIds.map((uid) => '<button type="button" class="past-unit-btn" data-jump-doc="' + escapeHtml(uid) + '">' + escapeHtml(uid) + " を開く</button>").join("") + "</div>";
              }
              if (p.note2027) {
                html += '<div class="past-note-2027"><strong>2027年改定メモ:</strong> ' + escapeHtml(p.note2027) + "</div>";
              }
              html += "</div>";
            });
            html += "</div></article>";
          });
          html += "</div>";
        }
      } else {
        const docs2027 = pe.official2027Docs || [];
        const hubs = pe.officialHubs || [];
        const statsL1 = (pe.stats && pe.stats.level1) || [];
        const statsL2Net = (pe.stats && pe.stats.level2Net) || [];
        const statsL3Net = (pe.stats && pe.stats.level3Net) || [];

        html += '<div class="past-list">';
        html += '<section class="past-card"><h3 class="past-section-title">2027年4月 出題区分改定・公式公開ハブ</h3><div class="past-res-grid">';
        html += '<div class="past-res-list">';
        docs2027.forEach((d) => {
          html += '<a class="past-res-item" href="' + escapeHtml(d.url) + '" target="_blank" rel="noopener noreferrer"><span class="past-res-item-title">' + escapeHtml(d.title) + '</span><span class="past-res-item-desc">日本商工会議所 公式PDF</span></a>';
        });
        html += '</div><div class="past-res-list">';
        hubs.forEach((h) => {
          html += '<a class="past-res-item" href="' + escapeHtml(h.url) + '" target="_blank" rel="noopener noreferrer"><span class="past-res-item-title">' + escapeHtml(h.title) + '</span><span class="past-res-item-desc">' + escapeHtml(h.desc || "") + "</span></a>";
        });
        html += "</div></div></section>";

        if (statsL1.length) {
          html += '<section class="past-card"><h3 class="past-section-title">1級 統一試験 受験者数・合格率公式統計</h3>';
          html += '<div class="table-wrap" tabindex="0"><table><thead><tr><th>回</th><th>申込者数</th><th>実受験者数</th><th>合格者数</th><th>合格率</th></tr></thead><tbody>';
          statsL1.forEach((r) => {
            html += "<tr><td>" + escapeHtml(String(r[0]).replace(/^(\d+)/, "第$1回")) + "</td><td>" + escapeHtml(String(r[1])) + "</td><td>" + escapeHtml(String(r[2])) + "</td><td>" + escapeHtml(String(r[3])) + "</td><td>" + escapeHtml(String(r[4]).replace("％", "%")) + "</td></tr>";
          });
          html += "</tbody></table></div></section>";
        }

        if (statsL2Net.length || statsL3Net.length) {
          html += '<section class="past-card"><h3 class="past-section-title">2級・3級 ネット試験（CBT）公式推移</h3>';
          html += '<div class="past-res-grid">';
          if (statsL2Net.length) {
            html += '<div class="table-wrap" tabindex="0"><table><thead><tr><th>2級 CBT期間</th><th>受験者</th><th>合格者</th><th>合格率</th></tr></thead><tbody>';
            statsL2Net.forEach((r) => {
              html += "<tr><td>" + escapeHtml(String(r[0])) + "</td><td>" + escapeHtml(String(r[1])) + "</td><td>" + escapeHtml(String(r[2])) + "</td><td>" + escapeHtml(String(r[3]).replace("％", "%")) + "</td></tr>";
            });
            html += "</tbody></table></div>";
          }
          if (statsL3Net.length) {
            html += '<div class="table-wrap" tabindex="0"><table><thead><tr><th>3級 CBT期間</th><th>受験者</th><th>合格者</th><th>合格率</th></tr></thead><tbody>';
            statsL3Net.forEach((r) => {
              html += "<tr><td>" + escapeHtml(String(r[0])) + "</td><td>" + escapeHtml(String(r[1])) + "</td><td>" + escapeHtml(String(r[2])) + "</td><td>" + escapeHtml(String(r[3]).replace("％", "%")) + "</td></tr>";
            });
            html += "</tbody></table></div>";
          }
          html += "</div></section>";
        }

        if (pe.copyrightNotice) {
          html += '<section class="past-card"><p class="past-copyright">' + escapeHtml(pe.copyrightNotice) + "</p></section>";
        }
        html += "</div>";
      }

      bodyEl.innerHTML = html;

      bodyEl.querySelectorAll("[data-done-key]").forEach((btn) => {
        btn.onclick = () => {
          const key = btn.dataset.doneKey;
          if (!state.pastExamDone) state.pastExamDone = {};
          state.pastExamDone[key] = !state.pastExamDone[key];
          saveState();
          renderPastExamBody();
        };
      });

      bodyEl.querySelectorAll("[data-jump-doc]").forEach((btn) => {
        btn.onclick = () => {
          const docId = btn.dataset.jumpDoc;
          if (docId) {
            switchStudioMode("reader");
            openDoc(docId);
          }
        };
      });
    }

    if (!preserveShell || !document.getElementById("pastExamBody")) {
      const isDesktopWidth = window.innerWidth > 820;
      let html = renderDojoTabBar();
      html += '<div class="past-shell">';
      html += '<section class="past-header-card">';
      html += '<div class="past-eyebrow">日本商工会議所 公式公開問題・講評アーカイブ</div>';
      html += '<h2 class="past-title">公式過去問・サンプル問題</h2>';
      html += '<p class="past-lead">1級本試験（第158〜174回）・2級/3級公式サンプル問題・2027年出題区分改定資料を横断検索し、該当単元へ直結します。</p>';
      html += "</section>";

      const filterTabs = [
        { id: "l1", label: "1級 本試験 (" + l1List.length + ")" },
        { id: "l2", label: "2級 サンプル (" + l2List.length + ")" },
        { id: "l3", label: "3級 サンプル (" + l3List.length + ")" },
        { id: "resources", label: "2027改定・公式統計" }
      ];

      html += '<div class="past-toolbar"><div class="past-filter-tabs">';
      filterTabs.forEach((ft) => {
        html += '<button type="button" class="past-filter-btn ' + (pastExamState.filter === ft.id ? "active" : "") + '" data-past-filter="' + ft.id + '">' + escapeHtml(ft.label) + "</button>";
      });
      html += "</div>";
      html += '<input id="pastExamSearch" class="past-search-input" type="search" aria-label="過去問・論点・回次を検索" placeholder="例: 第174回 / 収益認識 / 連結 / 2027" value="' + escapeHtml(pastExamState.query) + '" />';
      html += "</div>";

      html += '<details id="pastOverviewDetails" class="past-overview-details"' + (isDesktopWidth ? " open" : "") + ">";
      html += '<summary class="past-overview-summary"><span class="past-overview-label">1級 合格率推移・演習進捗（済 <span id="pastDoneSummaryVal">' + doneCount + "件</span>）</span></summary>";
      html += '<div class="past-overview-body">';
      html += '<div class="past-kpi-grid">';
      html += '<div class="past-kpi"><div class="past-kpi-label">1級 本試験</div><div class="past-kpi-val">' + l1List.length + "回分</div></div>";
      html += '<div class="past-kpi"><div class="past-kpi-label">2級 サンプル</div><div class="past-kpi-val">' + l2List.length + "セット</div></div>";
      html += '<div class="past-kpi"><div class="past-kpi-label">3級 サンプル</div><div class="past-kpi-val">' + l3List.length + "セット</div></div>";
      html += '<div class="past-kpi"><div class="past-kpi-label">演習済マーク</div><div class="past-kpi-val" id="pastDoneKpiVal">' + doneCount + "件</div></div>";
      html += "</div>";

      const chartSvg = buildPastPassRateChartSvg(pe.stats && pe.stats.level1);
      if (chartSvg) {
        html += '<section class="past-chart-card">';
        html += '<div class="past-chart-head"><span class="past-chart-title">1級 統一試験 合格率推移（第156〜173回）</span><span class="past-chart-sub">基準線: 10.0%</span></div>';
        html += chartSvg;
        html += "</section>";
      }
      html += "</div></details>";

      html += '<div id="pastExamBody"></div>';
      html += "</div>";

      root.innerHTML = html;
      bindDojoTabBar(root);

      root.querySelectorAll("[data-past-filter]").forEach((btn) => {
        btn.onclick = () => {
          pastExamState.filter = btn.dataset.pastFilter;
          root.querySelectorAll("[data-past-filter]").forEach((b) => {
            b.classList.toggle("active", b.dataset.pastFilter === pastExamState.filter);
          });
          renderPastExamBody();
        };
      });

      const searchEl = document.getElementById("pastExamSearch");
      if (searchEl) {
        searchEl.addEventListener("input", (e) => {
          pastExamState.query = e.target.value;
          renderPastExamBody();
        });
      }
    }

    renderPastExamBody();
  }

  window.BokiStudioTools = {
    onModeChange(mode) {
      if (mode === "drill") renderDrillView();
      else if (mode === "sim") renderSimView();
      else if (mode === "analytics") renderAnalyticsView();
      else if (mode === "cheat") renderCheatView();
    },
    openUnitDojo(docId) {
      const hasJournal = (DATA.drills || []).some((c) => c.docId === docId);
      const hasCalc = (DATA.calcDrills || []).some((c) => c.docId === docId);
      drillState.hasInitializedTab = true;
      if (hasJournal) {
        drillState.dojoTab = "journal";
        drillState.part = "all";
        drillState.queueMode = "all";
        drillState.docFilter = docId;
        drillState.sessionLimit = 0;
        rebuildDeck(false);
      } else if (hasCalc) {
        drillState.dojoTab = "calc";
        calcDojoState.part = "all";
        calcDojoState.queueMode = "all";
        calcDojoState.sessionLimit = 0;
        const cIds = (DATA.calcDrills || []).filter((c) => c.docId === docId).map((c) => c.id);
        rebuildCalcDeck(false, cIds);
      } else {
        drillState.dojoTab = "journal";
      }
      switchStudioMode("drill");
    },
    openTodayReview(subTab) {
      drillState.hasInitializedTab = true;
      drillState.dojoTab = "today";
      todayState.runnerActive = false;
      todayState.runnerSummary = null;
      if (subTab === "mistakes" || subTab === "queue") todayState.subTab = subTab;
      switchStudioMode("drill");
    }
  };
})();
