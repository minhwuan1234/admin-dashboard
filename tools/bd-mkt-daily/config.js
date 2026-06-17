/* --------------------------------------------------------------
   TOOL CONFIG: BD-MKT Daily Report
   -------------------------------------------------------------- */

window.TOOL_REGISTRY = window.TOOL_REGISTRY || [];

/* -- Worker URL -- */
var _BD_WORKER_URL = "https://admin-dashboard.minhwuan889.workers.dev/";

/* -- OpenAI config -- */

/* -- ISO week helper -- */
function _bdGetISOWeek(date) {
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}

/* -- Aggregate BD-MKT data -> summary payload -- */
function _bdAggregate(data) {
  var week    = _bdGetISOWeek(new Date());
  var allRows = data.allRows || [];

  /* Last 7 days: morning/evening rate per day */
  var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  var last7 = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(now); d.setDate(d.getDate() - i);
    var ds = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
    var dayRows = allRows.filter(function(r) { return r["Date"] === ds; });
    last7.push({
      date:    ds,
      morning: dayRows.filter(function(r) { return r["Type"] === "morning"; }).length,
      evening: dayRows.filter(function(r) { return r["Type"] === "evening"; }).length,
      total:   data.totalMembers
    });
  }

  /* Member consistency - bao nhi?u ng?y submit c? 2 trong 7 ng?y qua */
  var memberConsistency = {};
  (data.memberNames || []).forEach(function(name) {
    var bothDays = last7.filter(function(day) {
      var dayRows = allRows.filter(function(r) { return r["Date"] === day.date && r["Member"] === name; });
      return dayRows.some(function(r) { return r["Type"] === "morning"; }) &&
             dayRows.some(function(r) { return r["Type"] === "evening"; });
    }).length;
    var morningOnly = last7.filter(function(day) {
      var dayRows = allRows.filter(function(r) { return r["Date"] === day.date && r["Member"] === name; });
      return dayRows.some(function(r) { return r["Type"] === "morning"; }) &&
            !dayRows.some(function(r) { return r["Type"] === "evening"; });
    }).length;
    memberConsistency[name] = { bothDays: bothDays, morningOnly: morningOnly, outOf: 7 };
  });

  /* Plan vs actual gap - so s?nh expected time vs actual time spent */
  var planActualGap = { onTrack: 0, over: 0, under: 0, noData: 0 };
  allRows.forEach(function(r) {
    if (r["Type"] !== "evening") return;
    for (var i = 1; i <= 2; i++) {
      var expected = parseFloat(r["Expected " + i]);
      var actual   = parseFloat(r["TimeSpent " + i]);
      if (isNaN(expected) || isNaN(actual)) { planActualGap.noData++; continue; }
      var ratio = actual / expected;
      if (ratio > 1.2)      planActualGap.over++;
      else if (ratio < 0.8) planActualGap.under++;
      else                  planActualGap.onTrack++;
    }
  });

  /* Today stats */
  var todayMissingMorning = (data.memberNames || []).filter(function(n) { return !data.todayMorning[n]; });
  var todayMissingEvening = (data.memberNames || []).filter(function(n) { return !data.todayEvening[n]; });
  var bothToday = (data.memberNames || []).filter(function(n) { return data.todayMorning[n] && data.todayEvening[n]; }).length;

  /* Avg rates last 7 days */
  var avgMorning = last7.length > 0
    ? Math.round(last7.reduce(function(acc, d) { return acc + (d.total > 0 ? d.morning / d.total * 100 : 0); }, 0) / last7.length)
    : 0;
  var avgEvening = last7.length > 0
    ? Math.round(last7.reduce(function(acc, d) { return acc + (d.total > 0 ? d.evening / d.total * 100 : 0); }, 0) / last7.length)
    : 0;

  return {
    generatedWeek: week,
    today: {
      morningRate:    data.morningRate,
      eveningRate:    data.eveningRate,
      morningCount:   data.morningCount,
      eveningCount:   data.eveningCount,
      bothCount:      bothToday,
      totalMembers:   data.totalMembers,
      missingMorning: todayMissingMorning.length,
      missingEvening: todayMissingEvening.length
    },
    last7Days:         last7,
    avgMorningLast7:   avgMorning,
    avgEveningLast7:   avgEvening,
    memberConsistency: memberConsistency,
    planActualGap:     planActualGap
  };
}

/* -- Call OpenAI API -- */
async function _bdCallOpenAI(summary) {
  var sysPrompt = 'B?n l? PM assistant c?a F.Learning Studio, ph? tr?ch team BD-MKT. Nh?n v?o data daily report (morning plan + evening actual) c?a team, ph?n t?ch v? tr? v? insight b?ng ti?ng Vi?t. Tr? v? JSON THU?N T?Y, kh?ng th?m g? ngo?i JSON. Format: {"summary":"T?ng quan 1-2 c?u v? t?nh h?nh submit h?m nay","highlights":[{"type":"positive|warning|neutral","text":"?i?m ??ng ch? ? ng?n g?n"}],"morningEveningGap":"Nh?n x?t v? ch?nh l?ch gi?a morning v? evening submit rate - nguy?n nh?n c? th? l? g?","planActualInsight":"Nh?n x?t v? plan vs actual execution: team c? ?ang over ho?c under estimate kh?ng","consistencyInsight":"Nh?n x?t v? m?c ?? consistent khi submit c? 2 bu?i trong tu?n","weeklyTrend":"Xu h??ng submit so v?i tu?n tr??c","recommendations":["C?ch c? th? ?? t?ng t? l? submit c? morning l?n evening - thay ??i workflow, reminder, ho?c form"],"toolUsage":"M? t? c?ch team BD-MKT ?ang s? d?ng daily report tool v? m?c ?? hi?u qu? th?c t?","frictions":"C?c friction c? th? ?ang l?m gi?m t? l? submit morning/evening - d?a tr?n pattern trong data","adjustments":"?? xu?t ?i?u ch?nh c? th? ?? t?ng t? l? submit c? 2 bu?i: th?i ?i?m nh?c, ?? d?i form, quy tr?nh"}. Highlights t?i ?a 4. Recommendations t?i ?a 3. Kh?ng n?u t?n c? nh?n. M?i nh?n x?t ph?i d?a tr?n s? li?u th?c t?.';

  var payload = {
    max_tokens:  800,
    temperature: 0.4,
    messages: [
      { role: "system", content: sysPrompt },
      { role: "user",   content: "Data BD-MKT tu?n " + summary.generatedWeek + ": " + JSON.stringify(summary).replace(/[\u0000-\u001F]/g, "") }
    ]
  };

  var res = await fetch(_BD_WORKER_URL + "/ai-insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: payload.messages })
  });

  if (!res.ok) throw new Error("Worker HTTP " + res.status);
  var json = await res.json();
  var raw = json.choices[0].message.content.trim()
    .replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(raw);
}

function _bdCacheKey() {
  return "bd_insight_" + _bdGetISOWeek(new Date());
}

/* -- Render insight panel HTML -- */
function _bdRenderInsightHTML(insight, week, isCache) {
  var typeIcon  = { positive: "ti-trending-up", warning: "ti-alert-triangle", neutral: "ti-info-circle" };
  var typeColor = { positive: "var(--green)", warning: "var(--accent)", neutral: "var(--blue)" };
  var typeBg    = { positive: "var(--green-dim)", warning: "var(--accent-dim)", neutral: "var(--blue-dim)" };

  var highlightRows = (insight.highlights || []).map(function(h) {
    var ic = typeIcon[h.type]  || "ti-info-circle";
    var co = typeColor[h.type] || "var(--text-muted)";
    var bg = typeBg[h.type]   || "var(--bg-hover)";
    return '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:' + bg + ';border-radius:var(--radius-sm);margin-bottom:8px">' +
      '<i class="ti ' + ic + '" style="font-size:14px;color:' + co + ';flex-shrink:0;margin-top:1px"></i>' +
      '<span style="font-size:13px;color:var(--text-primary);line-height:1.55">' + h.text + '</span>' +
    '</div>';
  }).join("");

  var recRows = (insight.recommendations || []).map(function(r, i) {
    return '<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">' +
      '<span style="width:20px;height:20px;border-radius:50%;background:var(--accent);color:#000;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">' + (i+1) + '</span>' +
      '<span style="font-size:13px;color:var(--text-secondary);line-height:1.55">' + r + '</span>' +
    '</div>';
  }).join("");

  var cacheNote = isCache
    ? '<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">Cache ' + week + ' ? <button id="bd-insight-regen" style="background:none;border:none;color:var(--accent);font-size:10px;font-family:var(--font-mono);cursor:pointer;padding:0">? Regenerate</button></span>'
    : '<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">Generated ' + week + '</span>';

  return '<div style="display:flex;flex-direction:column;gap:0;height:100%">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 20px 16px;border-bottom:1px solid var(--border);flex-shrink:0">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div style="width:32px;height:32px;border-radius:var(--radius-sm);background:var(--accent-dim);display:flex;align-items:center;justify-content:center;color:var(--accent)"><i class="ti ti-sparkles" style="font-size:16px"></i></div>' +
        '<div><p style="font-family:var(--font-display);font-size:15px;font-weight:600;color:var(--text-primary)">AI Insight</p>' + cacheNote + '</div>' +
      '</div>' +
      '<button id="bd-insight-close" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:4px;line-height:1;display:flex;align-items:center"><i class="ti ti-x"></i></button>' +
    '</div>' +
    '<div style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:20px">' +
      '<div>' +
        '<p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px">T?ng quan</p>' +
        '<p style="font-size:14px;color:var(--text-primary);line-height:1.65;background:var(--bg-hover);padding:12px 14px;border-radius:var(--radius-sm)">' + insight.summary + '</p>' +
      '</div>' +
      (highlightRows ? '<div><p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px">?i?m ??ng ch? ?</p>' + highlightRows + '</div>' : '') +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)">Ph?n t?ch</p>' +
        '<div style="padding:10px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm)">' +
          '<p style="font-size:10px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Morning vs Evening</p>' +
          '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55">' + insight.morningEveningGap + '</p>' +
        '</div>' +
        '<div style="padding:10px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm)">' +
          '<p style="font-size:10px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Plan vs Actual</p>' +
          '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55">' + insight.planActualInsight + '</p>' +
        '</div>' +
        '<div style="padding:10px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm)">' +
          '<p style="font-size:10px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Consistency</p>' +
          '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55">' + insight.consistencyInsight + '</p>' +
        '</div>' +
        '<div style="padding:10px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm)">' +
          '<p style="font-size:10px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Xu h??ng tu?n</p>' +
          '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55">' + insight.weeklyTrend + '</p>' +
        '</div>' +
      '</div>' +
      (recRows ? '<div><p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px">Khuy?n ngh?</p>' + recRows + '</div>' : '') +

      /* 3 questions section */
      '<div style="border-top:1px solid var(--border);padding-top:20px;display:flex;flex-direction:column;gap:12px">' +
        '<p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)">??nh gi? tool</p>' +
        _bdQABlock("ti-tool", "Tool ?ang ???c d?ng nh? th? n?o?", insight.toolUsage) +
        _bdQABlock("ti-alert-triangle", "Problem / friction n?o ?ang th?y trong data?", insight.frictions) +
        _bdQABlock("ti-adjustments", "C?n ?i?u ch?nh g??", insight.adjustments) +
      '</div>' +

    '</div>' +
  '</div>';
}

function _bdQABlock(icon, question, answer) {
  return '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden">' +
    '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg-hover);border-bottom:1px solid var(--border)">' +
      '<i class="ti ' + icon + '" style="font-size:13px;color:var(--accent)"></i>' +
      '<p style="font-size:11px;font-weight:600;color:var(--text-primary)">' + question + '</p>' +
    '</div>' +
    '<p style="font-size:13px;color:var(--text-secondary);line-height:1.6;padding:12px 14px">' + (answer || '-') + '</p>' +
  '</div>';
}

function _bdInsightLoadingHTML() {
  return '<div style="display:flex;flex-direction:column;gap:0;height:100%">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 20px 16px;border-bottom:1px solid var(--border);flex-shrink:0">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div style="width:32px;height:32px;border-radius:var(--radius-sm);background:var(--accent-dim);display:flex;align-items:center;justify-content:center;color:var(--accent)"><i class="ti ti-sparkles" style="font-size:16px"></i></div>' +
        '<div><p style="font-family:var(--font-display);font-size:15px;font-weight:600;color:var(--text-primary)">AI Insight</p><span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">?ang ph?n t?ch...</span></div>' +
      '</div>' +
      '<button id="bd-insight-close" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:4px;line-height:1;display:flex;align-items:center"><i class="ti ti-x"></i></button>' +
    '</div>' +
    '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:40px">' +
      '<div style="width:36px;height:36px;border:2px solid var(--border-strong);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite"></div>' +
      '<p style="font-size:14px;color:var(--text-primary)">?ang g?i AI...</p>' +
    '</div>' +
  '</div>';
}

function _bdInsightErrorHTML(msg) {
  return '<div style="display:flex;flex-direction:column;gap:0;height:100%">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 20px 16px;border-bottom:1px solid var(--border);flex-shrink:0">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div style="width:32px;height:32px;border-radius:var(--radius-sm);background:var(--red-dim);display:flex;align-items:center;justify-content:center;color:var(--red)"><i class="ti ti-alert-circle" style="font-size:16px"></i></div>' +
        '<p style="font-family:var(--font-display);font-size:15px;font-weight:600;color:var(--text-primary)">AI Insight</p>' +
      '</div>' +
      '<button id="bd-insight-close" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:4px;line-height:1;display:flex;align-items:center"><i class="ti ti-x"></i></button>' +
    '</div>' +
    '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:40px;text-align:center">' +
      '<i class="ti ti-wifi-off" style="font-size:36px;color:var(--text-muted)"></i>' +
      '<p style="font-size:14px;color:var(--text-primary)">Kh?ng th? t?o insight</p>' +
      '<p style="font-size:12px;color:var(--text-muted)">' + msg + '</p>' +
      '<button id="bd-insight-retry" style="margin-top:8px;padding:8px 18px;background:var(--accent-dim);border:1px solid var(--accent);border-radius:var(--radius-sm);color:var(--accent);font-size:13px;cursor:pointer">? Th? l?i</button>' +
    '</div>' +
  '</div>';
}

async function _bdOpenInsightPanel(data, forceRegen) {
  var panel   = document.getElementById("bd-insight-panel");
  var overlay = document.getElementById("bd-insight-overlay");
  if (!panel) return;

  overlay.style.display = "block";
  panel.classList.add("open");

  var week     = _bdGetISOWeek(new Date());
  var cacheKey = _bdCacheKey();
  var cached   = null;

  if (!forceRegen) {
    try { cached = JSON.parse(localStorage.getItem(cacheKey)); } catch(e) {}
  }

  if (cached) {
    panel.innerHTML = _bdRenderInsightHTML(cached, week, true);
    _bdBindPanelEvents(data, panel, overlay);
    return;
  }

  panel.innerHTML = _bdInsightLoadingHTML();
  _bdBindCloseEvent(panel, overlay);

  try {
    var summary = _bdAggregate(data);
    var insight = await _bdCallOpenAI(summary);
    localStorage.setItem(cacheKey, JSON.stringify(insight));
    panel.innerHTML = _bdRenderInsightHTML(insight, week, false);
    _bdBindPanelEvents(data, panel, overlay);
  } catch(err) {
    panel.innerHTML = _bdInsightErrorHTML(err.message);
    _bdBindCloseEvent(panel, overlay);
    var retryBtn = document.getElementById("bd-insight-retry");
    if (retryBtn) retryBtn.addEventListener("click", function() { _bdOpenInsightPanel(data, true); });
  }
}

function _bdBindCloseEvent(panel, overlay) {
  var closeBtn = document.getElementById("bd-insight-close");
  if (closeBtn) closeBtn.addEventListener("click", function() { _bdClosePanel(panel, overlay); });
  overlay.onclick = function() { _bdClosePanel(panel, overlay); };
}
function _bdBindPanelEvents(data, panel, overlay) {
  _bdBindCloseEvent(panel, overlay);
  var regenBtn = document.getElementById("bd-insight-regen");
  if (regenBtn) regenBtn.addEventListener("click", function() { _bdOpenInsightPanel(data, true); });
}
function _bdClosePanel(panel, overlay) {
  panel.classList.remove("open");
  overlay.style.display = "none";
}

/* -------------------------------------------------------------- */

window.TOOL_REGISTRY.push({
  id:          "bd-mkt-daily",
  name:        "BD-MKT Daily Report",
  description: "Tracking morning/evening submit va plan vs actual cua team BD-MKT.",
  icon:        "ti-sun-moon",
  status:      "active",

  _MEMBERS: {
    "ou_3ff4b0c1ae98c259c7006993a41e8d84": "Huy?n Linh",
    "ou_1f71198623d1dc71688fe1312390f7ee": "Nga Linh",
    "ou_d7d124081bfa6eabfb12e85166eca85f": "Giang",
    "ou_6993f5104b93fe3d774304bc9637884d": "Linh",
    "ou_12548715eba533527311e76207c95ce4": "Minh Anh",
    "ou_54c6d3cd8a2239d14e894f404591506a": "H?n"
  },

  fetchData: async function(utils) {
    var SHEET_ID   = "1j-18C2hBM8Lvxz-sgDtLQ8KSeFTjxAyJ1CUGXiOcvvQ";
    var SHEET_NAME = "BD-MKT-L&D-Daily Report";
    var MEMBERS    = this._MEMBERS;

    var url = "https://docs.google.com/spreadsheets/d/" + SHEET_ID +
              "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(SHEET_NAME) + "&t=" + Date.now();

    var res = await fetch(url);
    if (!res.ok) throw new Error("Sheets CSV error: " + res.status);
    var csv = await res.text();

    function splitCSVLine(line) {
      var res=[], cur="", inQ=false;
      for (var i=0; i<line.length; i++) {
        var c = line[i];
        if (c==='"') { if (inQ && line[i+1]==='"') { cur+='"'; i++; } else inQ=!inQ; }
        else if (c===',' && !inQ) { res.push(cur); cur=""; }
        else cur+=c;
      }
      res.push(cur); return res;
    }

    var lines   = csv.split("\n").filter(function(l) { return l.trim(); });
    var headers = splitCSVLine(lines[0]);
    // gviz/tq ??i c?t Date th?nh "x" khi l? Date object - normalize l?i
    var normalizedHeaders = headers.map(function(h) {
      return h.trim() === "x" ? "Date" : h.trim();
    });
    var rows    = lines.slice(1).map(function(line) {
      var vals = splitCSVLine(line), obj = {};
      normalizedHeaders.forEach(function(h, i) { obj[h] = (vals[i] || "").trim(); });
      return obj;
    }).filter(function(r) { return r["Date"] && r["Member"]; });

    var memberNames  = Object.values(MEMBERS);
    var totalMembers = memberNames.length;

    var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    var todayStr = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");

    var todayRows    = rows.filter(function(r) { return r["Date"] === todayStr; });
    var todayMorning = {}, todayEvening = {};

    todayRows.forEach(function(r) {
      var member = r["Member"], type = r["Type"], tasks = [];
      for (var i = 1; i <= 2; i++) {
        var title = r["Task " + i]; if (!title) continue;
        tasks.push({ title: title, output: r["Output " + i] || "-", expectedTime: r["Expected " + i] || "-", progress: r["Progress " + i] || "-", timeSpent: r["TimeSpent "+ i] || "-" });
      }
      // Parse steps t? c?t Steps N (d?ng "1. B??c -> Output | 2. B??c -> Output")
      for (var ti2 = 0; ti2 < tasks.length; ti2++) {
        var stepsRaw = r["Steps " + (ti2 + 1)] || "";
        if (stepsRaw) {
          tasks[ti2].steps = stepsRaw.split("|").map(function(s) {
            var trimmed = s.trim();
            var arrowIdx = trimmed.indexOf(">");
            if (arrowIdx > -1) {
              return { what: trimmed.slice(0, arrowIdx).replace(/^\d+\.\s*/, "").trim(), output: trimmed.slice(arrowIdx + 1).trim() };
            }
            return { what: trimmed.replace(/^\d+\.\s*/, "").trim(), output: "" };
          }).filter(function(s) { return s.what; });
        } else {
          tasks[ti2].steps = [];
        }
      }
      var entry = { memberName: member, tasks: tasks, submittedAt: r["Submitted At"] || "", blockers: r["Blockers"] || "", tomorrowPlan: r["Tomorrow Plan"] || "", weeklyGoal: r["Weekly Goal"] || "" };
      if (type === "morning") todayMorning[member] = entry;
      if (type === "evening") todayEvening[member] = entry;
    });

    var days = [];
    for (var i = 29; i >= 0; i--) {
      var d   = new Date(now); d.setDate(d.getDate() - i);
      var ds  = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
      var lbl = String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0");
      days.push({ dateStr: ds, label: lbl, morning: 0, evening: 0 });
    }
    rows.forEach(function(r) {
      var day = days.find(function(d) { return d.dateStr === r["Date"]; });
      if (!day) return;
      if (r["Type"] === "morning") day.morning++;
      if (r["Type"] === "evening") day.evening++;
    });

    var morningCount = Object.keys(todayMorning).length;
    var eveningCount = Object.keys(todayEvening).length;

    return {
      totalMembers: totalMembers, morningCount: morningCount, eveningCount: eveningCount,
      morningRate: totalMembers > 0 ? Math.round(morningCount / totalMembers * 100) : 0,
      eveningRate: totalMembers > 0 ? Math.round(eveningCount / totalMembers * 100) : 0,
      memberNames: memberNames, memberIds: Object.keys(MEMBERS), members: MEMBERS,
      todayMorning: todayMorning, todayEvening: todayEvening,
      chartDays: days, todayStr: todayStr, allRows: rows,
    };
  },

  renderCard: function(data) {
    var mc = data.morningRate >= 80 ? "green" : data.morningRate >= 50 ? "amber" : "red";
    var ec = data.eveningRate >= 80 ? "green" : data.eveningRate >= 50 ? "amber" : "red";
    return '<div class="tool-metrics">' +
      '<div class="tool-metric"><span class="metric-value ' + mc + '">' + data.morningCount + '/' + data.totalMembers + '</span><span class="metric-label">?? Morning</span></div>' +
      '<div class="tool-metric"><span class="metric-value ' + ec + '">' + data.eveningCount + '/' + data.totalMembers + '</span><span class="metric-label">? Evening</span></div>' +
      '</div>' +
      '<div class="mini-bar-wrap" style="margin-top:8px"><span style="font-size:10px;color:var(--text-muted);width:52px">Morning</span><div class="mini-bar"><div class="mini-bar-fill ' + (data.morningRate < 80 ? data.morningRate >= 50 ? "amber" : "red" : "") + '" style="width:' + data.morningRate + '%"></div></div><span class="mini-bar-pct">' + data.morningRate + '%</span></div>' +
      '<div class="mini-bar-wrap" style="margin-top:4px"><span style="font-size:10px;color:var(--text-muted);width:52px">Evening</span><div class="mini-bar"><div class="mini-bar-fill ' + (data.eveningRate < 80 ? data.eveningRate >= 50 ? "amber" : "red" : "") + '" style="width:' + data.eveningRate + '%"></div></div><span class="mini-bar-pct">' + data.eveningRate + '%</span></div>';
  },

  renderDetail: function(data, utils) {
    if (!data || data._error) return '<div class="state-error"><i class="ti ti-alert-circle"></i> Khong the tai data</div>';
    if (data._loading) return '<div class="state-loading"><div class="spinner"></div><p>Dang tai...</p></div>';

    var tabBar =
      '<div class="tab-bar">' +
        '<button class="tab-btn active" data-tab="tracking"><i class="ti ti-chart-bar"></i> Tracking</button>' +
        '<button class="tab-btn" data-tab="info"><i class="ti ti-info-circle"></i> Thong tin tool</button>' +
      '</div>' +
      '<div id="tab-tracking" class="tab-pane"></div>' +
      '<div id="tab-info" class="tab-pane" style="display:none"></div>' +
      /* Insight panel + overlay + FAB */
      '<div id="bd-insight-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199;backdrop-filter:blur(2px)"></div>' +
      '<div id="bd-insight-panel" class="cs-insight-panel"></div>' +
      '<button id="bd-insight-fab" class="cs-insight-fab" title="Xem AI Insight">' +
        '<i class="ti ti-sparkles"></i><span>Insight</span>' +
      '</button>';

    var mc = data.morningRate >= 80 ? "green" : data.morningRate >= 50 ? "amber" : "red";
    var ec = data.eveningRate >= 80 ? "green" : data.eveningRate >= 50 ? "amber" : "red";
    var bothCount = data.memberNames.filter(function(name) { return data.todayMorning[name] && data.todayEvening[name]; }).length;

    var statsHTML =
      '<div class="detail-stats">' +
        '<div class="stat-card"><span class="stat-label">?? Morning submit</span><span class="stat-value ' + mc + '">' + data.morningRate + '%</span><span class="stat-delta">' + data.morningCount + '/' + data.totalMembers + ' members</span></div>' +
        '<div class="stat-card"><span class="stat-label">? Evening submit</span><span class="stat-value ' + ec + '">' + data.eveningRate + '%</span><span class="stat-delta">' + data.eveningCount + '/' + data.totalMembers + ' members</span></div>' +
        '<div class="stat-card"><span class="stat-label">Ca 2 submit</span><span class="stat-value green">' + bothCount + '</span><span class="stat-delta">/ ' + data.totalMembers + ' members</span></div>' +
      '</div>';

    window._bdChartDays = data.chartDays;
    window._bdTotal     = data.totalMembers;
    window._bdAllRows   = data.allRows;
    window._bdData      = data; /* store for insight panel */

    window._buildBDChart = function(n) {
      var container = document.getElementById("bd-chart-container");
      if (!container) return;
      n = n || 7;
      var allDays = window._bdChartDays || [];
      var days    = allDays.slice(-n);
      var max     = Math.max(window._bdTotal, 1);
      var hasData = days.some(function(d) { return d.morning > 0 || d.evening > 0; });

      if (!hasData) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;gap:8px;color:var(--text-muted)"><i class="ti ti-chart-bar-off" style="font-size:28px"></i><span>Chua co du lieu</span></div>';
        return;
      }

      container.innerHTML = days.map(function(d) {
        var mp  = Math.round(d.morning / max * 100);
        var ep  = Math.round(d.evening / max * 100);
        var tip = '<strong>' + d.dateStr + '</strong><br>?? Morning: ' + d.morning + '/' + max + '<br>? Evening: ' + d.evening + '/' + max;
        var mBg = mp >= 80 ? "var(--green)"  : mp > 0 ? "var(--accent)" : "var(--bg-hover)";
        var eBg = ep >= 80 ? "var(--blue)"   : ep > 0 ? "var(--yellow)" : "var(--bg-hover)";
        return '<div class="chart-col" data-tip="' + tip.replace(/"/g, "&quot;") + '" data-date="' + d.dateStr + '" data-morning="' + d.morning + '" data-evening="' + d.evening + '">' +
          '<div class="chart-bar-wrap" style="gap:3px;align-items:flex-end">' +
            '<div class="chart-bar" style="flex:1;height:' + Math.max(mp,3) + '%;background:' + mBg + ';border-radius:3px 3px 0 0"></div>' +
            '<div class="chart-bar" style="flex:1;height:' + Math.max(ep,3) + '%;background:' + eBg + ';border-radius:3px 3px 0 0"></div>' +
          '</div>' +
          '<div class="chart-label">' + d.label + '</div>' +
          '<div class="chart-count">' + d.morning + '/' + d.evening + '</div>' +
        '</div>';
      }).join("");

      var tip = document.getElementById("_bd_global_tip");
      if (!tip) {
        tip = document.createElement("div");
        tip.id = "_bd_global_tip";
        tip.style.cssText = "position:fixed;z-index:99999;background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text-primary);white-space:nowrap;line-height:1.6;pointer-events:none;display:none;font-family:var(--font-body)";
        document.body.appendChild(tip);
      }
      container.querySelectorAll(".chart-col").forEach(function(col) {
        col.addEventListener("mouseenter", function() { tip.innerHTML = (col.dataset.tip || "").replace(/&quot;/g, '"'); tip.style.display = "block"; });
        col.addEventListener("mousemove",  function(e) { tip.style.left = (e.clientX - tip.offsetWidth / 2) + "px"; tip.style.top = (e.clientY - tip.offsetHeight - 14) + "px"; });
        col.addEventListener("mouseleave", function() { tip.style.display = "none"; });

        if (parseInt(col.dataset.morning) > 0 || parseInt(col.dataset.evening) > 0) {
          col.style.cursor = "pointer";
          col.addEventListener("click", function() {
            var dateStr = col.dataset.date;
            var detail  = document.getElementById("bd-day-detail");
            if (!detail) return;
            if (detail.dataset.activeDate === dateStr && detail.style.display !== "none") {
              detail.style.display = "none"; detail.dataset.activeDate = "";
              container.querySelectorAll(".chart-col--active").forEach(function(c) { c.classList.remove("chart-col--active"); });
              return;
            }
            container.querySelectorAll(".chart-col--active").forEach(function(c) { c.classList.remove("chart-col--active"); });
            col.classList.add("chart-col--active");
            detail.dataset.activeDate = dateStr; detail.style.display = "block";
            window._fetchBDDay(dateStr);
          });
        }
      });
    };

    window._fetchBDDay = function(dateStr) {
      var detail = document.getElementById("bd-day-detail");
      if (!detail) return;
      var rows = (window._bdAllRows || []).filter(function(r) { return r["Date"] === dateStr; });
      if (!rows.length) {
        detail.innerHTML = '<div class="state-empty" style="padding:24px"><i class="ti ti-inbox" style="font-size:28px"></i><p>Chua co du lieu cho ngay ' + dateStr + '</p></div>';
        return;
      }
      var byMember = {};
      rows.forEach(function(r) {
        var m = r["Member"];
        if (!byMember[m]) byMember[m] = { morning: null, evening: null };
        if (r["Type"] === "morning") byMember[m].morning = r;
        if (r["Type"] === "evening") byMember[m].evening = r;
      });
      var memberRows = Object.entries(byMember).map(function(entry) {
        var name = entry[0], d = entry[1];
        var mCell = d.morning
          ? '<span class="status-pill submitted" style="font-size:10px">?? Submit</span><br><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + (d.morning["Submitted At"] || "") + '</span>'
          : '<span class="status-pill missing" style="font-size:10px">? Chua</span>';
        var eCell = d.evening
          ? '<span class="status-pill submitted" style="font-size:10px">? Submit</span><br><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + (d.evening["Submitted At"] || "") + '</span>'
          : '<span class="status-pill missing" style="font-size:10px">? Chua</span>';
        var taskCols = "";
        for (var i = 1; i <= 2; i++) {
          var title    = d.morning ? (d.morning["Task " + i] || "") : "";
          var plan     = d.morning ? (d.morning["Expected " + i] || "-") : "-";
          var prog     = d.evening ? (d.evening["Progress " + i] || "") : "";
          var time     = d.evening ? (d.evening["TimeSpent "+ i] || "-") : "-";
          var stepsRaw = d.morning ? (d.morning["Steps " + i] || "") : "";
          if (!title && i > 1) continue;
          var pc = prog === "100%" ? "done" : prog && parseInt(prog) >= 60 ? "high" : "medium";
          var stepsHTML2 = "";
          if (stepsRaw) {
            var stepItems = stepsRaw.split("|").map(function(s, si) {
              var trimmed = s.trim().replace(/^\d+\.\s*/, "");
              var arrowIdx = trimmed.indexOf(">");
              var what = arrowIdx > -1 ? trimmed.slice(0, arrowIdx).trim() : trimmed;
              var out  = arrowIdx > -1 ? trimmed.slice(arrowIdx + 1).trim() : "";
              return '<div style="font-size:11px;color:var(--text-secondary);padding:2px 0">' + (si+1) + '. ' + what + (out ? '<span style="color:var(--text-muted)"> > ' + out + '</span>' : '') + '</div>';
            }).join("");
            stepsHTML2 = '<details style="margin-top:4px"><summary style="font-size:10px;color:var(--text-muted);cursor:pointer;list-style:none">' + stepsRaw.split("|").length + ' b??c</summary><div style="padding:6px 8px;margin-top:4px;background:var(--bg-hover);border-radius:4px">' + stepItems + '</div></details>';
          }
          var outputLine2 = (d.morning && d.morning["Output " + i] && d.morning["Output " + i] !== "-") ? '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">? ' + d.morning["Output " + i] + '</div>' : "";
          taskCols +=
            '<td style="font-size:12px;color:var(--text-primary);min-width:140px">' + (title || "-") + outputLine2 + stepsHTML2 + '</td>' +
            '<td style="font-size:11px;color:var(--text-secondary);white-space:nowrap">' + plan + '</td>' +
            '<td>' + (prog ? '<span class="progress-badge ' + pc + '">' + prog + '</span>' : '<span style="color:var(--text-muted)">-</span>') + '</td>' +
            '<td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);white-space:nowrap">' + time + '</td>';
        }
        return '<tr><td style="font-weight:500;white-space:nowrap;vertical-align:middle"><button class="bd-member-name-btn" data-member="' + name + '" style="background:none;border:none;color:var(--accent);font-size:13px;font-weight:500;cursor:pointer;padding:0;font-family:var(--font-body);text-decoration:underline;text-decoration-color:rgba(255,147,51,0.3);text-underline-offset:3px;white-space:nowrap" title="Xem l?ch s? submit">' + name + '</button></td><td style="vertical-align:middle">' + mCell + '</td><td style="vertical-align:middle">' + eCell + '</td>' + taskCols + '</tr>';
      }).join("");
      var mCount = Object.values(byMember).filter(function(d) { return d.morning; }).length;
      var eCount = Object.values(byMember).filter(function(d) { return d.evening; }).length;
      detail.innerHTML =
        '<div class="members-section" style="overflow-x:auto">' +
          '<div class="section-header"><span class="section-title">Chi tiet ngay ' + dateStr + '</span><span class="section-meta">' + mCount + ' morning ? ' + eCount + ' evening</span></div>' +
          '<table class="members-table" style="min-width:100%;table-layout:auto"><thead><tr><th>Thanh vien</th><th>Morning</th><th>Evening</th><th>Task 1</th><th>Plan</th><th>Actual</th><th>Time</th><th>Task 2</th><th>Plan</th><th>Actual</th><th>Time</th></tr></thead><tbody>' + memberRows + '</tbody></table>' +
        '</div>';
    };

    var chartHTML =
      '<div class="members-section" style="margin-bottom:0">' +
        '<div class="section-header">' +
          '<span class="section-title">Lich su submit</span>' +
          '<div style="display:flex;gap:12px;align-items:center">' +
            '<div style="display:flex;gap:10px;align-items:center;font-size:11px;color:var(--text-muted)">' +
              '<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:var(--accent);display:inline-block"></span>Morning</span>' +
              '<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:var(--yellow);display:inline-block"></span>Evening</span>' +
            '</div>' +
            '<select id="bd-chart-range" style="background:var(--bg-hover);border:1px solid var(--border-strong);color:var(--text-primary);font-size:12px;padding:4px 10px;border-radius:var(--radius-sm);cursor:pointer;outline:none">' +
              '<option value="7" selected>7 ngay</option>' +
              '<option value="14">2 tuan</option>' +
              '<option value="21">3 tuan</option>' +
              '<option value="30">1 thang</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div id="bd-chart-container" class="chart-wrap"></div>' +
        '<div id="bd-day-detail" style="display:none;margin-top:16px"></div>' +
      '</div>';

    var maxTasks = 0;
    data.memberNames.forEach(function(name) {
      var m = data.todayMorning[name];
      if (m && m.tasks) maxTasks = Math.max(maxTasks, m.tasks.length);
    });
    maxTasks = Math.max(maxTasks, 1);

    var thHeaders = '<th>Thanh vien</th><th>Morning</th><th>Evening</th>';
    for (var ti = 0; ti < maxTasks; ti++) thHeaders += '<th>Task ' + (ti+1) + '</th><th>Plan</th><th>Actual</th><th>Time</th>';

    var memberRows = data.memberNames.map(function(name) {
      var morning = data.todayMorning[name], evening = data.todayEvening[name];
      var mCell = morning
        ? '<span class="status-pill submitted" style="font-size:10px;white-space:nowrap">?? Submit</span><br><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + (morning.submittedAt || "") + '</span>'
        : '<span class="status-pill missing" style="font-size:10px;white-space:nowrap">? Chua</span>';
      var eCell = evening
        ? '<span class="status-pill submitted" style="font-size:10px;white-space:nowrap">? Submit</span><br><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + (evening.submittedAt || "") + '</span>'
        : '<span class="status-pill missing" style="font-size:10px;white-space:nowrap">? Chua</span>';
      var taskCols = "";
      for (var ti = 0; ti < maxTasks; ti++) {
        var t      = morning && morning.tasks ? morning.tasks[ti] : null;
        var actual = evening && evening.tasks ? evening.tasks[ti] : null;
        var prog   = actual ? actual.progress  : null;
        var time   = actual ? actual.timeSpent : null;
        var pc     = prog === "100%" ? "done" : prog && parseInt(prog) >= 60 ? "high" : "medium";
        // Steps breakdown
        var stepsHTML = "";
        if (t && t.steps && t.steps.length) {
          var stepLines = t.steps.map(function(s, si) {
            var progClass = actual && actual.steps && actual.steps[si] ? actual.steps[si].progress : "";
            return '<div style="display:flex;align-items:flex-start;gap:6px;padding:2px 0">' +
              '<span style="font-size:10px;color:var(--text-muted);flex-shrink:0;margin-top:1px">' + (si+1) + '.</span>' +
              '<span style="font-size:11px;color:var(--text-secondary)">' + s.what + (s.output ? '<span style="color:var(--text-muted)"> > ' + s.output + '</span>' : '') + '</span>' +
            '</div>';
          }).join("");
          stepsHTML = '<details style="margin-top:4px"><summary style="font-size:10px;color:var(--text-muted);cursor:pointer;list-style:none;display:flex;align-items:center;gap:4px"><i class="ti ti-list-details" style="font-size:10px"></i> ' + t.steps.length + ' b??c</summary><div style="margin-top:4px;padding:6px 8px;background:var(--bg-hover);border-radius:4px">' + stepLines + '</div></details>';
        }
        var outputLine = (t && t.output && t.output !== "-") ? '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">? ' + t.output + '</div>' : "";
        taskCols +=
          '<td style="font-size:12px;color:var(--text-primary);min-width:140px">' + (t ? (t.title||"-") : "-") + outputLine + stepsHTML + '</td>' +
          '<td style="font-size:11px;color:var(--text-secondary);white-space:nowrap">'                                                      + (t ? (t.expectedTime||"-") : "-") + '</td>' +
          '<td>' + (prog ? '<span class="progress-badge ' + pc + '">' + prog + '</span>' : '<span style="color:var(--text-muted)">-</span>') + '</td>' +
          '<td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);white-space:nowrap">'                             + (time || "-")                     + '</td>';
      }
      return '<tr><td style="font-weight:500;white-space:nowrap;vertical-align:middle"><button class="bd-member-name-btn" data-member="' + name + '" style="background:none;border:none;color:var(--accent);font-size:13px;font-weight:500;cursor:pointer;padding:0;font-family:var(--font-body);text-decoration:underline;text-decoration-color:rgba(255,147,51,0.3);text-underline-offset:3px;white-space:nowrap" title="Xem l?ch s? submit">' + name + '</button></td><td style="vertical-align:middle">' + mCell + '</td><td style="vertical-align:middle">' + eCell + '</td>' + taskCols + '</tr>';
    }).join("");

    var membersHTML =
      '<div class="members-section" style="overflow-x:auto">' +
        '<div class="section-header"><span class="section-title">Trang thai hom nay</span><span class="section-meta">' + data.todayStr + '</span></div>' +
        '<table class="members-table" style="min-width:100%;table-layout:auto"><thead><tr>' + thHeaders + '</tr></thead><tbody>' + memberRows + '</tbody></table>' +
      '</div>';

    var infoHTML =
      '<div class="tool-info-page">' +
        '<div class="tool-info-hero"><div class="tool-info-icon"><i class="ti ti-sun-moon"></i></div><div><h2 class="tool-info-name">BD-MKT Daily Report</h2><p class="tool-info-tagline">Tracking morning/evening submit va plan vs actual cua team BD-MKT.</p></div></div>' +
        '<div class="tool-info-section"><div class="tool-info-section-title"><i class="ti ti-info-circle"></i> Mo ta</div><p class="tool-info-text">Moi ngay team BD-MKT dien 2 form: Morning (plan task + output du kien) va Evening (actual progress). Dashboard tong hop ti le submit va so sanh plan vs actual.</p></div>' +
        '<div class="tool-info-grid">' +
          '<div class="tool-info-section"><div class="tool-info-section-title"><i class="ti ti-settings"></i> Cau hinh</div><div class="tool-info-kv"><div class="kv-row"><span class="kv-key">Timezone</span><span class="kv-val">Asia/Ho_Chi_Minh</span></div><div class="kv-row"><span class="kv-key">Tan suat</span><span class="kv-val">Hang ngay (Thu 2 ? Thu 6)</span></div><div class="kv-row"><span class="kv-key">Platform</span><span class="kv-val">Lark / Feishu</span></div></div></div>' +
          '<div class="tool-info-section"><div class="tool-info-section-title"><i class="ti ti-database"></i> Data source</div><div class="tool-info-kv"><div class="kv-row"><span class="kv-key">Source</span><span class="kv-val">Google Sheets</span></div><div class="kv-row"><span class="kv-key">Sheet</span><span class="kv-val kv-mono">BD-MKT-L&D-Daily Report</span></div><div class="kv-row"><span class="kv-key">Method</span><span class="kv-val kv-mono">CSV export</span></div></div></div>' +
        '</div>' +
      '</div>';

    window._bdTrackingHTML = statsHTML + chartHTML + membersHTML;
    window._bdInfoHTML     = infoHTML;

    /* -- Member History Modal -- */
    window._bdOpenMemberHistory = function(memberName) {
      var allRows  = (window._bdData && window._bdData.allRows) || [];
      var existing = document.getElementById("bd-member-modal");
      if (existing) existing.remove();

      var currentTab   = "days";
      var currentRange = 14;
      var currentMonth = (function() {
        var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
        return { y: now.getFullYear(), m: now.getMonth() };
      })();

      /* -- Helpers -- */
      function dateStr(d) {
        return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
      }
      function getMemberRows(ds) {
        return allRows.filter(function(r) { return r["Date"] === ds && r["Member"] === memberName; });
      }
      function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }

      /* -- Dashboard mini stats -- */
      function buildMiniDashboard() {
        var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));

        // Thang nay
        var y = now.getFullYear(), m = now.getMonth();
        var daysInMonth = new Date(y, m+1, 0).getDate();
        var monthWorkdays = 0, monthSubmit = 0, monthBoth = 0;
        for (var di = 1; di <= daysInMonth; di++) {
          var d = new Date(y, m, di);
          if (isWeekend(d)) continue;
          monthWorkdays++;
          var rows = getMemberRows(dateStr(d));
          var hasMorning = rows.some(function(r) { return r["Type"] === "morning"; });
          var hasEvening = rows.some(function(r) { return r["Type"] === "evening"; });
          if (hasMorning) monthSubmit++;
          if (hasMorning && hasEvening) monthBoth++;
        }
        var monthRate = monthWorkdays > 0 ? Math.round(monthSubmit / monthWorkdays * 100) : 0;

        // Streak hien tai
        var streak = 0;
        var check = new Date(now);
        while (true) {
          if (isWeekend(check)) { check.setDate(check.getDate() - 1); continue; }
          var rows2 = getMemberRows(dateStr(check));
          if (rows2.some(function(r) { return r["Type"] === "morning"; })) {
            streak++;
            check.setDate(check.getDate() - 1);
          } else { break; }
        }

        // Ngay hay miss nhat (7 ngay qua)
        var missDays = { "T2":0,"T3":0,"T4":0,"T5":0,"T6":0 };
        var dayNames = ["CN","T2","T3","T4","T5","T6","T7"];
        for (var i = 1; i <= 30; i++) {
          var d2 = new Date(now); d2.setDate(d2.getDate() - i);
          if (isWeekend(d2)) continue;
          var dn = dayNames[d2.getDay()];
          var rows3 = getMemberRows(dateStr(d2));
          if (!rows3.some(function(r) { return r["Type"] === "morning"; })) {
            missDays[dn] = (missDays[dn] || 0) + 1;
          }
        }
        var mostMissDay = Object.keys(missDays).reduce(function(a, b) { return missDays[a] > missDays[b] ? a : b; }, "T2");
        var mostMissCount = missDays[mostMissDay];

        // Lan submit gan nhat
        var lastSubmit = "-";
        for (var i2 = 0; i2 < 30; i2++) {
          var d3 = new Date(now); d3.setDate(d3.getDate() - i2);
          var rows4 = getMemberRows(dateStr(d3));
          if (rows4.some(function(r) { return r["Type"] === "morning"; })) {
            lastSubmit = i2 === 0 ? "H?m nay" : i2 === 1 ? "H?m qua" : i2 + " ng?y tr??c";
            break;
          }
        }

        var rateColor = monthRate >= 80 ? "var(--green)" : monthRate >= 50 ? "var(--accent)" : "var(--red)";

        return '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px;margin-bottom:16px">' +
          '<p style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px">Dashboard th?ng n?y</p>' +
          '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px">' +
            '<div style="text-align:center;padding:10px 6px;background:var(--bg-surface);border-radius:6px">' +
              '<div style="font-size:20px;font-weight:700;color:' + rateColor + '">' + monthRate + '%</div>' +
              '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">T? l? th?ng</div>' +
            '</div>' +
            '<div style="text-align:center;padding:10px 6px;background:var(--bg-surface);border-radius:6px">' +
              '<div style="font-size:20px;font-weight:700;color:var(--accent)">' + streak + '</div>' +
              '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">Streak ?</div>' +
            '</div>' +
            '<div style="text-align:center;padding:10px 6px;background:var(--bg-surface);border-radius:6px">' +
              '<div style="font-size:20px;font-weight:700;color:var(--blue)">' + monthBoth + '</div>' +
              '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">C? 2 bu?i</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
            '<div style="padding:8px 10px;background:var(--bg-surface);border-radius:6px;display:flex;align-items:center;justify-content:space-between">' +
              '<span style="font-size:10px;color:var(--text-muted)">Hay miss nh?t</span>' +
              '<span style="font-size:11px;font-weight:600;color:' + (mostMissCount > 0 ? "var(--red)" : "var(--green)") + '">' + (mostMissCount > 0 ? mostMissDay + " (" + mostMissCount + "x)" : "Kh?ng c?") + '</span>' +
            '</div>' +
            '<div style="padding:8px 10px;background:var(--bg-surface);border-radius:6px;display:flex;align-items:center;justify-content:space-between">' +
              '<span style="font-size:10px;color:var(--text-muted)">Submit g?n nh?t</span>' +
              '<span style="font-size:11px;font-weight:600;color:var(--text-primary)">' + lastSubmit + '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
      }

      /* -- Tab Ngay: list theo range -- */
      function buildDaysTab(range) {
        var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
        var days = [];
        for (var i = range - 1; i >= 0; i--) {
          var d = new Date(now); d.setDate(d.getDate() - i);
          var ds = dateStr(d);
          var dayName = ["CN","T2","T3","T4","T5","T6","T7"][d.getDay()];
          var rows = getMemberRows(ds);
          days.push({
            ds: ds,
            lbl: String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0"),
            dayName: dayName,
            isWeekend: isWeekend(d),
            morning: rows.find(function(r) { return r["Type"] === "morning"; }),
            evening: rows.find(function(r) { return r["Type"] === "evening"; })
          });
        }

        var submitCount = days.filter(function(d) { return !d.isWeekend && d.morning; }).length;
        var bothCount   = days.filter(function(d) { return !d.isWeekend && d.morning && d.evening; }).length;
        var workdays    = days.filter(function(d) { return !d.isWeekend; }).length;
        var rate        = workdays > 0 ? Math.round(submitCount / workdays * 100) : 0;

        var statsRow =
          '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">' +
            '<div style="text-align:center;padding:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px">' +
              '<div style="font-size:18px;font-weight:700;color:var(--text-primary)">' + submitCount + '</div>' +
              '<div style="font-size:10px;color:var(--text-muted)">Ng?y c? morning</div>' +
            '</div>' +
            '<div style="text-align:center;padding:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px">' +
              '<div style="font-size:18px;font-weight:700;color:' + (rate >= 80 ? "var(--green)" : rate >= 50 ? "var(--accent)" : "var(--red)") + '">' + rate + '%</div>' +
              '<div style="font-size:10px;color:var(--text-muted)">T? l? submit</div>' +
            '</div>' +
            '<div style="text-align:center;padding:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px">' +
              '<div style="font-size:18px;font-weight:700;color:var(--blue)">' + bothCount + '</div>' +
              '<div style="font-size:10px;color:var(--text-muted)">?? c? 2 bu?i</div>' +
            '</div>' +
          '</div>';

        var daysHTML = days.map(function(d) {
          if (d.isWeekend) return "";
          var mStatus = d.morning
            ? '<span style="font-size:10px;background:var(--green-dim);color:var(--green);padding:2px 7px;border-radius:10px">?? ' + (d.morning["Submitted At"] || "submit") + '</span>'
            : '<span style="font-size:10px;background:var(--red-dim);color:var(--red);padding:2px 7px;border-radius:10px">? Ch?a</span>';
          var eStatus = d.evening
            ? '<span style="font-size:10px;background:var(--blue-dim);color:var(--blue);padding:2px 7px;border-radius:10px">? ' + (d.evening["Submitted At"] || "submit") + '</span>'
            : '<span style="font-size:10px;background:var(--bg-hover);color:var(--text-muted);padding:2px 7px;border-radius:10px">? Ch?a</span>';

          var tasksHTML = "";
          if (d.morning) {
            for (var ti = 1; ti <= 2; ti++) {
              var title = d.morning["Task " + ti]; if (!title) continue;
              var expected = d.morning["Expected " + ti] || "-";
              var steps    = d.morning["Steps " + ti] || "";
              var prog     = d.evening ? (d.evening["Progress " + ti] || "") : "";
              var spent    = d.evening ? (d.evening["TimeSpent " + ti] || "-") : "-";
              var pc = prog === "100%" ? "var(--green)" : prog && parseInt(prog) >= 60 ? "var(--accent)" : "var(--yellow)";
              var stepsStr = "";
              if (steps) {
                stepsStr = "<div style='margin-top:4px;display:flex;flex-direction:column;gap:2px'>" +
                  steps.split("|").map(function(s, si) {
                    var t2 = s.trim().replace(/^\d+\.\s*/, "");
                    var ai = t2.indexOf(">");
                    var what = ai > -1 ? t2.slice(0, ai).trim() : t2;
                    var out  = ai > -1 ? t2.slice(ai+1).trim() : "";
                    return '<div style="font-size:10px;color:var(--text-muted)">' + (si+1) + '. ' + what + (out ? ' > ' + out : '') + '</div>';
                  }).join("") + "</div>";
              }
              tasksHTML +=
                '<div style="margin-top:6px;padding:7px 9px;background:var(--bg-hover);border-radius:4px">' +
                  '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">' +
                    '<div style="flex:1"><div style="font-size:11px;font-weight:500;color:var(--text-primary)">' + ti + '. ' + title + '</div>' + stepsStr + '</div>' +
                    '<div style="flex-shrink:0;text-align:right">' +
                      '<div style="font-size:10px;color:var(--text-muted)">Plan: ' + expected + '</div>' +
                      (prog ? '<div style="font-size:11px;font-weight:600;color:' + pc + ';margin-top:1px">' + prog + '</div>' : '') +
                      (spent !== "-" ? '<div style="font-size:10px;color:var(--text-muted)">' + spent + '</div>' : '') +
                    '</div>' +
                  '</div>' +
                '</div>';
            }
          }

          return '<div style="border-bottom:1px solid var(--border);padding:10px 0">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
              '<div style="font-size:12px;font-weight:600;color:var(--text-primary);flex-shrink:0">' + d.dayName + ' ' + d.lbl + '</div>' +
              '<div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:flex-end">' + mStatus + eStatus + '</div>' +
            '</div>' +
            (tasksHTML ? '<div style="margin-top:4px">' + tasksHTML + '</div>' : '') +
          '</div>';
        }).join("");

        return statsRow + (daysHTML || '<div style="padding:20px;text-align:center;color:var(--text-muted)">Ch?a c? d? li?u</div>');
      }

      /* -- Tab Thang: calendar + bar chart theo tuan -- */
      function buildMonthTab(y, m) {
        var monthName = ["Th?ng 1","Th?ng 2","Th?ng 3","Th?ng 4","Th?ng 5","Th?ng 6","Th?ng 7","Th?ng 8","Th?ng 9","Th?ng 10","Th?ng 11","Th?ng 12"][m];
        var daysInMonth = new Date(y, m+1, 0).getDate();
        var firstDay = new Date(y, m, 1).getDay();
        var dayNames = ["CN","T2","T3","T4","T5","T6","T7"];

        // Build calendar data
        var calData = {};
        for (var di = 1; di <= daysInMonth; di++) {
          var d = new Date(y, m, di);
          var ds = dateStr(d);
          var rows = getMemberRows(ds);
          calData[di] = {
            morning: rows.some(function(r) { return r["Type"] === "morning"; }),
            evening: rows.some(function(r) { return r["Type"] === "evening"; }),
            isWeekend: isWeekend(d)
          };
        }

        // Calendar grid
        var calCells = "";
        dayNames.forEach(function(n) {
          calCells += '<div style="font-size:10px;font-weight:600;color:var(--text-muted);text-align:center;padding:4px 0">' + n + '</div>';
        });
        // Empty cells truoc ngay 1
        var startDay = firstDay === 0 ? 6 : firstDay - 1; // Mon=0
        // Doi sang Mon-start
        var startDayAdj = new Date(y, m, 1).getDay();
        startDayAdj = startDayAdj === 0 ? 6 : startDayAdj - 1;
        for (var e = 0; e < startDayAdj; e++) {
          calCells += '<div></div>';
        }
        for (var di2 = 1; di2 <= daysInMonth; di2++) {
          var cd = calData[di2];
          var bg, border;
          if (cd.isWeekend) {
            bg = "transparent"; border = "none";
          } else if (cd.morning && cd.evening) {
            bg = "var(--green-dim)"; border = "1px solid var(--green)";
          } else if (cd.morning) {
            bg = "var(--accent-dim)"; border = "1px solid var(--accent)";
          } else {
            bg = "var(--red-dim)"; border = "1px solid transparent";
          }
          var dot = cd.isWeekend ? "" :
            (cd.morning && cd.evening ? '<div style="width:4px;height:4px;border-radius:50%;background:var(--green);margin:1px auto 0"></div>' :
             cd.morning ? '<div style="width:4px;height:4px;border-radius:50%;background:var(--accent);margin:1px auto 0"></div>' :
             '<div style="width:4px;height:4px;border-radius:50%;background:var(--red);margin:1px auto 0"></div>');
          calCells += '<div style="background:' + bg + ';border:' + border + ';border-radius:4px;padding:4px 2px;text-align:center;' + (cd.isWeekend ? 'opacity:.3' : '') + '">' +
            '<div style="font-size:11px;font-weight:500;color:var(--text-primary)">' + di2 + '</div>' +
            dot +
          '</div>';
        }

        // Bar chart theo tuan
        var weeks = [];
        var wIdx = 0;
        for (var di3 = 1; di3 <= daysInMonth; di3++) {
          var d3 = new Date(y, m, di3);
          if (!weeks[wIdx]) weeks[wIdx] = { morning: 0, evening: 0, workdays: 0 };
          if (!isWeekend(d3)) {
            weeks[wIdx].workdays++;
            var cd3 = calData[di3];
            if (cd3.morning) weeks[wIdx].morning++;
            if (cd3.evening) weeks[wIdx].evening++;
          }
          if (d3.getDay() === 0 && di3 < daysInMonth) wIdx++;
        }

        var barHTML = weeks.map(function(w, wi) {
          if (w.workdays === 0) return "";
          var mPct = Math.round(w.morning / w.workdays * 100);
          var ePct = Math.round(w.evening / w.workdays * 100);
          return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">' +
            '<div style="width:100%;display:flex;gap:2px;align-items:flex-end;height:48px">' +
              '<div style="flex:1;background:var(--accent);border-radius:2px 2px 0 0;height:' + Math.max(mPct, 4) + '%;opacity:.85"></div>' +
              '<div style="flex:1;background:var(--blue);border-radius:2px 2px 0 0;height:' + Math.max(ePct, 4) + '%;opacity:.85"></div>' +
            '</div>' +
            '<div style="font-size:9px;color:var(--text-muted)">T' + (wi+1) + '</div>' +
            '<div style="font-size:9px;color:var(--text-muted)">' + mPct + '/' + ePct + '%</div>' +
          '</div>';
        }).join("");

        // Legend
        var totalWork = Object.values(calData).filter(function(d) { return !d.isWeekend; }).length;
        var totalMorn = Object.values(calData).filter(function(d) { return !d.isWeekend && d.morning; }).length;
        var totalBoth = Object.values(calData).filter(function(d) { return !d.isWeekend && d.morning && d.evening; }).length;
        var mRate = totalWork > 0 ? Math.round(totalMorn / totalWork * 100) : 0;

        return '<div>' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
            '<p style="font-size:13px;font-weight:600;color:var(--text-primary)">' + monthName + ' ' + y + '</p>' +
            '<div style="display:flex;gap:8px">' +
              '<span style="font-size:11px;font-weight:700;color:' + (mRate >= 80 ? "var(--green)" : mRate >= 50 ? "var(--accent)" : "var(--red)") + '">' + mRate + '%</span>' +
              '<span style="font-size:11px;color:var(--text-muted)">' + totalMorn + '/' + totalWork + ' ng?y</span>' +
              '<span style="font-size:11px;color:var(--blue)">' + totalBoth + ' c? 2</span>' +
            '</div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:16px">' + calCells + '</div>' +
          '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">' +
            '<span style="font-size:10px;color:var(--text-muted)">Theo tu?n:</span>' +
            '<div style="display:flex;gap:6px;align-items:center;font-size:9px;color:var(--text-muted)">' +
              '<span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;background:var(--accent);border-radius:1px;display:inline-block"></span>Morning</span>' +
              '<span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;background:var(--blue);border-radius:1px;display:inline-block"></span>Evening</span>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:4px;align-items:flex-end;height:60px;margin-bottom:12px">' + barHTML + '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:10px;color:var(--text-muted)">' +
            '<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:var(--green-dim);border:1px solid var(--green);border-radius:2px;display:inline-block"></span>C? 2 bu?i</span>' +
            '<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:var(--accent-dim);border:1px solid var(--accent);border-radius:2px;display:inline-block"></span>Morning only</span>' +
            '<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:var(--red-dim);border-radius:2px;display:inline-block"></span>Ch?a submit</span>' +
          '</div>' +
        '</div>';
      }

      /* -- Modal DOM -- */
      var modal = document.createElement("div");
      modal.id = "bd-member-modal";
      modal.style.cssText = "position:fixed;inset:0;z-index:300;display:flex;align-items:flex-start;justify-content:flex-end";

      var overlay = document.createElement("div");
      overlay.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(3px)";
      overlay.addEventListener("click", function() { modal.remove(); });

      var panel = document.createElement("div");
      panel.style.cssText = "position:relative;z-index:1;width:500px;max-width:95vw;height:100vh;background:var(--bg-surface);border-left:1px solid var(--border-strong);display:flex;flex-direction:column;box-shadow:-8px 0 40px rgba(0,0,0,.4);animation:slideInRight .28s cubic-bezier(0.22,1,0.36,1)";

      function renderPanel() {
        var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
        var monthLabel = ["Th1","Th2","Th3","Th4","Th5","Th6","Th7","Th8","Th9","Th10","Th11","Th12"][currentMonth.m] + "/" + currentMonth.y;

        panel.innerHTML =
          "<style>@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}</style>" +
          // Header
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0">' +
            '<div>' +
              '<p style="font-family:var(--font-display);font-size:15px;font-weight:600;color:var(--text-primary)">' + memberName + '</p>' +
              '<p style="font-size:11px;color:var(--text-muted);margin-top:1px">L?ch s? submit</p>' +
            '</div>' +
            '<button id="bd-member-modal-close" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:4px;display:flex;align-items:center"><i class="ti ti-x"></i></button>' +
          '</div>' +
          // Tab bar
          '<div style="display:flex;border-bottom:1px solid var(--border);flex-shrink:0">' +
            '<button class="bd-tab-switch" data-tab="days" style="flex:1;padding:10px;border:none;background:none;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-body);color:' + (currentTab === "days" ? "var(--accent)" : "var(--text-muted)") + ';border-bottom:2px solid ' + (currentTab === "days" ? "var(--accent)" : "transparent") + ';transition:all .15s">Theo ng?y</button>' +
            '<button class="bd-tab-switch" data-tab="month" style="flex:1;padding:10px;border:none;background:none;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font-body);color:' + (currentTab === "month" ? "var(--accent)" : "var(--text-muted)") + ';border-bottom:2px solid ' + (currentTab === "month" ? "var(--accent)" : "transparent") + ';transition:all .15s">Theo th?ng</button>' +
          '</div>' +
          // Body
          '<div id="bd-member-modal-body" style="flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column">' +
            buildMiniDashboard() +
            (currentTab === "days"
              ? // Range selector + days
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
                  '<p style="font-size:11px;font-weight:600;color:var(--text-muted)">L?ch s? g?n ??y</p>' +
                  '<div style="display:flex;background:var(--bg-card);border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden">' +
                    [7,14,30].map(function(r) {
                      return '<button class="bd-range-btn" data-range="' + r + '" style="padding:4px 10px;border:none;background:' + (r === currentRange ? "var(--accent)" : "none") + ';color:' + (r === currentRange ? "#000" : "var(--text-muted)") + ';font-size:11px;font-weight:' + (r === currentRange ? "600" : "400") + ';cursor:pointer;font-family:var(--font-body)">' + r + 'N</button>';
                    }).join("") +
                  '</div>' +
                '</div>' +
                buildDaysTab(currentRange)
              : // Month nav + calendar
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
                  '<p style="font-size:11px;font-weight:600;color:var(--text-muted)">' + monthLabel + '</p>' +
                  '<div style="display:flex;gap:4px">' +
                    '<button id="bd-month-prev" style="background:var(--bg-card);border:1px solid var(--border-strong);border-radius:4px;width:28px;height:28px;cursor:pointer;color:var(--text-muted);font-size:13px;display:flex;align-items:center;justify-content:center"><i class="ti ti-chevron-left"></i></button>' +
                    '<button id="bd-month-next" style="background:var(--bg-card);border:1px solid var(--border-strong);border-radius:4px;width:28px;height:28px;cursor:pointer;color:var(--text-muted);font-size:13px;display:flex;align-items:center;justify-content:center"><i class="ti ti-chevron-right"></i></button>' +
                  '</div>' +
                '</div>' +
                buildMonthTab(currentMonth.y, currentMonth.m)
            ) +
          '</div>';

        // Events
        panel.querySelector("#bd-member-modal-close").addEventListener("click", function() { modal.remove(); });

        panel.querySelectorAll(".bd-tab-switch").forEach(function(btn) {
          btn.addEventListener("click", function() {
            currentTab = btn.dataset.tab;
            renderPanel();
          });
        });

        panel.querySelectorAll(".bd-range-btn").forEach(function(btn) {
          btn.addEventListener("click", function() {
            currentRange = parseInt(btn.dataset.range);
            renderPanel();
          });
        });

        var prevBtn = panel.querySelector("#bd-month-prev");
        var nextBtn = panel.querySelector("#bd-month-next");
        if (prevBtn) prevBtn.addEventListener("click", function() {
          currentMonth.m--;
          if (currentMonth.m < 0) { currentMonth.m = 11; currentMonth.y--; }
          renderPanel();
        });
        if (nextBtn) nextBtn.addEventListener("click", function() {
          var now2 = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
          if (currentMonth.y < now2.getFullYear() || (currentMonth.y === now2.getFullYear() && currentMonth.m < now2.getMonth())) {
            currentMonth.m++;
            if (currentMonth.m > 11) { currentMonth.m = 0; currentMonth.y++; }
            renderPanel();
          }
        });
      }

      renderPanel();
      modal.appendChild(overlay);
      modal.appendChild(panel);
      document.body.appendChild(modal);
    };

    window._initBDTabs = function() {
      var tracking = document.getElementById("tab-tracking");
      var info     = document.getElementById("tab-info");
      if (tracking) tracking.innerHTML = window._bdTrackingHTML;
      if (info)     info.innerHTML     = window._bdInfoHTML;

      setTimeout(function() {
        if (window._buildBDChart) {
          window._buildBDChart(7);
          var sel = document.getElementById("bd-chart-range");
          if (sel) sel.addEventListener("change", function() { window._buildBDChart(parseInt(this.value)); });
        }

        /* Insight FAB */
        var fab = document.getElementById("bd-insight-fab");
        if (fab) fab.addEventListener("click", function() { _bdOpenInsightPanel(window._bdData || {}, false); });

        /* Weekly view nav button */
        if (window._bdWeeklyView) window._bdWeeklyView.injectNavButton();

        /* Member name click -> history modal */
        document.querySelectorAll(".bd-member-name-btn").forEach(function(btn) {
          btn.addEventListener("click", function(e) {
            e.stopPropagation();
            window._bdOpenMemberHistory(btn.dataset.member);
          });
        });
      }, 50);

      document.querySelectorAll(".tab-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
          document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
          document.querySelectorAll(".tab-pane").forEach(function(p) { p.style.display = "none"; });
          btn.classList.add("active");
          var target = document.getElementById("tab-" + btn.dataset.tab);
          if (target) target.style.display = "block";
          if (btn.dataset.tab === "tracking") {
            setTimeout(function() {
              if (window._buildBDChart) {
                var sel = document.getElementById("bd-chart-range");
                window._buildBDChart(sel ? parseInt(sel.value) : 7);
              }
              /* Re-bind sau khi switch tab */
              document.querySelectorAll(".bd-member-name-btn").forEach(function(b) {
                b.addEventListener("click", function(e) {
                  e.stopPropagation();
                  window._bdOpenMemberHistory(b.dataset.member);
                });
              });
            }, 50);
          }
        });
      });
    };

    return tabBar;
  }
});

/* ================================================================
   BD-MKT Weekly View -- inject nav button + full-screen table view
   ================================================================ */

window._bdWeeklyView = (function() {
  var currentWeekOffset = 0; // 0 = tuan nay, -1 = tuan truoc, ...

  function getWeekDates(offset) {
    var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    var day = now.getDay();
    var diffToMon = day === 0 ? -6 : 1 - day;
    var mon = new Date(now);
    mon.setDate(now.getDate() + diffToMon + offset * 7);
    var days = [];
    for (var i = 0; i < 5; i++) {
      var d = new Date(mon);
      d.setDate(mon.getDate() + i);
      var ds = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
      var lbl = String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0");
      var dayNames = ["CN","T2","T3","T4","T5","T6","T7"];
      days.push({ ds: ds, lbl: lbl, dayName: dayNames[d.getDay()] });
    }
    return days;
  }

  function buildWeekLabel(offset) {
    var days = getWeekDates(offset);
    return "Tu?n " + days[0].lbl + " - " + days[4].lbl;
  }

  function buildCellHTML(member, ds, allRows) {
    var rows = allRows.filter(function(r) { return r["Member"] === member && r["Date"] === ds; });
    var morning = rows.find(function(r) { return r["Type"] === "morning"; });
    var evening = rows.find(function(r) { return r["Type"] === "evening"; });

    if (!morning) {
      return '<div style="height:100%;min-height:60px;display:flex;align-items:center;justify-content:center">' +
        '<span style="font-size:10px;color:var(--text-muted);opacity:.5">-</span>' +
      '</div>';
    }

    var tasksHTML = "";
    for (var ti = 1; ti <= 2; ti++) {
      var title = morning["Task " + ti]; if (!title) continue;
      var prog  = evening ? (evening["Progress " + ti] || "") : "";
      var plan  = morning["Expected " + ti] || "";
      var spent = evening ? (evening["TimeSpent " + ti] || "") : "";
      var pc = prog === "100%" ? "var(--green)" : prog && parseInt(prog) >= 60 ? "var(--accent)" : prog ? "var(--red)" : "var(--text-muted)";

      tasksHTML +=
        '<div style="padding:6px 8px;background:var(--bg-hover);border-radius:5px;margin-bottom:4px;cursor:pointer" ' +
          'title="' + title.replace(/"/g,"&quot;") + (prog ? " | " + prog : "") + (spent ? " | " + spent : "") + '">' +
          '<div style="font-size:11px;font-weight:500;color:var(--text-primary);line-height:1.4;margin-bottom:3px">' +
            title.slice(0, 60) + (title.length > 60 ? "..." : "") +
          '</div>' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">' +
            '<span style="font-size:10px;color:var(--text-muted)">' + (plan || "-") + '</span>' +
            (prog
              ? '<span style="font-size:10px;font-weight:700;color:' + pc + '">' + prog + '</span>'
              : '<span style="font-size:10px;color:var(--text-muted);opacity:.5">ch?a update</span>'
            ) +
          '</div>' +
        '</div>';
    }

    var submitBadge = '<div style="display:flex;gap:4px;margin-bottom:5px">' +
      '<span style="font-size:9px;background:var(--green-dim);color:var(--green);padding:1px 5px;border-radius:8px">?? ' + (morning["Submitted At"] ? morning["Submitted At"].slice(0,5) : "submit") + '</span>' +
      (evening ? '<span style="font-size:9px;background:var(--blue-dim);color:var(--blue);padding:1px 5px;border-radius:8px">? ' + (evening["Submitted At"] ? evening["Submitted At"].slice(0,5) : "submit") + '</span>' : '') +
    '</div>';

    return '<div style="padding:8px 6px">' + submitBadge + tasksHTML + '</div>';
  }

  function render(offset) {
    var data    = window._bdData || {};
    var allRows = data.allRows || [];
    var members = data.memberNames || [];
    var days    = getWeekDates(offset);
    var weekLabel = buildWeekLabel(offset);

    // Summary
    var totalSubmit = 0, totalCells = members.length * days.length;
    days.forEach(function(d) {
      members.forEach(function(m) {
        var hasM = allRows.some(function(r) { return r["Member"] === m && r["Date"] === d.ds && r["Type"] === "morning"; });
        if (hasM) totalSubmit++;
      });
    });
    var submitRate = totalCells > 0 ? Math.round(totalSubmit / totalCells * 100) : 0;
    var rateColor = submitRate >= 80 ? "var(--green)" : submitRate >= 50 ? "var(--accent)" : "var(--red)";

    var colWidth = "calc((100% - 120px) / 5)";

    var html =
      '<div style="display:flex;flex-direction:column;height:100%">' +

      // Topbar
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg-surface)">' +
        '<div style="display:flex;align-items:center;gap:16px">' +
          '<button id="bd-weekly-back" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:13px;display:flex;align-items:center;gap:5px;padding:6px 10px;border-radius:var(--radius-sm)">' +
            '<i class="ti ti-arrow-left"></i> Quay l?i' +
          '</button>' +
          '<div>' +
            '<p style="font-family:var(--font-display);font-size:16px;font-weight:600;color:var(--text-primary)">T?ng h?p tu?n</p>' +
            '<p style="font-size:11px;color:var(--text-muted);margin-top:1px">' + weekLabel + '</p>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          '<div style="display:flex;gap:8px;font-size:12px">' +
            '<span style="color:var(--text-muted)">' + totalSubmit + '/' + totalCells + ' submit</span>' +
            '<span style="font-weight:700;color:' + rateColor + '">' + submitRate + '%</span>' +
          '</div>' +
          '<div style="display:flex;background:var(--bg-card);border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden">' +
            '<button id="bd-week-prev" style="padding:6px 12px;border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:13px;display:flex;align-items:center"><i class="ti ti-chevron-left"></i></button>' +
            '<span style="padding:6px 14px;font-size:12px;color:var(--text-primary);font-weight:500;border-left:1px solid var(--border-strong);border-right:1px solid var(--border-strong)">' + (offset === 0 ? "Tu?n n?y" : offset === -1 ? "Tu?n tr??c" : weekLabel) + '</span>' +
            '<button id="bd-week-next" style="padding:6px 12px;border:none;background:none;color:' + (offset >= 0 ? "var(--text-muted);opacity:.3;cursor:default" : "var(--text-muted);cursor:pointer") + ';font-size:13px;display:flex;align-items:center"><i class="ti ti-chevron-right"></i></button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Table
      '<div style="flex:1;overflow:auto;padding:20px 24px">' +
        '<table style="width:100%;border-collapse:collapse;table-layout:fixed">' +
          '<colgroup>' +
            '<col style="width:120px">' +
            [0,1,2,3,4].map(function() { return '<col style="width:' + colWidth + '">'; }).join("") +
          '</colgroup>' +
          '<thead>' +
            '<tr style="background:var(--bg-card)">' +
              '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--text-muted);border-bottom:1px solid var(--border);border-right:1px solid var(--border)">Th?nh vi?n</th>' +
              days.map(function(d) {
                var isToday = d.ds === (function() {
                  var n = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
                  return n.getFullYear() + "-" + String(n.getMonth()+1).padStart(2,"0") + "-" + String(n.getDate()).padStart(2,"0");
                })();
                return '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:' + (isToday ? "var(--accent)" : "var(--text-muted)") + ';border-bottom:1px solid var(--border);border-right:1px solid var(--border);background:' + (isToday ? "var(--accent-dim)" : "transparent") + '">' +
                  '<div>' + d.dayName + '</div>' +
                  '<div style="font-size:12px;font-weight:700;color:' + (isToday ? "var(--accent)" : "var(--text-primary)") + ';margin-top:1px">' + d.lbl + '</div>' +
                '</th>';
              }).join("") +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            members.map(function(member) {
              // Submit rate cua member trong tuan
              var memberSubmit = days.filter(function(d) {
                return allRows.some(function(r) { return r["Member"] === member && r["Date"] === d.ds && r["Type"] === "morning"; });
              }).length;
              var mRate = Math.round(memberSubmit / days.length * 100);
              var mColor = mRate >= 80 ? "var(--green)" : mRate >= 60 ? "var(--accent)" : "var(--red)";

              return '<tr style="border-bottom:1px solid var(--border)">' +
                '<td style="padding:10px 12px;border-right:1px solid var(--border);vertical-align:top;background:var(--bg-card)">' +
                  '<div style="font-size:12px;font-weight:600;color:var(--text-primary)">' + member + '</div>' +
                  '<div style="font-size:10px;font-weight:700;color:' + mColor + ';margin-top:3px">' + mRate + '%</div>' +
                '</td>' +
                days.map(function(d) {
                  var isToday = d.ds === (function() {
                    var n = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
                    return n.getFullYear() + "-" + String(n.getMonth()+1).padStart(2,"0") + "-" + String(n.getDate()).padStart(2,"0");
                  })();
                  return '<td style="padding:0;border-right:1px solid var(--border);vertical-align:top;background:' + (isToday ? "rgba(255,147,51,.04)" : "transparent") + '">' +
                    buildCellHTML(member, d.ds, allRows) +
                  '</td>';
                }).join("") +
              '</tr>';
            }).join("") +
          '</tbody>' +
        '</table>' +
        (members.length === 0 ? '<div style="padding:60px;text-align:center;color:var(--text-muted)"><i class="ti ti-inbox" style="font-size:40px;display:block;margin-bottom:12px"></i>Ch?a c? data - v?o BD-MKT Daily Report tr??c ?? load data</div>' : '') +
      '</div>' +
    '</div>';

    return html;
  }

  return {
    open: function() {
      // Inject view container neu chua co
      var container = document.getElementById("bd-weekly-view");
      if (!container) {
        container = document.createElement("div");
        container.id = "bd-weekly-view";
        container.style.cssText = "position:fixed;inset:0;z-index:150;background:var(--bg-surface);display:none;flex-direction:column;overflow:hidden";
        document.body.appendChild(container);
      }

      currentWeekOffset = 0;
      container.innerHTML = render(currentWeekOffset);
      container.style.display = "flex";

      // Events
      var backBtn = container.querySelector("#bd-weekly-back");
      if (backBtn) backBtn.addEventListener("click", function() {
        container.style.display = "none";
        // Remove active state tren nav
        document.querySelectorAll(".bd-weekly-nav-btn").forEach(function(b) { b.classList.remove("active"); });
      });

      var prevBtn = container.querySelector("#bd-week-prev");
      if (prevBtn) prevBtn.addEventListener("click", function() {
        currentWeekOffset--;
        container.innerHTML = render(currentWeekOffset);
        // Re-bind events sau khi re-render
        window._bdWeeklyView._bindEvents(container);
      });

      var nextBtn = container.querySelector("#bd-week-next");
      if (nextBtn) nextBtn.addEventListener("click", function() {
        if (currentWeekOffset >= 0) return;
        currentWeekOffset++;
        container.innerHTML = render(currentWeekOffset);
        window._bdWeeklyView._bindEvents(container);
      });
    },

    _bindEvents: function(container) {
      var backBtn = container.querySelector("#bd-weekly-back");
      if (backBtn) backBtn.addEventListener("click", function() {
        container.style.display = "none";
        document.querySelectorAll(".bd-weekly-nav-btn").forEach(function(b) { b.classList.remove("active"); });
      });
      var prevBtn = container.querySelector("#bd-week-prev");
      if (prevBtn) prevBtn.addEventListener("click", function() {
        currentWeekOffset--;
        container.innerHTML = render(currentWeekOffset);
        window._bdWeeklyView._bindEvents(container);
      });
      var nextBtn = container.querySelector("#bd-week-next");
      if (nextBtn) nextBtn.addEventListener("click", function() {
        if (currentWeekOffset >= 0) return;
        currentWeekOffset++;
        container.innerHTML = render(currentWeekOffset);
        window._bdWeeklyView._bindEvents(container);
      });
    },

    injectNavButton: function() {
      // Them button vao sidebar nav sau nav-item cua bd-mkt-daily
      var navTools = document.getElementById("nav-tools");
      if (!navTools) return;
      if (document.getElementById("bd-weekly-nav-item")) return; // da co roi

      var item = document.createElement("a");
      item.id   = "bd-weekly-nav-item";
      item.href = "#";
      item.className = "nav-item bd-weekly-nav-btn";
      item.style.cssText = "padding-left:32px"; // indent duoi BD-MKT
      item.innerHTML = '<i class="ti ti-table"></i><span>T?ng h?p tu?n</span>';
      item.addEventListener("click", function(e) {
        e.preventDefault();
        // Bo active tat ca nav items
        document.querySelectorAll(".nav-item").forEach(function(n) { n.classList.remove("active"); });
        item.classList.add("active");
        window._bdWeeklyView.open();
      });

      // Tim nav item cua bd-mkt-daily de insert sau
      var bdNavItem = navTools.querySelector('[data-tool="bd-mkt-daily"]');
      if (bdNavItem && bdNavItem.parentNode) {
        bdNavItem.parentNode.insertBefore(item, bdNavItem.nextSibling);
      } else {
        navTools.appendChild(item);
      }
    }
  };
})();
