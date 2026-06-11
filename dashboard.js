/* ══════════════════════════════════════════════════════════════
   ADMIN DASHBOARD — Core Engine v2
   
   De them tool moi: chi can tao tools/[id]/config.js
   Dashboard khong biet gi ve tool cu the.
   
   Config.js phai export object vao window.TOOL_REGISTRY voi:
     - id, name, description, icon, status
     - fetchData(utils)   → tra ve data object
     - renderCard(data)   → tra ve metrics HTML cho overview card
     - renderDetail(data) → tra ve HTML cho detail page
   ══════════════════════════════════════════════════════════════ */

let currentView = "overview";
let currentToolId = null;
let toolDataCache = {};

const $ = (id) => document.getElementById(id);

/* ══════════════════════════════
   API KEY BOOTSTRAP
   Lưu key vào localStorage, apply cho tất cả tools
   ══════════════════════════════ */
(function() {
  var KEY_NAME = "fl_openai_key";

  function applyKey(key) {
    /* Ghi đè biến của từng tool config */
    if (typeof _CS_OPENAI_KEY !== "undefined") _CS_OPENAI_KEY = key; // eslint-disable-line
    if (typeof _DU_OPENAI_KEY !== "undefined") _DU_OPENAI_KEY = key; // eslint-disable-line
    if (typeof _BD_OPENAI_KEY !== "undefined") _BD_OPENAI_KEY = key; // eslint-disable-line
    window._FL_OPENAI_KEY = key;
  }

  function showKeyModal(onSuccess) {
    var modal = document.createElement("div");
    modal.id = "_fl_key_modal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)";
    modal.innerHTML =
      '<div style="background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:var(--radius);padding:32px;width:440px;max-width:92vw">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">' +
          '<div style="width:40px;height:40px;background:var(--accent-dim);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;color:var(--accent);flex-shrink:0">' +
            '<i class="ti ti-key" style="font-size:20px"></i>' +
          '</div>' +
          '<div>' +
            '<p style="font-family:var(--font-display);font-size:16px;font-weight:600;color:var(--text-primary)">OpenAI API Key</p>' +
            '<p style="font-size:12px;color:var(--text-muted);margin-top:3px">Dùng cho tính năng AI Insight. Lưu local, không gửi đi đâu ngoài OpenAI.</p>' +
          '</div>' +
        '</div>' +
        '<input id="_fl_key_input" type="password" placeholder="sk-..." autocomplete="off" style="' +
          'width:100%;padding:10px 14px;background:var(--bg-card);' +
          'border:1px solid var(--border-strong);border-radius:var(--radius-sm);' +
          'color:var(--text-primary);font-family:var(--font-mono);font-size:13px;' +
          'outline:none;margin-bottom:8px;box-sizing:border-box' +
        '" />' +
        '<p id="_fl_key_err" style="font-size:12px;color:var(--red);margin-bottom:12px;min-height:16px"></p>' +
        '<div style="display:flex;gap:10px">' +
          '<button id="_fl_key_save" style="flex:1;padding:10px;background:var(--accent);color:#000;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:600;cursor:pointer;font-family:var(--font-body)">Lưu & tiếp tục</button>' +
          '<button id="_fl_key_skip" style="padding:10px 16px;background:none;color:var(--text-muted);border:1px solid var(--border-strong);border-radius:var(--radius-sm);font-size:13px;cursor:pointer;font-family:var(--font-body)">Bỏ qua</button>' +
        '</div>' +
        '<p style="font-size:11px;color:var(--text-muted);margin-top:14px;line-height:1.6">' +
          'Key được lưu trong localStorage của browser này. Để đổi key sau: mở console → <code style="font-family:var(--font-mono);background:var(--bg-hover);padding:1px 5px;border-radius:3px">localStorage.removeItem("fl_openai_key")</code> rồi reload.' +
        '</p>' +
      '</div>';

    document.body.appendChild(modal);

    var input  = document.getElementById("_fl_key_input");
    var errEl  = document.getElementById("_fl_key_err");
    var saveBtn = document.getElementById("_fl_key_save");
    var skipBtn = document.getElementById("_fl_key_skip");

    input.focus();

    /* Enter để save */
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter") saveBtn.click();
    });

    saveBtn.addEventListener("click", function() {
      var key = input.value.trim();
      if (!key) { errEl.textContent = "Vui lòng nhập key."; return; }
      if (!key.startsWith("sk-")) { errEl.textContent = "Key không hợp lệ — phải bắt đầu bằng sk-"; return; }
      localStorage.setItem(KEY_NAME, key);
      applyKey(key);
      document.body.removeChild(modal);
      onSuccess();
    });

    skipBtn.addEventListener("click", function() {
      document.body.removeChild(modal);
      onSuccess();
    });
  }

  /* Kiểm tra key đã có chưa */
  var stored = localStorage.getItem(KEY_NAME);
  if (stored) {
    applyKey(stored);
  } else {
    /* Defer init cho đến khi user nhập key / bỏ qua */
    document.addEventListener("DOMContentLoaded", function() {
      showKeyModal(function() { init(); });
    });
    /* Ngăn DOMContentLoaded bên dưới chạy trước */
    window._fl_skip_auto_init = true;
  }
})();

/* ── Utils truyen vao fetchData cua tung tool ── */
const UTILS = {
  fetchJson: async function(url, bustCache) {
    var finalUrl = bustCache ? url + "?t=" + Date.now() : url;
    var res = await fetch(finalUrl);
    if (!res.ok) throw new Error("HTTP " + res.status + ": " + finalUrl);
    return res.json();
  },
  formatDate: function(date) {
    return new Intl.DateTimeFormat("vi-VN", {
      weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
      timeZone: "Asia/Ho_Chi_Minh"
    }).format(date);
  },
  formatTime: function(isoString) {
    if (!isoString) return "—";
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit", minute: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh"
    }).format(new Date(isoString));
  },
  getVNDateStr: function(offsetDays) {
    var d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    d.setDate(d.getDate() + (offsetDays || 0));
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }
};

/* ── Routing ── */
function showView(name) {
  document.querySelectorAll(".view").forEach(function(v) { v.classList.remove("active"); });
  $("view-" + name).classList.add("active");
  currentView = name;
}

function navigateTo(toolId) {
  document.querySelectorAll(".nav-item").forEach(function(el) { el.classList.remove("active"); });
  var el = document.querySelector(".nav-item[data-view='" + toolId + "']");
  if (el) el.classList.add("active");
}

/* ══════════════════════════════
   OVERVIEW
   ══════════════════════════════ */
function renderOverviewStats(tools) {
  var active = tools.filter(function(t) { return t.status === "active"; }).length;
  $("overview-stats").innerHTML =
    '<div class="stat-card"><span class="stat-label">Tong tools</span><span class="stat-value">' + tools.length + '</span><span class="stat-delta"><i class="ti ti-tools"></i> Da dang ky</span></div>' +
    '<div class="stat-card"><span class="stat-label">Dang hoat dong</span><span class="stat-value green">' + active + '</span><span class="stat-delta"><i class="ti ti-circle-check"></i> Active</span></div>' +
    '<div class="stat-card"><span class="stat-label">Sap ra mat</span><span class="stat-value amber">' + (tools.length - active) + '</span><span class="stat-delta"><i class="ti ti-clock"></i> Coming soon</span></div>';
}

function renderToolCard(tool, data) {
  var isActive   = tool.status === "active";
  var badgeClass = isActive ? "active" : "coming";
  var badgeLabel = isActive ? "Active" : "Soon";

  var bodyHTML = "";
  if (!isActive) {
    bodyHTML = '<div class="tool-metrics" style="padding-top:14px;border-top:1px solid var(--border);"><span style="font-size:12px;color:var(--text-muted)">Coming soon</span></div>';
  } else if (!data || data._loading) {
    bodyHTML = '<div class="tool-metrics"><div class="state-loading" style="padding:12px 0;gap:8px;flex-direction:row"><div class="spinner"></div><span style="font-size:12px">Dang tai...</span></div></div>';
  } else if (data._error) {
    bodyHTML = '<div class="tool-metrics" style="padding-top:14px;border-top:1px solid var(--border)"><span style="font-size:12px;color:var(--red)"><i class="ti ti-alert-circle"></i> Loi tai data</span></div>';
  } else if (tool.renderCard) {
    bodyHTML = tool.renderCard(data);
  }

  return '<div class="tool-card' + (isActive ? "" : " coming-soon") + '" data-tool-id="' + tool.id + '" role="button" tabindex="' + (isActive ? 0 : -1) + '">' +
    '<div class="tool-card-header"><div class="tool-icon"><i class="ti ' + tool.icon + '"></i></div><span class="tool-badge ' + badgeClass + '">' + badgeLabel + '</span></div>' +
    '<p class="tool-card-name">' + tool.name + '</p>' +
    '<p class="tool-card-desc">' + tool.description + '</p>' +
    bodyHTML + '</div>';
}

function renderToolsGrid(tools) {
  var grid = $("tools-grid");
  grid.innerHTML = tools.map(function(t) { return renderToolCard(t, toolDataCache[t.id]); }).join("");
  grid.querySelectorAll(".tool-card:not(.coming-soon)").forEach(function(card) {
    card.addEventListener("click", function() { openToolDetail(card.dataset.toolId); });
  });
}

/* ══════════════════════════════
   DATA FETCHING — goi tool.fetchData()
   ══════════════════════════════ */
async function fetchToolData(tool) {
  if (tool.status !== "active" || !tool.fetchData) return null;
  toolDataCache[tool.id] = { _loading: true };
  try {
    var data = await tool.fetchData(UTILS);
    toolDataCache[tool.id] = data;
    return data;
  } catch (err) {
    console.error("[" + tool.id + "] fetch error:", err);
    toolDataCache[tool.id] = { _error: err.message };
    return null;
  }
}

/* ══════════════════════════════
   DETAIL VIEW — goi tool.renderDetail()
   ══════════════════════════════ */
async function openToolDetail(toolId) {
  var tool = (window.TOOL_REGISTRY || []).find(function(t) { return t.id === toolId; });
  if (!tool) return;

  currentToolId = toolId;
  navigateTo(toolId);
  $("page-title").textContent = tool.name;
  $("page-subtitle").innerHTML = '<span style="color:var(--accent)">Tool detail</span> — ' + UTILS.formatDate(new Date());

  $("detail-content").innerHTML =
    '<div class="detail-header">' +
      '<button class="btn-back" id="btn-back-overview"><i class="ti ti-arrow-left"></i> Overview</button>' +
      '<div><h2 style="font-family:var(--font-display);font-size:18px;font-weight:600">' + tool.name + '</h2>' +
      '<p style="font-size:12px;color:var(--text-muted);margin-top:2px">' + tool.description + '</p></div>' +
    '</div>' +
    '<div id="detail-body"><div class="state-loading"><div class="spinner"></div><p>Dang tai...</p></div></div>';

  showView("detail");
  $("btn-back-overview").addEventListener("click", backToOverview);

  var data = toolDataCache[toolId];
  if (!data || data._loading || data._error) data = await fetchToolData(tool);

  var html = '<div class="state-empty"><i class="ti ti-tools" style="font-size:32px"></i><p>Chua co detail view.</p></div>';
  if (tool.renderDetail) {
    try { html = tool.renderDetail(data || toolDataCache[toolId], UTILS); }
    catch (e) { html = '<div class="state-error">Render error: ' + e.message + '</div>'; }
  }
  $("detail-body").innerHTML = html;

  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      if (toolId === "daily-update" && window._initDUTabs) {
        window._initDUTabs();
      } else if (toolId === "candidate-scoring" && window._initCSTabs) {
        window._initCSTabs();
      } else if (toolId === "bd-mkt-daily" && window._initBDTabs) {
        window._initBDTabs();
      } else {
        var chartRange = document.getElementById("chart-range");
        if (chartRange && window._buildDUChart) {
          window._buildDUChart(parseInt(chartRange.value));
          chartRange.addEventListener("change", function() {
            window._buildDUChart(parseInt(this.value));
          });
        }
      }
    });
  });
}

function backToOverview() {
  currentToolId = null;
  navigateTo("overview");
  $("page-title").textContent = "Overview";
  $("page-subtitle").innerHTML = 'Tat ca tools — <span id="today-display"></span>';
  $("today-display").textContent = UTILS.formatDate(new Date());
  showView("overview");
  renderToolsGrid(window.TOOL_REGISTRY || []);
}

/* ══════════════════════════════
   SIDEBAR
   ══════════════════════════════ */
function buildSidebarNav(tools) {
  var container = $("nav-tools");
  container.innerHTML = tools.map(function(tool) {
    var dot = '<span class="tool-status-dot' + (tool.status !== "active" ? " coming" : "") + '"></span>';
    return '<button class="nav-item" data-view="' + tool.id + '" ' + (tool.status !== "active" ? "disabled" : "") + '>' +
      '<i class="ti ' + tool.icon + '"></i><span>' + tool.name + '</span>' + dot + '</button>';
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
  await Promise.all(tools.map(fetchToolData));
  renderToolsGrid(tools);
  updateLastUpdated();
  btn.classList.remove("spinning");
  if (currentView === "detail" && currentToolId) openToolDetail(currentToolId);
}

function updateLastUpdated() {
  $("last-updated-sidebar").textContent = "Updated " + new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date());
}

async function init() {
  var tools = window.TOOL_REGISTRY || [];
  var todayEl = $("today-display");
  if (todayEl) todayEl.textContent = UTILS.formatDate(new Date());
  renderOverviewStats(tools);
  buildSidebarNav(tools);
  renderToolsGrid(tools);
  $("menu-toggle").addEventListener("click", function() { $("sidebar").classList.toggle("open"); });
  $("btn-refresh").addEventListener("click", refreshAll);
  document.querySelector(".nav-item[data-view='overview']").addEventListener("click", function() {
    if (currentView !== "overview") backToOverview();
  });
  await Promise.all(tools.map(fetchToolData));
  renderToolsGrid(tools);
  updateLastUpdated();
}

document.addEventListener("DOMContentLoaded", function() {
  if (!window._fl_skip_auto_init) init();
});
