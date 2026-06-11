/* ══════════════════════════════════════════════════════════════
   TOOL CONFIG: Daily Update
   ══════════════════════════════════════════════════════════════ */

window.TOOL_REGISTRY = window.TOOL_REGISTRY || [];

/* ── Worker URL ── */
var _DU_WORKER_URL = "https://admin-dashboard.minhwuan889.workers.dev/;

/* ── OpenAI config (dùng chung key với candidate-scoring) ── */
var _DU_OPENAI_KEY   = "sk-PASTE_YOUR_KEY_HERE";


/* ── ISO week helper ── */
function _duGetISOWeek(date) {
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}

/* ── Aggregate daily-update data → summary payload ── */
function _duAggregate(data) {
  var week = _duGetISOWeek(new Date());
  var subs = data._rawSubmissions || [];

  /* Submission rate 7 ngày gần nhất */
  var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  var last7 = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(now); d.setDate(d.getDate() - i);
    var ds = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
    var daySubs = subs.filter(function(s) { return s.date === ds; });
    last7.push({ date: ds, count: daySubs.length, total: data.totalMembers });
  }

  /* Member consistency — submit bao nhiêu ngày trong 7 ngày qua */
  var memberConsistency = {};
  (data.memberStatuses || []).forEach(function(m) {
    var count = subs.filter(function(s) {
      return s.userId === m.userId && last7.some(function(d) { return d.date === s.date; });
    }).length;
    memberConsistency[m.name] = { submittedDays: count, outOf: 7, status: m.status };
  });

  /* Task progress distribution hôm nay */
  var allTasks = data.allTasks || [];
  var progressBuckets = { done: 0, high: 0, medium: 0, low: 0 };
  allTasks.forEach(function(t) {
    var pct = parseInt(t.progress || 0);
    if (pct === 100)      progressBuckets.done++;
    else if (pct >= 60)   progressBuckets.high++;
    else if (pct >= 30)   progressBuckets.medium++;
    else                  progressBuckets.low++;
  });

  /* Avg submission rate 7 ngày */
  var avgRate = last7.length > 0
    ? Math.round(last7.reduce(function(acc, d) {
        return acc + (d.total > 0 ? d.count / d.total * 100 : 0);
      }, 0) / last7.length)
    : 0;

  return {
    generatedWeek:   week,
    today: {
      submissionRate:  data.submissionRate,
      submittedCount:  data.submittedCount,
      missingCount:    data.missingCount,
      totalMembers:    data.totalMembers,
      totalTasks:      allTasks.length,
      progressBuckets: progressBuckets
    },
    last7Days:           last7,
    avgRateLast7:        avgRate,
    memberConsistency:   memberConsistency,
    missingMembers:      (data.memberStatuses || []).filter(function(m) { return m.status === "missing"; }).map(function(m) { return m.name; })
  };
}

/* ── Call OpenAI API ── */
async function _duCallOpenAI(summary) {
  var sysPrompt = 'Bạn là PM assistant của F.Learning Studio. Nhận vào data standup hàng ngày của team, phân tích và trả về insight bằng tiếng Việt. Trả về JSON THUẦN TÚY, không thêm gì ngoài JSON. Format: {"summary":"Tổng quan 1-2 câu về tình hình submit hôm nay","highlights":[{"type":"positive|warning|neutral","text":"Điểm đáng chú ý ngắn gọn"}],"consistencyInsight":"Nhận xét về mức độ consistent khi submit trong 7 ngày qua","taskInsight":"Nhận xét về tình hình task progress hôm nay","weeklyTrend":"Xu hướng submit tuần này so với tuần trước","recommendations":["Cách cụ thể để tăng tỉ lệ submit — thay đổi workflow, reminder, hoặc form"],"toolUsage":"Mô tả cách team đang sử dụng daily update tool và mức độ hiệu quả thực tế","frictions":"Các friction hoặc pattern đang làm giảm tỉ lệ submit — nêu cụ thể dựa trên data","adjustments":"Đề xuất điều chỉnh cụ thể để tăng submission rate: thời gian nhắc, độ dài form, quy trình"}. Nếu có member missing, đề cập nhưng không nêu tên. Highlights tối đa 4. Recommendations tối đa 3. Mọi nhận xét phải dựa trên số liệu thực tế.';

  var payload = {
    max_tokens:  800,
    temperature: 0.4,
    messages: [
      { role: "system", content: sysPrompt },
      { role: "user",   content: "Data standup tuần " + summary.generatedWeek + ": " + JSON.stringify(summary).replace(/[\u0000-\u001F]/g, "") }
    ]
  };

  var res = await fetch(_DU_WORKER_URL + "/ai-insight", {
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

function _duCacheKey() {
  return "du_insight_" + _duGetISOWeek(new Date());
}

/* ── Render insight panel HTML ── */
function _duRenderInsightHTML(insight, week, isCache) {
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
    ? '<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">Cache ' + week + ' · <button id="du-insight-regen" style="background:none;border:none;color:var(--accent);font-size:10px;font-family:var(--font-mono);cursor:pointer;padding:0">↻ Regenerate</button></span>'
    : '<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">Generated ' + week + '</span>';

  return '<div style="display:flex;flex-direction:column;gap:0;height:100%">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 20px 16px;border-bottom:1px solid var(--border);flex-shrink:0">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div style="width:32px;height:32px;border-radius:var(--radius-sm);background:var(--accent-dim);display:flex;align-items:center;justify-content:center;color:var(--accent)"><i class="ti ti-sparkles" style="font-size:16px"></i></div>' +
        '<div><p style="font-family:var(--font-display);font-size:15px;font-weight:600;color:var(--text-primary)">AI Insight</p>' + cacheNote + '</div>' +
      '</div>' +
      '<button id="du-insight-close" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:4px;line-height:1;display:flex;align-items:center"><i class="ti ti-x"></i></button>' +
    '</div>' +
    '<div style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:20px">' +
      '<div>' +
        '<p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px">Tổng quan</p>' +
        '<p style="font-size:14px;color:var(--text-primary);line-height:1.65;background:var(--bg-hover);padding:12px 14px;border-radius:var(--radius-sm)">' + insight.summary + '</p>' +
      '</div>' +
      (highlightRows ? '<div><p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px">Điểm đáng chú ý</p>' + highlightRows + '</div>' : '') +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)">Phân tích</p>' +
        '<div style="padding:10px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm)">' +
          '<p style="font-size:10px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Consistency</p>' +
          '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55">' + insight.consistencyInsight + '</p>' +
        '</div>' +
        '<div style="padding:10px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm)">' +
          '<p style="font-size:10px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Task Progress</p>' +
          '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55">' + insight.taskInsight + '</p>' +
        '</div>' +
        '<div style="padding:10px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm)">' +
          '<p style="font-size:10px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Xu hướng tuần</p>' +
          '<p style="font-size:13px;color:var(--text-secondary);line-height:1.55">' + insight.weeklyTrend + '</p>' +
        '</div>' +
      '</div>' +
      (recRows ? '<div><p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px">Khuyến nghị</p>' + recRows + '</div>' : '') +

      /* 3 questions section */
      '<div style="border-top:1px solid var(--border);padding-top:20px;display:flex;flex-direction:column;gap:12px">' +
        '<p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)">Đánh giá tool</p>' +
        _duQABlock("ti-tool", "Tool đang được dùng như thế nào?", insight.toolUsage) +
        _duQABlock("ti-alert-triangle", "Problem / friction nào đang thấy trong data?", insight.frictions) +
        _duQABlock("ti-adjustments", "Cần điều chỉnh gì?", insight.adjustments) +
      '</div>' +

    '</div>' +
  '</div>';
}

function _duQABlock(icon, question, answer) {
  return '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden">' +
    '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg-hover);border-bottom:1px solid var(--border)">' +
      '<i class="ti ' + icon + '" style="font-size:13px;color:var(--accent)"></i>' +
      '<p style="font-size:11px;font-weight:600;color:var(--text-primary)">' + question + '</p>' +
    '</div>' +
    '<p style="font-size:13px;color:var(--text-secondary);line-height:1.6;padding:12px 14px">' + (answer || '—') + '</p>' +
  '</div>';
}

function _duInsightLoadingHTML() {
  return '<div style="display:flex;flex-direction:column;gap:0;height:100%">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 20px 16px;border-bottom:1px solid var(--border);flex-shrink:0">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div style="width:32px;height:32px;border-radius:var(--radius-sm);background:var(--accent-dim);display:flex;align-items:center;justify-content:center;color:var(--accent)"><i class="ti ti-sparkles" style="font-size:16px"></i></div>' +
        '<div><p style="font-family:var(--font-display);font-size:15px;font-weight:600;color:var(--text-primary)">AI Insight</p><span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">Đang phân tích...</span></div>' +
      '</div>' +
      '<button id="du-insight-close" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:4px;line-height:1;display:flex;align-items:center"><i class="ti ti-x"></i></button>' +
    '</div>' +
    '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:40px">' +
      '<div style="width:36px;height:36px;border:2px solid var(--border-strong);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite"></div>' +
      '<p style="font-size:14px;color:var(--text-primary)">Đang gọi AI...</p>' +
    '</div>' +
  '</div>';
}

function _duInsightErrorHTML(msg) {
  return '<div style="display:flex;flex-direction:column;gap:0;height:100%">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 20px 16px;border-bottom:1px solid var(--border);flex-shrink:0">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div style="width:32px;height:32px;border-radius:var(--radius-sm);background:var(--red-dim);display:flex;align-items:center;justify-content:center;color:var(--red)"><i class="ti ti-alert-circle" style="font-size:16px"></i></div>' +
        '<p style="font-family:var(--font-display);font-size:15px;font-weight:600;color:var(--text-primary)">AI Insight</p>' +
      '</div>' +
      '<button id="du-insight-close" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:4px;line-height:1;display:flex;align-items:center"><i class="ti ti-x"></i></button>' +
    '</div>' +
    '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:40px;text-align:center">' +
      '<i class="ti ti-wifi-off" style="font-size:36px;color:var(--text-muted)"></i>' +
      '<p style="font-size:14px;color:var(--text-primary)">Không thể tạo insight</p>' +
      '<p style="font-size:12px;color:var(--text-muted)">' + msg + '</p>' +
      '<button id="du-insight-retry" style="margin-top:8px;padding:8px 18px;background:var(--accent-dim);border:1px solid var(--accent);border-radius:var(--radius-sm);color:var(--accent);font-size:13px;cursor:pointer">↻ Thử lại</button>' +
    '</div>' +
  '</div>';
}

async function _duOpenInsightPanel(data, forceRegen) {
  var panel   = document.getElementById("du-insight-panel");
  var overlay = document.getElementById("du-insight-overlay");
  if (!panel) return;

  overlay.style.display = "block";
  panel.classList.add("open");

  var week     = _duGetISOWeek(new Date());
  var cacheKey = _duCacheKey();
  var cached   = null;

  if (!forceRegen) {
    try { cached = JSON.parse(localStorage.getItem(cacheKey)); } catch(e) {}
  }

  if (cached) {
    panel.innerHTML = _duRenderInsightHTML(cached, week, true);
    _duBindPanelEvents(data, panel, overlay);
    return;
  }

  panel.innerHTML = _duInsightLoadingHTML();
  _duBindCloseEvent(panel, overlay);

  try {
    var summary = _duAggregate(data);
    var insight = await _duCallOpenAI(summary);
    localStorage.setItem(cacheKey, JSON.stringify(insight));
    panel.innerHTML = _duRenderInsightHTML(insight, week, false);
    _duBindPanelEvents(data, panel, overlay);
  } catch(err) {
    panel.innerHTML = _duInsightErrorHTML(err.message);
    _duBindCloseEvent(panel, overlay);
    var retryBtn = document.getElementById("du-insight-retry");
    if (retryBtn) retryBtn.addEventListener("click", function() { _duOpenInsightPanel(data, true); });
  }
}

function _duBindCloseEvent(panel, overlay) {
  var closeBtn = document.getElementById("du-insight-close");
  if (closeBtn) closeBtn.addEventListener("click", function() { _duClosePanel(panel, overlay); });
  overlay.onclick = function() { _duClosePanel(panel, overlay); };
}
function _duBindPanelEvents(data, panel, overlay) {
  _duBindCloseEvent(panel, overlay);
  var regenBtn = document.getElementById("du-insight-regen");
  if (regenBtn) regenBtn.addEventListener("click", function() { _duOpenInsightPanel(data, true); });
}
function _duClosePanel(panel, overlay) {
  panel.classList.remove("open");
  overlay.style.display = "none";
}

/* ══════════════════════════════════════════════════════════════ */

window.TOOL_REGISTRY.push({
  id:          "daily-update",
  name:        "Daily Task Update Process PM",
  description: "Tracking ti le submit standup hang ngay cua team.",
  icon:        "ti-square-check",
  status:      "active",

  _urls: {
    dailyTasks:   "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/daily-tasks.json",
    responses:    "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/responses.json",
    members:      "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/members.json",
    submissions:  "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/tracking/daily-update-submissions.json",
    snapshotBase: "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/tracking/snapshots/responses-"
  },

  fetchData: async function(utils) {
    var urls = this._urls;
    var results = await Promise.all([
      utils.fetchJson(urls.dailyTasks,  true),
      utils.fetchJson(urls.responses,   true),
      utils.fetchJson(urls.members,     true),
      utils.fetchJson(urls.submissions, true).catch(function() { return []; }),
      fetch("https://api.github.com/repos/minhwuan1234/daily-update-task-process-pm/commits?path=responses.json&per_page=1")
        .then(function(r) { return r.json(); })
        .then(function(d) { return (d && d[0]) ? d[0].commit.committer.date : null; })
        .catch(function() { return null; })
    ]);
    var data = this._process(results[0], results[1], results[2], results[3], utils);
    data._lastUpdated = results[4];
    return data;
  },

  _process: function(daily, responses, members, submissions, utils) {
    var idToName = {};
    Object.entries(members || {}).forEach(function(e) { idToName[e[1]] = e[0]; });

    var responseList = Array.isArray(responses) ? responses : (responses.responses || []);
    responseList = responseList.filter(function(r) { return r.userId && r.userId.startsWith("ou_"); });

    var cleanSubs = Array.isArray(submissions)
      ? submissions.filter(function(s) { return s.userId && s.userId.startsWith("ou_"); })
      : [];
    var activeIds = new Set(cleanSubs.map(function(s) { return s.userId; }));

    if (activeIds.size === 0) {
      var taskNames = new Set((daily.members || []).map(function(m) { return m.member; }));
      Object.entries(members || {}).forEach(function(e) { if (taskNames.has(e[0])) activeIds.add(e[1]); });
    }

    var activeMembers = Object.entries(members || {}).filter(function(e) { return activeIds.has(e[1]); });
    var totalMembers  = activeMembers.length;

    var submittedIds   = new Set(responseList.map(function(r) { return r.userId; }));
    var submittedCount = submittedIds.size;
    var missingCount   = Math.max(totalMembers - submittedCount, 0);
    var submissionRate = totalMembers > 0 ? Math.round(submittedCount / totalMembers * 100) : 0;

    var memberStatuses = activeMembers.map(function(e) {
      var name = e[0], id = e[1];
      var sub = responseList.find(function(r) { return r.userId === id; });
      return {
        name: name, userId: id,
        status:      sub ? "submitted" : "missing",
        submittedAt: sub ? sub.submittedAt : null,
        tasks:       sub ? (sub.tasks || []) : [],
        message:     sub ? (sub.message || "") : ""
      };
    });

    var allTasks = responseList.flatMap(function(r) {
      return (r.tasks || []).map(function(t) {
        return Object.assign({}, t, { memberName: idToName[r.userId] || r.userId });
      });
    });

    var chartDays = [];
    var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    for (var i = 6; i >= 0; i--) {
      var d = new Date(now);
      d.setDate(d.getDate() - i);
      var dateStr = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
      var label   = String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0");
      var daySubs = cleanSubs.filter(function(s) { return s.date === dateStr; });
      var names   = daySubs.map(function(s) { return s.memberName || s.userId; }).filter(function(n) { return n !== "Unknown"; });
      chartDays.push({ dateStr: dateStr, label: label, count: names.length, total: totalMembers, names: names });
    }

    var dailyMembers = daily.members || [];
    return { totalMembers: totalMembers, submittedCount: submittedCount, missingCount: missingCount, submissionRate: submissionRate, memberStatuses: memberStatuses, allTasks: allTasks, chartDays: chartDays, _rawSubmissions: cleanSubs, dailyMembers: dailyMembers, dailyDate: daily.date || "", _members: members, responseList: responseList };
  },

  renderCard: function(data) {
    var rate = data.submissionRate;
    var rateColor = rate >= 80 ? "green" : rate >= 50 ? "amber" : "red";
    var barColor  = rate >= 80 ? "" : rate >= 50 ? "amber" : "red";
    var versionTag = data._lastUpdated
      ? '<div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);margin-bottom:8px">' +
          new Date(data._lastUpdated).toLocaleString("vi-VN", {timeZone:"Asia/Ho_Chi_Minh"}) +
        '</div>'
      : '';
    return versionTag + '<div class="tool-metrics">' +
      '<div class="tool-metric"><span class="metric-value ' + rateColor + '">' + rate + '%</span><span class="metric-label">Ti le submit</span></div>' +
      '<div class="tool-metric"><span class="metric-value green">' + data.submittedCount + '/' + data.totalMembers + '</span><span class="metric-label">Da submit</span></div>' +
      '<div class="tool-metric"><span class="metric-value ' + (data.missingCount === 0 ? "green" : "red") + '">' + data.missingCount + '</span><span class="metric-label">Chua submit</span></div>' +
      '</div>' +
      '<div class="mini-bar-wrap"><div class="mini-bar"><div class="mini-bar-fill ' + barColor + '" style="width:' + rate + '%"></div></div>' +
      '<span class="mini-bar-pct">' + rate + '%</span></div>';
  },

  renderDetail: function(data, utils) {
    if (!data || data._error) return '<div class="state-error"><i class="ti ti-alert-circle"></i> Khong the tai data</div>';
    if (data._loading) return '<div class="state-loading"><div class="spinner"></div><p>Dang tai...</p></div>';

    var tabBar =
      '<div class="tab-bar">' +
        '<button class="tab-btn active" data-tab="tracking"><i class="ti ti-chart-bar"></i> Tracking</button>' +
        '<button class="tab-btn" data-tab="taskinfo"><i class="ti ti-list-check"></i> Thong tin task</button>' +
      '</div>' +
      '<div id="tab-tracking" class="tab-pane active"></div>' +
      '<div id="tab-taskinfo" class="tab-pane" style="display:none"></div>' +
      /* Insight panel + overlay + FAB */
      '<div id="du-insight-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199;backdrop-filter:blur(2px)"></div>' +
      '<div id="du-insight-panel" class="cs-insight-panel"></div>' +
      '<button id="du-insight-fab" class="cs-insight-fab" title="Xem AI Insight">' +
        '<i class="ti ti-sparkles"></i><span>Insight</span>' +
      '</button>';

    var rate = data.submissionRate;
    var rateColor = rate >= 80 ? "green" : rate >= 50 ? "amber" : "red";

    var statsHTML =
      '<div class="detail-stats">' +
      '<div class="stat-card"><span class="stat-label">Ti le submit</span><span class="stat-value ' + rateColor + '">' + rate + '%</span></div>' +
      '<div class="stat-card"><span class="stat-label">Da submit</span><span class="stat-value green">' + data.submittedCount + '</span><span class="stat-delta">/ ' + data.totalMembers + ' members</span></div>' +
      '<div class="stat-card"><span class="stat-label">Chua submit</span><span class="stat-value ' + (data.missingCount === 0 ? "green" : "red") + '">' + data.missingCount + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">Tong tasks</span><span class="stat-value">' + data.allTasks.length + '</span></div>' +
      '</div>';

    window._duSubs         = data._rawSubmissions || [];
    window._duTotal        = data.totalMembers;
    window._duResponseList = data.responseList || [];
    window._duMemberStatuses = data.memberStatuses || [];
    window._duData         = data; /* store for insight panel */

    window._buildDUChart = function(n) {
      var container = document.getElementById("chart-container");
      if (!container) return;

      var groupByWeek = n >= 90;
      var now  = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
      var buckets = [];

      if (!groupByWeek) {
        for (var i = n - 1; i >= 0; i--) {
          var d   = new Date(now); d.setDate(d.getDate() - i);
          var ds  = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
          var lbl = String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0");
          var subs  = window._duSubs.filter(function(s) { return s.date === ds; });
          var names = subs.map(function(s) { return s.memberName||s.userId; }).filter(function(x) { return x !== "Unknown"; });
          buckets.push({ lbl: lbl, tooltip: ds, dateStr: ds, count: names.length, names: names, days: 1 });
        }
      } else {
        var totalWeeks = Math.ceil(n / 7);
        for (var w = totalWeeks - 1; w >= 0; w--) {
          var weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - w * 7 - 6);
          var weekEnd   = new Date(now); weekEnd.setDate(weekEnd.getDate() - w * 7);
          var lblS = String(weekStart.getDate()).padStart(2,"0") + "/" + String(weekStart.getMonth()+1).padStart(2,"0");
          var lblE = String(weekEnd.getDate()).padStart(2,"0")   + "/" + String(weekEnd.getMonth()+1).padStart(2,"0");
          var allNames = []; var submittedDays = 0;
          for (var day = 0; day < 7; day++) {
            var dd  = new Date(weekStart); dd.setDate(dd.getDate() + day);
            var dds = dd.getFullYear() + "-" + String(dd.getMonth()+1).padStart(2,"0") + "-" + String(dd.getDate()).padStart(2,"0");
            var ds2 = window._duSubs.filter(function(s) { return s.date === dds; });
            if (ds2.length > 0) submittedDays++;
            ds2.forEach(function(s) {
              var nm = s.memberName || s.userId;
              if (nm !== "Unknown" && allNames.indexOf(nm) === -1) allNames.push(nm);
            });
          }
          buckets.push({ lbl: lblS + "-" + lblE, tooltip: lblS + " ~ " + lblE, count: submittedDays, names: allNames, days: 7 });
        }
      }

      var max     = groupByWeek ? 5 : Math.max(window._duTotal, 1);
      var hasData = buckets.some(function(b) { return b.count > 0; });

      if (!hasData) {
        container.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:var(--text-muted)"><i class="ti ti-chart-bar-off" style="font-size:28px"></i><span style="font-size:13px">Chua co du lieu trong khoang thoi gian nay</span></div>';
        return;
      }

      container.innerHTML = buckets.map(function(b) {
        var pct = groupByWeek ? Math.round(b.count / max * 100) : Math.round(b.count / Math.max(window._duTotal, 1) * 100);
        var bc  = pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--accent)" : pct > 0 ? "var(--yellow)" : "var(--bg-hover)";
        var nl  = b.names.length > 0 ? b.names.join(", ") : "Chua co du lieu";
        var tooltipBody = groupByWeek
          ? b.count + " ngay co submission<br><span style=\"color:var(--text-secondary);font-size:11px\">" + nl + "</span>"
          : b.count + "/" + window._duTotal + " nguoi submit<br><span style=\"color:var(--text-secondary);font-size:11px\">" + nl + "</span>";
        var clickable = b.count > 0 && !groupByWeek ? "chart-col--clickable" : "";
        var tipHtml = '<strong>' + b.tooltip + '</strong><br>' + tooltipBody + (b.count > 0 && !groupByWeek ? '<br><span style="color:var(--accent);font-size:10px">↓ Click de xem chi tiet</span>' : '');
        return '<div class="chart-col ' + clickable + '" data-date="' + b.dateStr + '" data-has-data="' + (b.count > 0 ? "1" : "0") + '" data-tip="' + tipHtml.replace(/"/g, "&quot;") + '">' +
          '<div class="chart-bar-wrap"><div class="chart-bar" style="height:' + Math.max(pct, 4) + '%;background:' + bc + '"></div></div>' +
          '<div class="chart-label" style="font-size:' + (groupByWeek ? "9px" : "11px") + '">' + b.lbl + '</div>' +
          '<div class="chart-count">' + b.count + '</div>' +
        '</div>';
      }).join("");

      var globalTip = document.getElementById("_du_global_tip");
      if (!globalTip) {
        globalTip = document.createElement("div");
        globalTip.id = "_du_global_tip";
        globalTip.style.cssText = "position:fixed;z-index:99999;background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text-primary);white-space:nowrap;line-height:1.6;pointer-events:none;display:none;font-family:var(--font-body)";
        document.body.appendChild(globalTip);
      }

      container.querySelectorAll(".chart-col").forEach(function(col) {
        col.addEventListener("mouseenter", function() {
          var tip = col.dataset.tip; if (!tip) return;
          globalTip.innerHTML = tip.replace(/&quot;/g, '"'); globalTip.style.display = "block";
        });
        col.addEventListener("mousemove", function(e) {
          globalTip.style.left = (e.clientX - globalTip.offsetWidth / 2) + "px";
          globalTip.style.top  = (e.clientY - globalTip.offsetHeight - 14) + "px";
        });
        col.addEventListener("mouseleave", function() { globalTip.style.display = "none"; });
      });

      var nowRange = new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Ho_Chi_Minh"}));
      var cutoffRange = new Date(nowRange); cutoffRange.setDate(cutoffRange.getDate() - (n-1));
      var cutoffRangeStr = cutoffRange.getFullYear()+"-"+String(cutoffRange.getMonth()+1).padStart(2,"0")+"-"+String(cutoffRange.getDate()).padStart(2,"0");

      window._duSubmitCounts = {};
      (window._duSubs || []).forEach(function(s) {
        if (s && s.userId && s.userId.startsWith("ou_") && s.date >= cutoffRangeStr) {
          window._duSubmitCounts[s.userId] = (window._duSubmitCounts[s.userId] || 0) + 1;
        }
      });

      /* Update submit count cells */
      (window._duMemberStatuses || []).forEach(function(m) {
        var cell = document.querySelector('.du-member-row[data-uid="' + m.userId + '"] .du-submit-count');
        if (!cell) return;
        var count = (window._duSubmitCounts || {})[m.userId] || 0;
        cell.innerHTML = count > 0
          ? '<span style="font-family:var(--font-mono);font-weight:600;color:var(--text-primary)">' + count + '</span><span style="color:var(--text-muted);font-size:11px"> /' + n + 'd</span>'
          : '<span style="color:var(--text-muted)">—</span>';
      });

      /* Click day → snapshot */
      container.querySelectorAll(".chart-col--clickable").forEach(function(col) {
        col.addEventListener("click", function() {
          var dateStr = col.dataset.date;
          var detail  = document.getElementById("chart-day-detail");
          if (!detail || !dateStr) return;
          var wasActive = col.classList.contains("chart-col--active");
          container.querySelectorAll(".chart-col").forEach(function(c) { c.classList.remove("chart-col--active"); });
          if (wasActive) { detail.style.display = "none"; detail.innerHTML = ""; return; }
          col.classList.add("chart-col--active");
          detail.style.display = "block";
          detail.innerHTML = '<div class="state-loading" style="padding:24px"><div class="spinner"></div><p>Dang tai...</p></div>';
          if (window._fetchDaySnapshot) window._fetchDaySnapshot(dateStr);
        });
      });
    };

    var _membersMap = {};
    Object.entries(data._members || {}).forEach(function(e) { _membersMap[e[1]] = e[0]; });
    window._duMembersMap   = _membersMap;
    window._duSnapshotBase = "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/tracking/snapshots/responses-";
    window._duMaxTasks     = Math.max.apply(null, (data.memberStatuses || []).map(function(m) { return m.tasks.length || 0; }).concat([1]));

    window._fetchDaySnapshot = function(dateStr) {
      var detail = document.getElementById("chart-day-detail");
      if (!detail) return;
      var url = window._duSnapshotBase + dateStr + ".json?" + Date.now();
      fetch(url).then(function(r) {
        if (!r.ok) throw new Error("404");
        return r.json();
      }).then(function(snapshot) {
        var responseList = Array.isArray(snapshot) ? snapshot : (snapshot.responses || []);
        responseList = responseList.filter(function(r) { return r.userId && r.userId.startsWith("ou_"); });
        var maxT = Math.max.apply(null, responseList.map(function(r) { return (r.tasks||[]).length; }).concat([1]));
        var taskHeaders = "";
        for (var i = 0; i < maxT; i++) taskHeaders += '<th class="col-task">Task ' + (i+1) + '</th><th class="col-progress">Progress</th>';
        var rows = responseList.map(function(r) {
          var name = window._duMembersMap[r.userId] || r.userId;
          var taskCols = "";
          for (var i = 0; i < maxT; i++) {
            var t = (r.tasks||[])[i];
            if (t) {
              var pct = parseInt(t.progress||0);
              var pc  = pct===100?"done":pct>=60?"high":"medium";
              taskCols += '<td class="col-task" style="font-size:13px;color:var(--text-secondary)">' + (t.title||"—") + '</td>' +
                          '<td class="col-progress"><span class="progress-badge ' + pc + '">' + (t.progress||"—") + '</span></td>';
            } else {
              taskCols += '<td class="col-task" style="color:var(--text-muted)">—</td><td class="col-progress"></td>';
            }
          }
          var time = r.submittedAt ? new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Ho_Chi_Minh"}).format(new Date(r.submittedAt)) : "—";
          return '<tr><td style="font-weight:500">' + name + '</td>' +
            '<td><span class="status-pill submitted">✓ Da submit</span></td>' +
            '<td style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">' + time + '</td>' +
            taskCols + '</tr>';
        }).join("");
        detail.innerHTML =
          '<div class="members-section">' +
            '<div class="section-header"><span class="section-title">Chi tiet ngay ' + dateStr + '</span><span class="section-meta">' + responseList.length + ' submissions</span></div>' +
            '<table class="members-table"><thead><tr><th>Thanh vien</th><th>Trang thai</th><th>Gio submit</th>' + taskHeaders + '</tr></thead><tbody>' + rows + '</tbody></table>' +
          '</div>';
      }).catch(function() {
        detail.innerHTML = '<div class="state-empty" style="padding:24px"><i class="ti ti-inbox" style="font-size:28px"></i><p>Chua co du lieu cho ngay ' + dateStr + '</p></div>';
      });
    };

    var chartHTML =
      '<div class="members-section" style="margin-bottom:0">' +
        '<div class="section-header">' +
          '<span class="section-title">Lich su submit</span>' +
          '<select id="chart-range" style="background:var(--bg-hover);border:1px solid var(--border-strong);color:var(--text-primary);font-size:12px;padding:4px 10px;border-radius:var(--radius-sm);cursor:pointer;outline:none">' +
            '<option value="7" selected="selected">7 ngay</option>' +
            '<option value="14">2 tuan</option>' +
            '<option value="30">1 thang</option>' +
            '<option value="90">3 thang</option>' +
          '</select>' +
        '</div>' +
        '<div id="chart-container" class="chart-wrap"></div>' +
      '</div>' +
      '<div id="chart-day-detail" style="display:none;margin-bottom:24px" data-active-date=""></div>';

    var now30 = new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Ho_Chi_Minh"}));
    var cutoff = new Date(now30); cutoff.setDate(cutoff.getDate() - 29);
    var cutoffStr = cutoff.getFullYear()+"-"+String(cutoff.getMonth()+1).padStart(2,"0")+"-"+String(cutoff.getDate()).padStart(2,"0");
    var submitCounts = {};
    var rawSubs = (data && data._rawSubmissions) ? data._rawSubmissions : [];
    rawSubs.forEach(function(s) {
      if (s && s.userId && s.userId.startsWith("ou_") && s.date >= cutoffStr)
        submitCounts[s.userId] = (submitCounts[s.userId] || 0) + 1;
    });
    var today30 = new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Ho_Chi_Minh"}));
    var todayStr = today30.getFullYear()+"-"+String(today30.getMonth()+1).padStart(2,"0")+"-"+String(today30.getDate()).padStart(2,"0");
    (data.responseList || []).forEach(function(r) {
      if (!r || !r.userId) return;
      var alreadyCounted = rawSubs.some(function(s) { return s.userId === r.userId && s.date === todayStr; });
      if (!alreadyCounted) submitCounts[r.userId] = (submitCounts[r.userId] || 0) + 1;
    });

    var rows = data.memberStatuses.slice().sort(function(a, b) {
      if (a.status === b.status) return a.name.localeCompare(b.name);
      return a.status === "submitted" ? -1 : 1;
    }).map(function(m) {
      var totalSubmits = (submitCounts && m && m.userId) ? (submitCounts[m.userId] || 0) : 0;
      var submitCell = totalSubmits > 0
        ? '<span style="font-family:var(--font-mono);font-weight:600;color:var(--text-primary)">' + totalSubmits + '</span><span style="color:var(--text-muted);font-size:11px"> /30d</span>'
        : '<span style="color:var(--text-muted)">—</span>';
      var maxTasks = Math.max.apply(null, data.memberStatuses.map(function(x) { return x.tasks.length || 0; }).concat([1]));
      var timeStr = utils ? utils.formatTime(m.submittedAt) : "—";
      var statusCell = '<span class="status-pill ' + m.status + '">' + (m.status==="submitted"?"✓ Da submit":"✗ Chua submit") + '</span>';
      var nameCell = '<span style="font-weight:500">' + m.name + '</span>' +
        (m.message ? '<br><span style="font-size:11px;color:var(--text-muted)">📎 ' + m.message.substring(0,60) + (m.message.length>60?"…":"") + '</span>' : '');
      var taskCols = "";
      for (var ti = 0; ti < maxTasks; ti++) {
        var t = m.tasks[ti];
        if (t) {
          var pct = parseInt(t.progress||0);
          var pc  = pct===100?"done":pct>=60?"high":"medium";
          taskCols += '<td style="font-size:12px;color:var(--text-secondary);max-width:200px">' + (t.title||"—") + '</td>' +
            '<td class="col-progress"><span class="progress-badge ' + pc + '">' + (t.progress||"—") + '</span></td>';
        } else {
          taskCols += '<td class="col-task" style="color:var(--text-muted);font-size:12px">—</td><td class="col-progress"></td>';
        }
      }
      return '<tr class="du-member-row" data-uid="' + m.userId + '">' +
        '<td>' + nameCell + '</td>' +
        '<td>' + statusCell + '</td>' +
        '<td style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">' + timeStr + '</td>' +
        taskCols +
        '<td class="du-submit-count">' + submitCell + '</td>' +
      '</tr>';
    }).join("");

    var membersHTML =
      '<div class="members-section">' +
        '<div class="section-header"><span class="section-title">Trang thai submit hom nay</span><span class="section-meta">' + data.submittedCount + '/' + data.totalMembers + ' members</span></div>' +
        (function() {
          var maxTasks = Math.max.apply(null, data.memberStatuses.map(function(m) { return m.tasks.length || 0; }).concat([1]));
          var taskHeaders = "";
          for (var i = 0; i < maxTasks; i++) taskHeaders += '<th class="col-task">Task ' + (i+1) + '</th><th class="col-progress">Progress</th>';
          return '<table class="members-table"><thead><tr>' +
            '<th>Thanh vien</th><th>Trang thai</th><th>Gio submit</th>' + taskHeaders + '<th>Submit/30d</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table>';
        })() +
      '</div>';

    var taskRowsHTML = data.allTasks.length === 0
      ? '<div class="state-empty" style="padding:24px"><i class="ti ti-inbox" style="font-size:28px"></i><p>Chua co task nao duoc submit</p></div>'
      : data.allTasks.map(function(t) {
          var pct = parseInt(t.progress||0);
          var pc  = pct===100?"done":pct>=60?"high":pct>=30?"medium":"low";
          var rawTime = (t.timeSpent || "").trim();
          var safeTime = /^[\d.]+h?$/.test(rawTime) ? rawTime : "—";
          return '<div class="task-row">' +
            '<div class="task-title-cell">' + (t.title||"—") + '</div>' +
            '<div class="task-member-cell">' + (t.memberName||"—") + '</div>' +
            '<div class="progress-badge ' + pc + '" style="text-align:center">' + (t.progress||"—") + '</div>' +
            '<div class="time-badge">' + safeTime + '</div>' +
          '</div>';
        }).join("");

    var tasksHTML =
      '<div class="task-breakdown">' +
        '<div class="section-header"><span class="section-title">Chi tiet tasks</span><span class="section-meta">' + data.allTasks.length + ' tasks</span></div>' +
        '<div class="task-row task-header">' +
          '<div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted)">Task</div>' +
          '<div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted)">Thanh vien</div>' +
          '<div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);text-align:center">Progress</div>' +
          '<div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);text-align:right">Time</div>' +
        '</div>' +
        '<div style="height:1px;background:var(--border);margin:0 20px"></div>' +
        taskRowsHTML +
      '</div>';

    var taskInfoHTML =
      '<div class="tool-info-page">' +
        '<div class="tool-info-hero">' +
          '<div class="tool-info-icon"><i class="ti ti-square-check"></i></div>' +
          '<div>' +
            '<h2 class="tool-info-name">Daily Task Update Process PM</h2>' +
            '<p class="tool-info-tagline">He thong tracking standup hang ngay cho team F.Learning Studio</p>' +
          (data._lastUpdated ? '<p style="font-size:11px;color:var(--text-muted);margin-top:6px;font-family:var(--font-mono)">Last updated: ' + new Date(data._lastUpdated).toLocaleString("vi-VN", {timeZone:"Asia/Ho_Chi_Minh"}) + '</p>' : '') +
          '</div>' +
        '</div>' +
        '<div class="tool-info-section"><div class="tool-info-section-title"><i class="ti ti-alert-triangle"></i> Van de can giai quyet</div><p class="tool-info-text">Them noi dung o day.</p></div>' +
        '<div class="tool-info-section"><div class="tool-info-section-title"><i class="ti ti-info-circle"></i> Mo ta</div><p class="tool-info-text">Tool nay giup PM theo doi viec submit standup hang ngay cua toan bo thanh vien. Moi ngay, tung thanh vien nhan link ca nhan qua Lark, dien progress tung task va gui ve. Du lieu duoc tong hop tu dong va hien thi tren dashboard nay.</p></div>' +
        '<div class="tool-info-grid">' +
          '<div class="tool-info-section"><div class="tool-info-section-title"><i class="ti ti-settings"></i> Cau hinh</div><div class="tool-info-kv"><div class="kv-row"><span class="kv-key">Timezone</span><span class="kv-val">Asia/Ho_Chi_Minh</span></div><div class="kv-row"><span class="kv-key">Cutoff time</span><span class="kv-val">18:00 ICT</span></div><div class="kv-row"><span class="kv-key">Tan suat</span><span class="kv-val">Hang ngay (Thu 2 – Thu 6)</span></div><div class="kv-row"><span class="kv-key">Trigger</span><span class="kv-val">responses.json thay doi → GitHub Actions</span></div><div class="kv-row"><span class="kv-key">Platform</span><span class="kv-val">Lark / Feishu</span></div></div></div>' +
          '<div class="tool-info-section"><div class="tool-info-section-title"><i class="ti ti-database"></i> Data sources</div><div class="tool-info-kv"><div class="kv-row"><span class="kv-key">daily-tasks.json</span><span class="kv-val kv-mono">daily-update-task-process-pm</span></div><div class="kv-row"><span class="kv-key">responses.json</span><span class="kv-val kv-mono">daily-update-task-process-pm</span></div><div class="kv-row"><span class="kv-key">members.json</span><span class="kv-val kv-mono">daily-update-task-process-pm</span></div><div class="kv-row"><span class="kv-key">submissions.json</span><span class="kv-val kv-mono">tracking/daily-update-submissions.json</span></div></div></div>' +
        '</div>' +
        '<div class="tool-info-section"><div class="tool-info-section-title"><i class="ti ti-link"></i> Lien ket</div><div class="tool-info-links"><a class="tool-info-link" href="https://github.com/minhwuan1234/daily-update-task-process-pm" target="_blank"><i class="ti ti-brand-github"></i> daily-update-task-process-pm</a><a class="tool-info-link" href="https://github.com/minhwuan1234/admin-dashboard" target="_blank"><i class="ti ti-brand-github"></i> admin-dashboard</a></div></div>' +
      '</div>';

    window._duTrackingHTML = statsHTML + chartHTML + membersHTML + tasksHTML;
    window._duTaskInfoHTML = taskInfoHTML;

    window._initDUTabs = function() {
      var tracking = document.getElementById("tab-tracking");
      var taskinfo = document.getElementById("tab-taskinfo");
      if (tracking) tracking.innerHTML = window._duTrackingHTML;
      if (taskinfo) taskinfo.innerHTML = window._duTaskInfoHTML;

      setTimeout(function() {
        var chartRange = document.getElementById("chart-range");
        if (chartRange && window._buildDUChart) {
          window._buildDUChart(parseInt(chartRange.value));
          chartRange.addEventListener("change", function() { window._buildDUChart(parseInt(this.value)); });
        }

        /* Insight FAB */
        var fab = document.getElementById("du-insight-fab");
        if (fab) fab.addEventListener("click", function() { _duOpenInsightPanel(window._duData || {}, false); });
      }, 50);

      var btns  = document.querySelectorAll(".tab-btn");
      var panes = document.querySelectorAll(".tab-pane");
      btns.forEach(function(btn) {
        btn.addEventListener("click", function() {
          btns.forEach(function(b) { b.classList.remove("active"); });
          panes.forEach(function(p) { p.style.display = "none"; p.classList.remove("active"); });
          btn.classList.add("active");
          var target = document.getElementById("tab-" + btn.dataset.tab);
          if (target) { target.style.display = "block"; target.classList.add("active"); }
          if (btn.dataset.tab === "tracking") {
            setTimeout(function() {
              var chartRange = document.getElementById("chart-range");
              if (chartRange && window._buildDUChart) window._buildDUChart(parseInt(chartRange.value));
            }, 50);
          }
        });
      });
    };

    return tabBar;
  }
});
