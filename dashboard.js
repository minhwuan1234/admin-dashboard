/**
 * ADMIN DASHBOARD — Core Engine
 * ══════════════════════════════════════════════════════════════
 * dashboard.js là file duy nhất cần hiểu để vận hành dashboard.
 *
 * Luồng hoạt động:
 *   1. Đọc TOOL_REGISTRY (các tool đã đăng ký qua config.js)
 *   2. Render sidebar nav + tool cards trên overview
 *   3. Khi click tool card → fetch data → render detail view
 *
 * Để thêm tool mới: KHÔNG cần sửa file này.
 * Chỉ cần tạo tools/[id]/config.js và đăng ký vào TOOL_REGISTRY.
 * ══════════════════════════════════════════════════════════════
 */

/* ── State ── */
let currentView = "overview";
let currentToolId = null;
let toolDataCache = {};

/* ── Helpers ── */
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
  const val = data[metric.key];
  return metric.colorFn(val) || "";
}

async function fetchJson(url, bustCache = true) {
  const finalUrl = bustCache ? `${url}?t=${ts()}` : url;
  const res = await fetch(finalUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${finalUrl}`);
  return res.json();
}

/* ── Routing ── */
function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(`view-${name}`).classList.add("active");
  currentView = name;
}

function navigateTo(toolId) {
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  const navEl = document.querySelector(`.nav-item[data-view="${toolId}"]`);
  if (navEl) navEl.classList.add("active");
}

/* ══════════════════════════════
   OVERVIEW RENDERING
   ══════════════════════════════ */

function renderOverviewStats(tools) {
  const active = tools.filter(t => t.status === "active").length;
  const total  = tools.length;

  $("overview-stats").innerHTML = `
    <div class="stat-card">
      <span class="stat-label">Tổng tools</span>
      <span class="stat-value">${total}</span>
      <span class="stat-delta"><i class="ti ti-tools" aria-hidden="true"></i> Đã đăng ký</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Đang hoạt động</span>
      <span class="stat-value green">${active}</span>
      <span class="stat-delta"><i class="ti ti-circle-check" aria-hidden="true"></i> Active tools</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Sắp ra mắt</span>
      <span class="stat-value amber">${total - active}</span>
      <span class="stat-delta"><i class="ti ti-clock" aria-hidden="true"></i> Coming soon</span>
    </div>
  `;
}

function renderToolCard(tool, liveData) {
  const isActive = tool.status === "active";
  const hasData  = liveData && !liveData._loading && !liveData._error;

  const badgeClass = isActive ? "active" : (liveData && liveData._loading ? "loading" : "coming");
  const badgeLabel = isActive ? "Active" : (liveData && liveData._loading ? "Loading…" : "Soon");

  let metricsHTML = "";
  if (isActive && hasData) {
    const metricItems = (tool.metrics || []).map(m => {
      const val   = formatMetricValue(m, liveData);
      const color = getMetricColor(m, liveData);
      return `
        <div class="tool-metric">
          <span class="metric-value ${color}">${val}</span>
          <span class="metric-label">${m.label}</span>
        </div>
      `;
    }).join("");

    // Progress bar nếu có submissionRate
    const rate = liveData.submissionRate;
    const barColor = rate >= 80 ? "" : rate >= 50 ? "amber" : "red";
    const barHTML = (rate !== undefined) ? `
      <div class="mini-bar-wrap">
        <div class="mini-bar">
          <div class="mini-bar-fill ${barColor}" style="width:${rate}%"></div>
        </div>
        <span class="mini-bar-pct">${Math.round(rate)}%</span>
      </div>
    ` : "";

    metricsHTML = `<div class="tool-metrics">${metricItems}</div>${barHTML}`;
  } else if (isActive && liveData && liveData._loading) {
    metricsHTML = `
      <div class="tool-metrics">
        <div class="state-loading" style="padding:12px 0;gap:8px;flex-direction:row;">
          <div class="spinner"></div>
          <span style="font-size:12px;">Đang tải...</span>
        </div>
      </div>
    `;
  } else if (isActive && liveData && liveData._error) {
    metricsHTML = `
      <div class="tool-metrics" style="padding-top:14px;border-top:1px solid var(--border);">
        <span style="font-size:12px;color:var(--red);">
          <i class="ti ti-alert-circle" aria-hidden="true"></i> Không thể tải data
        </span>
      </div>
    `;
  } else {
    metricsHTML = `
      <div class="tool-metrics" style="padding-top:14px;border-top:1px solid var(--border);">
        <span style="font-size:12px;color:var(--text-muted);">Chưa có data</span>
      </div>
    `;
  }

  return `
    <div class="tool-card ${tool.status === "coming-soon" ? "coming-soon" : ""}"
         data-tool-id="${tool.id}"
         role="button"
         tabindex="${isActive ? 0 : -1}"
         aria-label="Xem chi tiết ${tool.name}">
      <div class="tool-card-header">
        <div class="tool-icon" aria-hidden="true"><i class="ti ${tool.icon}"></i></div>
        <span class="tool-badge ${badgeClass}">${badgeLabel}</span>
      </div>
      <p class="tool-card-name">${tool.name}</p>
      <p class="tool-card-desc">${tool.description}</p>
      ${metricsHTML}
    </div>
  `;
}

function renderToolsGrid(tools) {
  const grid = $("tools-grid");
  grid.innerHTML = tools.map(t => renderToolCard(t, toolDataCache[t.id])).join("");

  grid.querySelectorAll(".tool-card:not(.coming-soon)").forEach(card => {
    card.addEventListener("click", () => openToolDetail(card.dataset.toolId));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") openToolDetail(card.dataset.toolId);
    });
  });
}

/* ══════════════════════════════
   DATA FETCHING
   ══════════════════════════════ */

async function fetchToolData(tool) {
  if (tool.status !== "active") return null;
  toolDataCache[tool.id] = { _loading: true };

  try {
    /* ── Daily Update: tổng hợp từ 3 sources ── */
    if (tool.id === "daily-update") {
      const ds = tool.dataSource;
      const bust = ds.cacheBust;

      const [daily, responses, members] = await Promise.all([
        fetchJson(ds.dailyTasksUrl, bust),
        fetchJson(ds.responsesUrl,  bust),
        fetchJson(ds.membersUrl,    bust),
      ]);

      const data = processDailyUpdateData(daily, responses, members);
      toolDataCache[tool.id] = data;
      return data;
    }

    /* ── Generic: tool tự xử lý qua renderDetail ── */
    return null;

  } catch (err) {
    console.error(`[${tool.id}] fetch error:`, err);
    toolDataCache[tool.id] = { _error: err.message };
    return null;
  }
}

/* ── Process Daily Update data ── */
function processDailyUpdateData(daily, responses, members) {
  // Build id → name map
  const idToName = {};
  for (const [name, id] of Object.entries(members || {})) {
    idToName[id] = name;
  }

  // All members
  const totalMembers = Object.keys(members || {}).length;

  // Submitted users from responses
  const responseList = Array.isArray(responses)
    ? responses                           // old format: array
    : (responses.responses || []);        // new format: {responses:[...]}

  const submittedIds = new Set(responseList.map(r => r.userId).filter(Boolean));
  const submittedCount = submittedIds.size;
  const missingCount   = Math.max(totalMembers - submittedCount, 0);
  const submissionRate = totalMembers > 0
    ? Math.round((submittedCount / totalMembers) * 100) : 0;

  // Per-member status
  const memberStatuses = Object.entries(members || {}).map(([name, id]) => {
    const submission = responseList.find(r => r.userId === id);
    return {
      name,
      userId: id,
      status:      submission ? "submitted" : "missing",
      submittedAt: submission ? submission.submittedAt : null,
      tasks:       submission ? (submission.tasks || []) : [],
      message:     submission ? (submission.message || "") : "",
    };
  });

  // Tasks with progress
  const allTasks = responseList.flatMap(r => {
    const name = idToName[r.userId] || r.userId;
    return (r.tasks || []).map(t => ({
      ...t,
      memberName: name,
    }));
  });

  // Daily tasks (today's plan)
  const dailyMembers = daily.members || [];

  return {
    totalMembers,
    submittedCount,
    missingCount,
    submissionRate,
    memberStatuses,
    allTasks,
    dailyMembers,
    date: daily.date || responses.date || "",
    responseList,
  };
}

/* ══════════════════════════════
   DETAIL VIEW — DAILY UPDATE
   ══════════════════════════════ */

function renderDailyUpdateDetail(data) {
  if (!data || data._error) {
    return `<div class="state-error"><i class="ti ti-alert-circle"></i> Không thể tải data: ${data?._error || "unknown"}</div>`;
  }
  if (data._loading) {
    return `<div class="state-loading"><div class="spinner"></div><p>Đang tải...</p></div>`;
  }

  const { totalMembers, submittedCount, missingCount, submissionRate, memberStatuses, allTasks, dailyMembers } = data;

  /* ── Header stats ── */
  const rateColor = submissionRate >= 80 ? "green" : submissionRate >= 50 ? "amber" : "red";
  const statsHTML = `
    <div class="detail-stats">
      <div class="stat-card">
        <span class="stat-label">Tỉ lệ submit</span>
        <span class="stat-value ${rateColor}">${submissionRate}%</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Đã submit</span>
        <span class="stat-value green">${submittedCount}</span>
        <span class="stat-delta">/ ${totalMembers} members</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Chưa submit</span>
        <span class="stat-value ${missingCount === 0 ? "green" : "red"}">${missingCount}</span>
        <span class="stat-delta">member${missingCount !== 1 ? "s" : ""}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Tổng tasks</span>
        <span class="stat-value">${allTasks.length}</span>
        <span class="stat-delta">được update hôm nay</span>
      </div>
    </div>
  `;

  /* ── Members table ── */
  const memberRows = memberStatuses
    .sort((a, b) => {
      if (a.status === b.status) return a.name.localeCompare(b.name);
      return a.status === "submitted" ? -1 : 1;
    })
    .map(m => {
      const timeStr = m.submittedAt ? formatTime(m.submittedAt) : "—";
      const taskCount = m.tasks.length;
      const avgProgress = taskCount > 0
        ? Math.round(m.tasks.reduce((sum, t) => sum + parseInt(t.progress || 0), 0) / taskCount)
        : null;

      const progressCell = avgProgress !== null
        ? `<span class="progress-badge ${avgProgress === 100 ? "done" : avgProgress >= 60 ? "high" : "medium"}">${avgProgress}%</span>`
        : `<span style="color:var(--text-muted);font-size:12px;">—</span>`;

      return `
        <tr>
          <td>
            <span style="font-weight:500;">${m.name}</span>
            ${m.message ? `<br><span style="font-size:11px;color:var(--text-muted);">📎 ${m.message.substring(0, 60)}${m.message.length > 60 ? "…" : ""}</span>` : ""}
          </td>
          <td><span class="status-pill ${m.status}">${m.status === "submitted" ? "✓ Đã submit" : "✗ Chưa submit"}</span></td>
          <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);">${timeStr}</td>
          <td>${progressCell}</td>
          <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">${taskCount > 0 ? taskCount + " task" : "—"}</td>
        </tr>
      `;
    }).join("");

  const membersHTML = `
    <div class="members-section">
      <div class="section-header">
        <span class="section-title">Trạng thái submit</span>
        <span class="section-meta">${submittedCount}/${totalMembers} members</span>
      </div>
      <table class="members-table" aria-label="Bảng trạng thái submit">
        <thead>
          <tr>
            <th>Thành viên</th>
            <th>Trạng thái</th>
            <th>Giờ submit</th>
            <th>Avg progress</th>
            <th>Tasks</th>
          </tr>
        </thead>
        <tbody>${memberRows}</tbody>
      </table>
    </div>
  `;

  /* ── Task breakdown ── */
  const taskRowsHTML = allTasks.length === 0
    ? `<div class="state-empty" style="padding:24px;"><i class="ti ti-inbox" style="font-size:28px;"></i><p>Chưa có task nào được submit</p></div>`
    : allTasks.map(t => {
        const pct = parseInt(t.progress || 0);
        const pClass = pct === 100 ? "done" : pct >= 60 ? "high" : pct >= 30 ? "medium" : "low";
        return `
          <div class="task-row">
            <div class="task-title-cell">${t.title || "—"}</div>
            <div class="task-member-cell">${t.memberName || "—"}</div>
            <div class="progress-badge ${pClass}">${t.progress || "—"}</div>
            <div class="time-badge">${t.timeSpent || "—"}</div>
          </div>
        `;
      }).join("");

  const tasksHTML = `
    <div class="task-breakdown">
      <div class="section-header">
        <span class="section-title">Chi tiết tasks</span>
        <span class="section-meta">${allTasks.length} task${allTasks.length !== 1 ? "s" : ""}</span>
      </div>
      ${taskRowsHTML}
    </div>
  `;

  return statsHTML + membersHTML + tasksHTML;
}

/* ══════════════════════════════
   OPEN TOOL DETAIL
   ══════════════════════════════ */

async function openToolDetail(toolId) {
  const tool = (window.TOOL_REGISTRY || []).find(t => t.id === toolId);
  if (!tool) return;

  currentToolId = toolId;
  navigateTo(toolId);

  $("page-title").textContent = tool.name;
  $("page-subtitle").innerHTML = `<span style="color:var(--accent)">Tool detail</span> — ${formatDate(new Date())}`;

  const detailContent = $("detail-content");
  detailContent.innerHTML = `
    <div class="detail-header">
      <button class="btn-back" id="btn-back-overview">
        <i class="ti ti-arrow-left" aria-hidden="true"></i> Overview
      </button>
      <div>
        <h2 style="font-family:var(--font-display);font-size:18px;font-weight:600;">${tool.name}</h2>
        <p style="font-size:12px;color:var(--text-muted);margin-top:2px;">${tool.description}</p>
      </div>
    </div>
    <div id="detail-body">
      <div class="state-loading"><div class="spinner"></div><p>Đang tải data...</p></div>
    </div>
  `;

  showView("detail");

  $("btn-back-overview").addEventListener("click", backToOverview);

  // Fetch data nếu chưa cache
  let data = toolDataCache[toolId];
  if (!data || data._loading || data._error) {
    data = await fetchToolData(tool);
  }

  // Render detail
  let html = "";
  if (tool.id === "daily-update") {
    html = renderDailyUpdateDetail(data || toolDataCache[toolId]);
  } else if (tool.renderDetail) {
    try { html = await tool.renderDetail(data); }
    catch (e) { html = `<div class="state-error">Render error: ${e.message}</div>`; }
  } else {
    html = `<div class="state-empty"><i class="ti ti-tools" style="font-size:32px;"></i><p>Chưa có detail view.</p></div>`;
  }

  $("detail-body").innerHTML = html;
}

function backToOverview() {
  currentToolId = null;
  navigateTo("overview");
  $("page-title").textContent = "Overview";
  $("page-subtitle").innerHTML = `Tất cả tools — <span id="today-display"></span>`;
  $("today-display").textContent = formatDate(new Date());
  showView("overview");
  renderToolsGrid(window.TOOL_REGISTRY || []);
}

/* ══════════════════════════════
   SIDEBAR NAV INJECTION
   ══════════════════════════════ */

function buildSidebarNav(tools) {
  const container = $("nav-tools");
  container.innerHTML = tools.map(tool => {
    const dot = tool.status === "active"
      ? `<span class="tool-status-dot" title="Active"></span>`
      : `<span class="tool-status-dot coming" title="Coming soon"></span>`;
    return `
      <button class="nav-item" data-view="${tool.id}" ${tool.status !== "active" ? "disabled" : ""}>
        <i class="ti ${tool.icon}" aria-hidden="true"></i>
        <span>${tool.name}</span>
        ${dot}
      </button>
    `;
  }).join("");

  container.querySelectorAll(".nav-item:not([disabled])").forEach(btn => {
    btn.addEventListener("click", () => openToolDetail(btn.dataset.view));
  });
}

/* ══════════════════════════════
   REFRESH
   ══════════════════════════════ */

async function refreshAll() {
  const btn = $("btn-refresh");
  btn.classList.add("spinning");

  toolDataCache = {};
  const tools = window.TOOL_REGISTRY || [];

  await Promise.all(tools.map(t => fetchToolData(t)));

  renderToolsGrid(tools);
  updateLastUpdated();
  btn.classList.remove("spinning");

  if (currentView === "detail" && currentToolId) {
    openToolDetail(currentToolId);
  }
}

function updateLastUpdated() {
  const now = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date());
  $("last-updated-sidebar").textContent = `Updated ${now}`;
}

/* ══════════════════════════════
   INIT
   ══════════════════════════════ */

async function init() {
  const tools = window.TOOL_REGISTRY || [];

  // Set today display
  const todayEl = $("today-display");
  if (todayEl) todayEl.textContent = formatDate(new Date());

  // Build UI scaffolding immediately
  renderOverviewStats(tools);
  buildSidebarNav(tools);

  // Render cards with loading state
  renderToolsGrid(tools);

  // Sidebar mobile toggle
  $("menu-toggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  // Refresh button
  $("btn-refresh").addEventListener("click", refreshAll);

  // Overview nav item
  document.querySelector(".nav-item[data-view='overview']").addEventListener("click", () => {
    if (currentView !== "overview") backToOverview();
  });

  // Fetch data for all active tools in parallel
  await Promise.all(tools.map(t => fetchToolData(t)));

  // Re-render with real data
  renderToolsGrid(tools);
  updateLastUpdated();
}

document.addEventListener("DOMContentLoaded", init);
