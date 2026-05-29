/* ══════════════════════════════════════════════════════════════
   ADMIN DASHBOARD — Core Engine
   Them tool moi: tao tools/[id]/config.js, dang ky TOOL_REGISTRY
   ══════════════════════════════════════════════════════════════ */

let currentView = "overview";
let currentToolId = null;
let toolDataCache = {};

const $ = (id) => document.getElementById(id);
const ts = () => Date.now();

function formatDate(date) {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(date);
}

function formatTime(isoString) {
  if (!isoString) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(isoString));
}

function formatMetricValue(metric, data) {
  const val = data[metric.key];
  if (val === undefined || val === null) return "—";
  if (metric.format === "percent") return Math.round(val) + "%";
  if (metric.format === "fraction") return val + "/" + (data[metric.denomKey] || "?");
  if (metric.format === "number") return String(val);
  return String(val);
}

function getMetricColor(metric, data) {
  if (!metric.colorFn) return "";
  return metric.colorFn(data[metric.key]) || "";
}

async function fetchJson(url, bustCache) {
  const finalUrl = bustCache ? url + "?t=" + ts() : url;
  const res = await fetch(finalUrl);
  if (!res.ok) throw new Error("HTTP " + res.status + ": " + finalUrl);
  return res.json();
}

/* ── Routing ── */
function showView(name) {
  document.querySelectorAll(".view").forEach(function(v) { v.classList.remove("active"); });
  $("view-" + name).classList.add("active");
  currentView = name;
}

function navigateTo(toolId) {
  document.querySelectorAll(".nav-item").forEach(function(el) { el.classList.remove("active"); });
  var navEl = document.querySelector(".nav-item[data-view='" + toolId + "']");
  if (navEl) navEl.classList.add("active");
}

/* ══════════════════════════════
   OVERVIEW
   ══════════════════════════════ */
function renderOverviewStats(tools) {
  var active = tools.filter(function(t) { return t.status === "active"; }).length;
  var total  = tools.length;
  $("overview-stats").innerHTML =
    '<div class="stat-card"><span class="stat-label">Tong tools</span><span class="stat-value">' + total + '</span><span class="stat-delta"><i class="ti ti-tools"></i> Da dang ky</span></div>' +
    '<div class="stat-card"><span class="stat-label">Dang hoat dong</span><span class="stat-value green">' + active + '</span><span class="stat-delta"><i class="ti ti-circle-check"></i> Active tools</span></div>' +
    '<div class="stat-card"><span class="stat-label">Sap ra mat</span><span class="stat-value amber">' + (total - active) + '</span><span class="stat-delta"><i class="ti ti-clock"></i> Coming soon</span></div>';
}

function renderToolCard(tool, liveData) {
  var isActive  = tool.status === "active";
  var hasData   = liveData && !liveData._loading && !liveData._error;
  var badgeClass = isActive ? "active" : "coming";
  var badgeLabel = isActive ? "Active" : "Soon";

  var metricsHTML = "";
  if (isActive && hasData) {
    var items = (tool.metrics || []).map(function(m) {
      return '<div class="tool-metric"><span class="metric-value ' + getMetricColor(m, liveData) + '">' + formatMetricValue(m, liveData) + '</span><span class="metric-label">' + m.label + '</span></div>';
    }).join("");
    var rate = liveData.submissionRate;
    var barColor = rate >= 80 ? "" : rate >= 50 ? "amber" : "red";
    var barHTML = rate !== undefined
      ? '<div class="mini-bar-wrap"><div class="mini-bar"><div class="mini-bar-fill ' + barColor + '" style="width:' + rate + '%"></div></div><span class="mini-bar-pct">' + Math.round(rate) + '%</span></div>'
      : "";
    metricsHTML = '<div class="tool-metrics">' + items + '</div>' + barHTML;
  } else if (isActive && liveData && liveData._loading) {
    metricsHTML = '<div class="tool-metrics"><div class="state-loading" style="padding:12px 0;gap:8px;flex-direction:row;"><div class="spinner"></div><span style="font-size:12px;">Dang tai...</span></div></div>';
  } else if (isActive && liveData && liveData._error) {
    metricsHTML = '<div class="tool-metrics" style="padding-top:14px;border-top:1px solid var(--border);"><span style="font-size:12px;color:var(--red);"><i class="ti ti-alert-circle"></i> Khong the tai data</span></div>';
  } else {
    metricsHTML = '<div class="tool-metrics" style="padding-top:14px;border-top:1px solid var(--border);"><span style="font-size:12px;color:var(--text-muted);">Chua co data</span></div>';
  }

  return '<div class="tool-card' + (tool.status === "coming-soon" ? " coming-soon" : "") + '" data-tool-id="' + tool.id + '" role="button" tabindex="' + (isActive ? 0 : -1) + '">' +
    '<div class="tool-card-header"><div class="tool-icon"><i class="ti ' + tool.icon + '"></i></div><span class="tool-badge ' + badgeClass + '">' + badgeLabel + '</span></div>' +
    '<p class="tool-card-name">' + tool.name + '</p>' +
    '<p class="tool-card-desc">' + tool.description + '</p>' +
    metricsHTML + '</div>';
}

function renderToolsGrid(tools) {
  var grid = $("tools-grid");
  grid.innerHTML = tools.map(function(t) { return renderToolCard(t, toolDataCache[t.id]); }).join("");
  grid.querySelectorAll(".tool-card:not(.coming-soon)").forEach(function(card) {
    card.addEventListener("click", function() { openToolDetail(card.dataset.toolId); });
  });
}

/* ══════════════════════════════
   DATA FETCHING
   ══════════════════════════════ */
async function fetchToolData(tool) {
  if (tool.status !== "active") return null;
  toolDataCache[tool.id] = { _loading: true };
  try {
    if (tool.id === "daily-update") {
      var ds = tool.dataSource;
      var bust = ds.cacheBust;
      var results = await Promise.all([
        fetchJson(ds.dailyTasksUrl,  bust),
        fetchJson(ds.responsesUrl,   bust),
        fetchJson(ds.membersUrl,     bust),
        fetchJson(ds.summaryUrl,     bust).catch(function() { return {}; }),
        fetchJson(ds.submissionsUrl, bust).catch(function() { return []; })
      ]);
      var data = processDailyUpdateData(results[0], results[1], results[2], results[3], results[4]);
      toolDataCache[tool.id] = data;
      return data;
    }
    return null;
  } catch (err) {
    console.error("[" + tool.id + "] fetch error:", err);
    toolDataCache[tool.id] = { _error: err.message };
    return null;
  }
}

function processDailyUpdateData(daily, responses, members, summary, submissions) {
  var idToName = {};
  Object.entries(members || {}).forEach(function(e) { idToName[e[1]] = e[0]; });

  var responseList = Array.isArray(responses) ? responses : (responses.responses || []);
  responseList = responseList.filter(function(r) { return r.userId && r.userId.startsWith("ou_"); });

  // Active members = ai co submission trong 30 ngay gan nhat
  var cleanSubs30 = Array.isArray(submissions) ? submissions.filter(function(s) { return s.userId && s.userId.startsWith("ou_"); }) : [];
  var activeUserIds = new Set(cleanSubs30.map(function(s) { return s.userId; }));
  // Fallback: neu chua co submissions thi dung daily-tasks
  if (activeUserIds.size === 0) {
    var activeMemberNames = new Set((daily.members || []).map(function(m) { return m.member; }));
    Object.entries(members || {}).forEach(function(e) { if (activeMemberNames.has(e[0])) activeUserIds.add(e[1]); });
  }
  var activeMembers = Object.entries(members || {}).filter(function(e) { return activeUserIds.has(e[1]); });
  var totalMembers = activeMembers.length || Object.keys(members || {}).length;

  var submittedIds   = new Set(responseList.map(function(r) { return r.userId; }));
  var submittedCount = submittedIds.size;
  var missingCount   = Math.max(totalMembers - submittedCount, 0);
  var submissionRate = totalMembers > 0 ? Math.round(submittedCount / totalMembers * 100) : 0;

  var memberStatuses = activeMembers.map(function(e) {
    var name = e[0], id = e[1];
    var sub = responseList.find(function(r) { return r.userId === id; });
    return { name: name, userId: id, status: sub ? "submitted" : "missing", submittedAt: sub ? sub.submittedAt : null, tasks: sub ? (sub.tasks || []) : [], message: sub ? (sub.message || "") : "" };
  });

  var allTasks = responseList.flatMap(function(r) {
    return (r.tasks || []).map(function(t) { return Object.assign({}, t, { memberName: idToName[r.userId] || r.userId }); });
  });

  // Build 7-day chart data from submissions history
  var cleanSubs = Array.isArray(submissions) ? submissions.filter(function(s) { return s.userId && s.userId.startsWith("ou_"); }) : [];
  var chartDays = buildChartDays(cleanSubs, totalMembers, 7);

  return { totalMembers: totalMembers, submittedCount: submittedCount, missingCount: missingCount, submissionRate: submissionRate, memberStatuses: memberStatuses, allTasks: allTasks, chartDays: chartDays, responseList: responseList };
}

function buildChartDays(submissions, totalMembers, nDays) {
  var days = [];
  var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  for (var i = nDays - 1; i >= 0; i--) {
    var d = new Date(now);
    d.setDate(d.getDate() - i);
    var dateStr = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
    var label   = String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0");
    var daySubs = submissions.filter(function(s) { return s.date === dateStr; });
    var names   = daySubs.map(function(s) { return s.memberName || s.userId; }).filter(function(n) { return n !== "Unknown"; });
    days.push({ dateStr: dateStr, label: label, count: names.length, total: totalMembers, names: names });
  }
  return days;
}

/* ══════════════════════════════
   DETAIL VIEW
   ══════════════════════════════ */
function renderDailyUpdateDetail(data) {
  if (!data || data._error) return '<div class="state-error"><i class="ti ti-alert-circle"></i> Khong the tai data</div>';
  if (data._loading) return '<div class="state-loading"><div class="spinner"></div><p>Dang tai...</p></div>';

  var totalMembers = data.totalMembers, submittedCount = data.submittedCount,
      missingCount = data.missingCount, submissionRate = data.submissionRate,
      memberStatuses = data.memberStatuses, allTasks = data.allTasks, chartDays = data.chartDays || [];

  var rateColor = submissionRate >= 80 ? "green" : submissionRate >= 50 ? "amber" : "red";

  var statsHTML =
    '<div class="detail-stats">' +
    '<div class="stat-card"><span class="stat-label">Ti le submit</span><span class="stat-value ' + rateColor + '">' + submissionRate + '%</span></div>' +
    '<div class="stat-card"><span class="stat-label">Da submit</span><span class="stat-value green">' + submittedCount + '</span><span class="stat-delta">/ ' + totalMembers + ' members</span></div>' +
    '<div class="stat-card"><span class="stat-label">Chua submit</span><span class="stat-value ' + (missingCount === 0 ? "green" : "red") + '">' + missingCount + '</span></div>' +
    '<div class="stat-card"><span class="stat-label">Tong tasks</span><span class="stat-value">' + allTasks.length + '</span></div>' +
    '</div>';

  // Bar chart
  var chartHTML = renderBarChart(chartDays, totalMembers);

  // Members table
  var rows = memberStatuses.slice().sort(function(a,b) {
    if (a.status === b.status) return a.name.localeCompare(b.name);
    return a.status === "submitted" ? -1 : 1;
  }).map(function(m) {
    var avgProg = m.tasks.length > 0 ? Math.round(m.tasks.reduce(function(s,t) { return s + parseInt(t.progress||0); }, 0) / m.tasks.length) : null;
    var progCell = avgProg !== null ? '<span class="progress-badge ' + (avgProg===100?"done":avgProg>=60?"high":"medium") + '">' + avgProg + '%</span>' : '<span style="color:var(--text-muted)">—</span>';
    return '<tr><td><span style="font-weight:500">' + m.name + '</span>' + (m.message ? '<br><span style="font-size:11px;color:var(--text-muted)">' + m.message.substring(0,60) + (m.message.length>60?"…":"") + '</span>' : '') + '</td>' +
      '<td><span class="status-pill ' + m.status + '">' + (m.status==="submitted"?"✓ Da submit":"✗ Chua submit") + '</span></td>' +
      '<td style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">' + formatTime(m.submittedAt) + '</td>' +
      '<td style="text-align:center">' + progCell + '</td>' +
      '<td style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">' + (m.tasks.length > 0 ? m.tasks.length + " task" : "—") + '</td></tr>';
  }).join("");

  var membersHTML = '<div class="members-section"><div class="section-header"><span class="section-title">Trang thai submit hom nay</span><span class="section-meta">' + submittedCount + '/' + totalMembers + ' members</span></div>' +
    '<table class="members-table"><thead><tr><th>Thanh vien</th><th>Trang thai</th><th>Gio submit</th><th>Avg progress</th><th>Tasks</th></tr></thead><tbody>' + rows + '</tbody></table></div>';

  // Tasks
  var taskRowsHTML = allTasks.length === 0
    ? '<div class="state-empty" style="padding:24px"><i class="ti ti-inbox" style="font-size:28px"></i><p>Chua co task nao duoc submit</p></div>'
    : allTasks.map(function(t) {
        var pct = parseInt(t.progress||0);
        var pc  = pct===100?"done":pct>=60?"high":pct>=30?"medium":"low";
        return '<div class="task-row"><div class="task-title-cell">' + (t.title||"—") + '</div><div class="task-member-cell">' + (t.memberName||"—") + '</div><div class="progress-badge ' + pc + '">' + (t.progress||"—") + '</div><div class="time-badge">' + (t.timeSpent||"—") + '</div></div>';
      }).join("");

  var tasksHTML = '<div class="task-breakdown"><div class="section-header"><span class="section-title">Chi tiet tasks</span><span class="section-meta">' + allTasks.length + ' tasks</span></div>' + taskRowsHTML + '</div>';

  return statsHTML + chartHTML + membersHTML + tasksHTML;
}

/* ══════════════════════════════
   BAR CHART — 7 ngay
   ══════════════════════════════ */
function renderBarChart(days, totalMembers) {
  if (!days || days.length === 0) return "";

  var maxCount = Math.max(totalMembers, 1);
  var bars = days.map(function(d, i) {
    var pct      = Math.round(d.count / maxCount * 100);
    var barColor = pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--accent)" : pct > 0 ? "var(--yellow)" : "var(--bg-hover)";
    var nameList = d.names.length > 0 ? d.names.join(", ") : "Chua co ai submit";
    return '<div class="chart-col" data-idx="' + i + '">' +
      '<div class="chart-bar-wrap">' +
        '<div class="chart-tooltip"><strong>' + d.dateStr + '</strong><br>' + d.count + '/' + totalMembers + ' nguoi submit<br><span style="color:var(--text-secondary);font-size:11px">' + nameList + '</span></div>' +
        '<div class="chart-bar" style="height:' + Math.max(pct, 4) + '%;background:' + barColor + '"></div>' +
      '</div>' +
      '<div class="chart-label">' + d.label + '</div>' +
      '<div class="chart-count">' + d.count + '</div>' +
    '</div>';
  }).join("");

  return '<div class="members-section" style="margin-bottom:24px">' +
    '<div class="section-header"><span class="section-title">7 ngay gan nhat</span><span class="section-meta">Hover vao cot de xem chi tiet</span></div>' +
    '<div class="chart-wrap">' + bars + '</div>' +
    '</div>';
}

/* ══════════════════════════════
   OPEN TOOL DETAIL
   ══════════════════════════════ */
async function openToolDetail(toolId) {
  var tool = (window.TOOL_REGISTRY || []).find(function(t) { return t.id === toolId; });
  if (!tool) return;

  currentToolId = toolId;
  navigateTo(toolId);
  $("page-title").textContent = tool.name;
  $("page-subtitle").innerHTML = '<span style="color:var(--accent)">Tool detail</span> — ' + formatDate(new Date());

  $("detail-content").innerHTML =
    '<div class="detail-header">' +
      '<button class="btn-back" id="btn-back-overview"><i class="ti ti-arrow-left"></i> Overview</button>' +
      '<div><h2 style="font-family:var(--font-display);font-size:18px;font-weight:600">' + tool.name + '</h2><p style="font-size:12px;color:var(--text-muted);margin-top:2px">' + tool.description + '</p></div>' +
    '</div>' +
    '<div id="detail-body"><div class="state-loading"><div class="spinner"></div><p>Dang tai data...</p></div></div>';

  showView("detail");
  $("btn-back-overview").addEventListener("click", backToOverview);

  var data = toolDataCache[toolId];
  if (!data || data._loading || data._error) data = await fetchToolData(tool);

  var html = "";
  if (tool.id === "daily-update") {
    html = renderDailyUpdateDetail(data || toolDataCache[toolId]);
  } else {
    html = '<div class="state-empty"><i class="ti ti-tools" style="font-size:32px"></i><p>Chua co detail view.</p></div>';
  }
  $("detail-body").innerHTML = html;
}

function backToOverview() {
  currentToolId = null;
  navigateTo("overview");
  $("page-title").textContent = "Overview";
  $("page-subtitle").innerHTML = 'Tat ca tools — <span id="today-display"></span>';
  $("today-display").textContent = formatDate(new Date());
  showView("overview");
  renderToolsGrid(window.TOOL_REGISTRY || []);
}

/* ══════════════════════════════
   SIDEBAR
   ══════════════════════════════ */
function buildSidebarNav(tools) {
  var container = $("nav-tools");
  container.innerHTML = tools.map(function(tool) {
    var dot = tool.status === "active" ? '<span class="tool-status-dot"></span>' : '<span class="tool-status-dot coming"></span>';
    return '<button class="nav-item" data-view="' + tool.id + '" ' + (tool.status !== "active" ? "disabled" : "") + '><i class="ti ' + tool.icon + '"></i><span>' + tool.name + '</span>' + dot + '</button>';
  }).join("");
  container.querySelectorAll(".nav-item:not([disabled])").forEach(function(btn) {
    btn.addEventListener("click", function() { openToolDetail(btn.dataset.view); });
  });
}

/* ══════════════════════════════
   REFRESH / INIT
   ══════════════════════════════ */
async function refreshAll() {
  var btn = $("btn-refresh");
  btn.classList.add("spinning");
  toolDataCache = {};
  var tools = window.TOOL_REGISTRY || [];
  await Promise.all(tools.map(function(t) { return fetchToolData(t); }));
  renderToolsGrid(tools);
  updateLastUpdated();
  btn.classList.remove("spinning");
  if (currentView === "detail" && currentToolId) openToolDetail(currentToolId);
}

function updateLastUpdated() {
  $("last-updated-sidebar").textContent = "Updated " + new Intl.DateTimeFormat("vi-VN", { hour:"2-digit", minute:"2-digit", second:"2-digit", timeZone:"Asia/Ho_Chi_Minh" }).format(new Date());
}

async function init() {
  var tools = window.TOOL_REGISTRY || [];
  var todayEl = $("today-display");
  if (todayEl) todayEl.textContent = formatDate(new Date());
  renderOverviewStats(tools);
  buildSidebarNav(tools);
  renderToolsGrid(tools);
  $("menu-toggle").addEventListener("click", function() { document.getElementById("sidebar").classList.toggle("open"); });
  $("btn-refresh").addEventListener("click", refreshAll);
  document.querySelector(".nav-item[data-view='overview']").addEventListener("click", function() { if (currentView !== "overview") backToOverview(); });
  await Promise.all(tools.map(function(t) { return fetchToolData(t); }));
  renderToolsGrid(tools);
  updateLastUpdated();
}

document.addEventListener("DOMContentLoaded", init);
