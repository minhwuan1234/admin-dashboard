window.TOOL_REGISTRY = window.TOOL_REGISTRY || [];

window.TOOL_REGISTRY.push({
  id:          "bd-mkt-daily",
  name:        "BD-MKT Daily Report",
  description: "Tracking morning/evening submit va plan vs actual cua team BD-MKT.",
  icon:        "ti-sun-moon",
  status:      "active",

  _urls: {
    members:     "https://raw.githubusercontent.com/minhwuan1234/BD-MKT-Daily-Update-Task/main/members.json",
    reportsBase: "https://raw.githubusercontent.com/minhwuan1234/BD-MKT-Daily-Update-Task/main/reports/"
  },

  /* ══════════════════════════════
     FETCH DATA
     ══════════════════════════════ */
  fetchData: async function(utils) {
    var urls = this._urls;

    // Lay 30 ngay gan nhat, thu tu tang dan (cu nhat -> moi nhat)
    var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    var days = [];
    for (var i = 29; i >= 0; i--) {
      var d = new Date(now); d.setDate(d.getDate() - i);
      var ds = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
      var lbl = String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0");
      days.push({ dateStr: ds, label: lbl });
    }
    // days[0] = 29 ngay truoc, days[29] = hom nay — thu tu DUNG

    var todayStr = days[days.length - 1].dateStr;

    // Fetch members + today morning/evening
    var members = await utils.fetchJson(urls.members, true).catch(function() { return {}; });

    // Fetch today's reports
    // Bo qua PM (Trang Liu, Hanh) — chi track member thuc su
    var PM_NAMES = ["Trang Liu", "Hanh", "Hạnh"];
    var memberIds = [];
    var memberNames = {};
    Object.entries(members).forEach(function(e) {
      if (PM_NAMES.indexOf(e[0]) !== -1) return;
      var id = e[1].id || e[1];
      memberIds.push(id);
      memberNames[id] = e[0];
    });

    // Fetch morning + evening cho hom nay
    var todayMorning = {};
    var todayEvening = {};

    await Promise.all(memberIds.map(async function(uid) {
      var mUrl = urls.reportsBase + todayStr + "/morning/" + uid + ".json?" + Date.now();
      var eUrl = urls.reportsBase + todayStr + "/evening/" + uid + ".json?" + Date.now();
      var [m, e] = await Promise.all([
        fetch(mUrl).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }),
        fetch(eUrl).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; })
      ]);
      if (m) todayMorning[uid] = m;
      if (e) todayEvening[uid] = e;
    }));

    // Fetch 7 ngay submissions count (chi fetch folder listing khong duoc, nen fetch tung member)
    // Fetch parallel nhung ghi vao dung vi tri idx de giu thu tu
    var chartDays = days.map(function(d) {
      return { dateStr: d.dateStr, label: d.label, morning: 0, evening: 0 };
    });
    await Promise.all(days.map(async function(day, idx) {
      var morningCount = 0, eveningCount = 0;
      await Promise.all(memberIds.map(async function(uid) {
        var t = Date.now();
        var mUrl = urls.reportsBase + day.dateStr + "/morning/" + uid + ".json?" + t;
        var eUrl = urls.reportsBase + day.dateStr + "/evening/" + uid + ".json?" + t;
        var results = await Promise.all([
          fetch(mUrl).then(function(r) { return r.ok; }).catch(function() { return false; }),
          fetch(eUrl).then(function(r) { return r.ok; }).catch(function() { return false; })
        ]);
        if (results[0]) morningCount++;
        if (results[1]) eveningCount++;
      }));
      chartDays[idx].morning = morningCount;
      chartDays[idx].evening = eveningCount;
    }));
    // Sort lai theo dateStr de chac chan thu tu dung
    chartDays.sort(function(a, b) { return a.dateStr.localeCompare(b.dateStr); });

    var totalMembers = memberIds.length;
    var morningCount = Object.keys(todayMorning).length;
    var eveningCount = Object.keys(todayEvening).length;

    return {
      totalMembers: totalMembers,
      morningCount: morningCount,
      eveningCount: eveningCount,
      morningRate:  totalMembers > 0 ? Math.round(morningCount / totalMembers * 100) : 0,
      eveningRate:  totalMembers > 0 ? Math.round(eveningCount / totalMembers * 100) : 0,
      memberNames:  memberNames,
      memberIds:    memberIds,
      members:      members,
      todayMorning: todayMorning,
      todayEvening: todayEvening,
      chartDays:    chartDays,
      todayStr:     todayStr
    };
  },

  /* ══════════════════════════════
     RENDER CARD
     ══════════════════════════════ */
  renderCard: function(data) {
    var mc = data.morningRate >= 80 ? "green" : data.morningRate >= 50 ? "amber" : "red";
    var ec = data.eveningRate >= 80 ? "green" : data.eveningRate >= 50 ? "amber" : "red";
    return '<div class="tool-metrics">' +
      '<div class="tool-metric"><span class="metric-value ' + mc + '">' + data.morningCount + '/' + data.totalMembers + '</span><span class="metric-label">☀️ Morning</span></div>' +
      '<div class="tool-metric"><span class="metric-value ' + ec + '">' + data.eveningCount + '/' + data.totalMembers + '</span><span class="metric-label">🌙 Evening</span></div>' +
      '</div>' +
      '<div class="mini-bar-wrap" style="margin-top:8px">' +
        '<span style="font-size:10px;color:var(--text-muted);width:52px">Morning</span>' +
        '<div class="mini-bar"><div class="mini-bar-fill ' + (data.morningRate < 80 ? data.morningRate >= 50 ? "amber" : "red" : "") + '" style="width:' + data.morningRate + '%"></div></div>' +
        '<span class="mini-bar-pct">' + data.morningRate + '%</span>' +
      '</div>' +
      '<div class="mini-bar-wrap" style="margin-top:4px">' +
        '<span style="font-size:10px;color:var(--text-muted);width:52px">Evening</span>' +
        '<div class="mini-bar"><div class="mini-bar-fill ' + (data.eveningRate < 80 ? data.eveningRate >= 50 ? "amber" : "red" : "") + '" style="width:' + data.eveningRate + '%"></div></div>' +
        '<span class="mini-bar-pct">' + data.eveningRate + '%</span>' +
      '</div>';
  },

  /* ══════════════════════════════
     RENDER DETAIL
     ══════════════════════════════ */
  renderDetail: function(data, utils) {
    if (!data || data._error) return '<div class="state-error"><i class="ti ti-alert-circle"></i> Khong the tai data</div>';
    if (data._loading) return '<div class="state-loading"><div class="spinner"></div><p>Dang tai...</p></div>';

    var tabBar =
      '<div class="tab-bar">' +
        '<button class="tab-btn active" data-tab="tracking"><i class="ti ti-chart-bar"></i> Tracking</button>' +
        '<button class="tab-btn" data-tab="info"><i class="ti ti-info-circle"></i> Thong tin tool</button>' +
      '</div>' +
      '<div id="tab-tracking" class="tab-pane"></div>' +
      '<div id="tab-info" class="tab-pane" style="display:none"></div>';

    /* ── Stats ── */
    var mc = data.morningRate >= 80 ? "green" : data.morningRate >= 50 ? "amber" : "red";
    var ec = data.eveningRate >= 80 ? "green" : data.eveningRate >= 50 ? "amber" : "red";
    var statsHTML =
      '<div class="detail-stats">' +
        '<div class="stat-card"><span class="stat-label">☀️ Morning submit</span><span class="stat-value ' + mc + '">' + data.morningRate + '%</span><span class="stat-delta">' + data.morningCount + '/' + data.totalMembers + ' members</span></div>' +
        '<div class="stat-card"><span class="stat-label">🌙 Evening submit</span><span class="stat-value ' + ec + '">' + data.eveningRate + '%</span><span class="stat-delta">' + data.eveningCount + '/' + data.totalMembers + ' members</span></div>' +
        '<div class="stat-card"><span class="stat-label">Ca 2 submit</span><span class="stat-value green">' +
          Object.keys(data.todayMorning).filter(function(id) { return data.todayEvening[id]; }).length +
        '</span><span class="stat-delta">/ ' + data.totalMembers + ' members</span></div>' +
      '</div>';

    /* ── Chart 7 ngay: grouped morning/evening ── */
    window._bdChartDays = data.chartDays;
    window._bdTotal     = data.totalMembers;

    window._buildBDChart = function(n) {
      var container = document.getElementById("bd-chart-container");
      if (!container) return;
      n = n || 7;
      var allDays = window._bdChartDays || [];
      // Lay n ngay cuoi (moi nhat o cuoi mang = ben phai chart)
      var days = allDays.slice(-n);
      var max  = Math.max(window._bdTotal, 1);
      var hasData = days.some(function(d) { return d.morning > 0 || d.evening > 0; });

      if (!hasData) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;gap:8px;color:var(--text-muted)"><i class="ti ti-chart-bar-off" style="font-size:28px"></i><span>Chua co du lieu</span></div>';
        return;
      }

      container.innerHTML = days.map(function(d) {
        var mp = Math.round(d.morning / max * 100);
        var ep = Math.round(d.evening / max * 100);
        var tipHtml = '<strong>' + d.dateStr + '</strong><br>☀️ Morning: ' + d.morning + '/' + max + '<br>🌙 Evening: ' + d.evening + '/' + max;
        var mBg = mp >= 80 ? "var(--green)" : mp > 0 ? "var(--accent)" : "var(--bg-hover)";
        var eBg = ep >= 80 ? "var(--blue)"  : ep > 0 ? "var(--yellow)" : "var(--bg-hover)";
        return '<div class="chart-col" data-tip="' + tipHtml.replace(/"/g, "&quot;") + '" data-date="' + d.dateStr + '" data-morning="' + d.morning + '" data-evening="' + d.evening + '">' +
          '<div class="chart-bar-wrap" style="gap:3px;align-items:flex-end">' +
            '<div class="chart-bar" style="flex:1;height:' + Math.max(mp, 3) + '%;background:' + mBg + ';border-radius:3px 3px 0 0"></div>' +
            '<div class="chart-bar" style="flex:1;height:' + Math.max(ep, 3) + '%;background:' + eBg + ';border-radius:3px 3px 0 0"></div>' +
          '</div>' +
          '<div class="chart-label">' + d.label + '</div>' +
          '<div class="chart-count">' + d.morning + '/' + d.evening + '</div>' +
        '</div>';
      }).join("");

      // Global tooltip
      var globalTip = document.getElementById("_bd_global_tip");
      if (!globalTip) {
        globalTip = document.createElement("div");
        globalTip.id = "_bd_global_tip";
        globalTip.style.cssText = "position:fixed;z-index:99999;background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text-primary);white-space:nowrap;line-height:1.6;pointer-events:none;display:none;font-family:var(--font-body)";
        document.body.appendChild(globalTip);
      }
      container.querySelectorAll(".chart-col").forEach(function(col) {
        col.addEventListener("mouseenter", function() {
          var tip = col.dataset.tip; if (!tip) return;
          globalTip.innerHTML = tip.replace(/&quot;/g, '"');
          globalTip.style.display = "block";
        });
        col.addEventListener("mousemove", function(e) {
          globalTip.style.left = (e.clientX - globalTip.offsetWidth / 2) + "px";
          globalTip.style.top  = (e.clientY - globalTip.offsetHeight - 14) + "px";
        });
        col.addEventListener("mouseleave", function() { globalTip.style.display = "none"; });

        // Click -> fetch day detail
        if (parseInt(col.dataset.morning) > 0 || parseInt(col.dataset.evening) > 0) {
          col.style.cursor = "pointer";
          col.addEventListener("click", function() {
            var dateStr = col.dataset.date;
            var detail  = document.getElementById("bd-day-detail");
            if (!detail) return;
            if (detail.dataset.activeDate === dateStr && detail.style.display !== "none") {
              detail.style.display = "none";
              detail.dataset.activeDate = "";
              container.querySelectorAll(".chart-col--active").forEach(function(c) { c.classList.remove("chart-col--active"); });
              return;
            }
            container.querySelectorAll(".chart-col--active").forEach(function(c) { c.classList.remove("chart-col--active"); });
            col.classList.add("chart-col--active");
            detail.dataset.activeDate = dateStr;
            detail.style.display = "block";
            detail.innerHTML = '<div class="state-loading" style="padding:20px"><div class="spinner"></div><p>Dang tai du lieu ngay ' + dateStr + '...</p></div>';
            window._fetchBDDay(dateStr);
          });
        }
      });
    };

    // Store refs for click fetch
    window._bdMemberIds   = data.memberIds;
    window._bdMemberNames = data.memberNames;
    window._bdReportsBase = "https://raw.githubusercontent.com/minhwuan1234/BD-MKT-Daily-Update-Task/main/reports/";

    window._fetchBDDay = function(dateStr) {
      var detail     = document.getElementById("bd-day-detail");
      var memberIds  = window._bdMemberIds  || [];
      var memberNames= window._bdMemberNames|| {};
      var base       = window._bdReportsBase;
      if (!detail) return;

      Promise.all(memberIds.map(function(uid) {
        var t = Date.now();
        return Promise.all([
          fetch(base + dateStr + "/morning/" + uid + ".json?" + t).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }),
          fetch(base + dateStr + "/evening/" + uid + ".json?" + t).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; })
        ]).then(function(res) { return { uid: uid, morning: res[0], evening: res[1] }; });
      })).then(function(results) {
        var hasAny = results.some(function(r) { return r.morning || r.evening; });
        if (!hasAny) {
          detail.innerHTML = '<div class="state-empty" style="padding:24px"><i class="ti ti-inbox" style="font-size:28px"></i><p>Chua co du lieu cho ngay ' + dateStr + '</p></div>';
          return;
        }

        var maxT = 0;
        results.forEach(function(r) { if (r.morning && r.morning.tasks) maxT = Math.max(maxT, r.morning.tasks.length); });
        maxT = Math.max(maxT, 1);

        var ths = '<th>Thanh vien</th><th>Morning</th><th>Evening</th>';
        for (var i = 0; i < maxT; i++) ths += '<th>Task ' + (i+1) + '</th><th>Plan</th><th>Actual</th><th>Time</th>';

        var rows = results.map(function(r) {
          var name = memberNames[r.uid] || r.uid;
          var mTime = r.morning ? new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Ho_Chi_Minh"}).format(new Date(r.morning.submittedAt)) : "—";
          var eTime = r.evening ? new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Ho_Chi_Minh"}).format(new Date(r.evening.submittedAt)) : "—";
          var mCell = r.morning ? '<span class="status-pill submitted" style="font-size:10px;white-space:nowrap">☀️ Submit</span><br><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + mTime + '</span>' : '<span class="status-pill missing" style="font-size:10px;white-space:nowrap">✗ Chua</span>';
          var eCell = r.evening ? '<span class="status-pill submitted" style="font-size:10px;white-space:nowrap">🌙 Submit</span><br><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + eTime + '</span>' : '<span class="status-pill missing" style="font-size:10px;white-space:nowrap">✗ Chua</span>';

          var taskCols = "";
          for (var i = 0; i < maxT; i++) {
            var t      = r.morning && r.morning.tasks ? r.morning.tasks[i] : null;
            var actual = r.evening && r.evening.tasks ? r.evening.tasks[i] : null;
            var prog   = actual ? actual.progress : null;
            var pc     = prog === "100%" ? "done" : prog && parseInt(prog) >= 60 ? "high" : "medium";
            taskCols +=
              '<td style="font-size:12px;color:var(--text-primary)">' + (t ? (t.title||"—") : "—") + '</td>' +
              '<td style="font-size:11px;color:var(--text-secondary);white-space:nowrap">' + (t ? (t.expectedTime||"—") : "—") + '</td>' +
              '<td>' + (prog ? '<span class="progress-badge ' + pc + '">' + prog + '</span>' : '<span style="color:var(--text-muted)">—</span>') + '</td>' +
              '<td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);white-space:nowrap">' + (actual && actual.timeSpent ? actual.timeSpent : "—") + '</td>';
          }
          return '<tr><td style="font-weight:500;white-space:nowrap;vertical-align:middle">' + name + '</td><td style="vertical-align:middle">' + mCell + '</td><td style="vertical-align:middle">' + eCell + '</td>' + taskCols + '</tr>';
        }).join("");

        detail.innerHTML =
          '<div class="members-section" style="overflow-x:auto">' +
            '<div class="section-header"><span class="section-title">Chi tiet ngay ' + dateStr + '</span><span class="section-meta">' + results.filter(function(r){return r.morning;}).length + ' morning · ' + results.filter(function(r){return r.evening;}).length + ' evening</span></div>' +
            '<table class="members-table" style="min-width:100%;table-layout:auto"><thead><tr>' + ths + '</tr></thead><tbody>' + rows + '</tbody></table>' +
          '</div>';
      });
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
      '</div>';

    /* ── Members table ── */
    // Tinh max tasks de biet so cot can tao
    var maxTasks = 0;
    data.memberIds.forEach(function(uid) {
      var m = data.todayMorning[uid];
      if (m && m.tasks) maxTasks = Math.max(maxTasks, m.tasks.length);
    });
    maxTasks = Math.max(maxTasks, 1);

    // Build header: Thanh vien | Morning | Evening | Task 1 | Plan | Actual | Task 2 | Plan | Actual ...
    var thHeaders = '<th>Thanh vien</th><th>Morning</th><th>Evening</th>';
    for (var ti = 0; ti < maxTasks; ti++) {
      thHeaders += '<th>Task ' + (ti+1) + '</th><th>Plan</th><th>Actual</th><th>Time</th>';
    }

    var memberRows = data.memberIds.map(function(uid) {
      var name    = data.memberNames[uid] || uid;
      var morning = data.todayMorning[uid];
      var evening = data.todayEvening[uid];
      var mTime   = morning ? (utils ? utils.formatTime(morning.submittedAt) : "—") : "—";
      var eTime   = evening ? (utils ? utils.formatTime(evening.submittedAt) : "—") : "—";

      var mCell = morning
        ? '<span class="status-pill submitted" style="font-size:10px;white-space:nowrap">☀️ Submit</span><br><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + mTime + '</span>'
        : '<span class="status-pill missing" style="font-size:10px;white-space:nowrap">✗ Chua</span>';
      var eCell = evening
        ? '<span class="status-pill submitted" style="font-size:10px;white-space:nowrap">🌙 Submit</span><br><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + eTime + '</span>'
        : '<span class="status-pill missing" style="font-size:10px;white-space:nowrap">✗ Chua</span>';

      var taskCols = "";
      for (var ti = 0; ti < maxTasks; ti++) {
        var t      = morning && morning.tasks ? morning.tasks[ti] : null;
        var actual = evening && evening.tasks ? evening.tasks[ti] : null;
        var prog   = actual ? actual.progress : null;
        var pc     = prog === "100%" ? "done" : prog && parseInt(prog) >= 60 ? "high" : "medium";

        taskCols +=
          '<td style="font-size:12px;color:var(--text-primary)">' + (t ? (t.title||"—") : "—") + '</td>' +
          '<td style="font-size:11px;color:var(--text-secondary);white-space:nowrap">' + (t ? (t.expectedTime||"—") : "—") + '</td>' +
          '<td>' + (prog ? '<span class="progress-badge ' + pc + '">' + prog + '</span>' : '<span style="color:var(--text-muted)">—</span>') + '</td>' +
          '<td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);white-space:nowrap">' + (actual && actual.timeSpent ? actual.timeSpent : "—") + '</td>';
      }

      return '<tr>' +
        '<td style="font-weight:500;white-space:nowrap;vertical-align:middle">' + name + '</td>' +
        '<td style="vertical-align:middle">' + mCell + '</td>' +
        '<td style="vertical-align:middle">' + eCell + '</td>' +
        taskCols +
      '</tr>';
    }).join("");

    var membersHTML =
      '<div class="members-section" style="overflow-x:auto">' +
        '<div class="section-header"><span class="section-title">Trang thai hom nay</span><span class="section-meta">' + data.todayStr + '</span></div>' +
        '<table class="members-table" style="min-width:100%;table-layout:auto"><thead><tr>' +
          thHeaders +
        '</tr></thead><tbody>' + memberRows + '</tbody></table>' +
      '</div>';

    /* ── Tab info ── */
    var infoHTML =
      '<div class="tool-info-page">' +
        '<div class="tool-info-hero">' +
          '<div class="tool-info-icon"><i class="ti ti-sun-moon"></i></div>' +
          '<div>' +
            '<h2 class="tool-info-name">BD-MKT Daily Report</h2>' +
            '<p class="tool-info-tagline">Tracking morning/evening submit va plan vs actual cua team BD-MKT.</p>' +
          '</div>' +
        '</div>' +
        '<div class="tool-info-section">' +
          '<div class="tool-info-section-title"><i class="ti ti-alert-triangle"></i> Van de can giai quyet</div>' +
          '<p class="tool-info-text">Them noi dung o day.</p>' +
        '</div>' +
        '<div class="tool-info-section">' +
          '<div class="tool-info-section-title"><i class="ti ti-info-circle"></i> Mo ta</div>' +
          '<p class="tool-info-text">Moi ngay team BD-MKT dien 2 form: Morning (plan task + output du kien) va Evening (actual progress). Dashboard tong hop ti le submit va so sanh plan vs actual.</p>' +
        '</div>' +
        '<div class="tool-info-grid">' +
          '<div class="tool-info-section">' +
            '<div class="tool-info-section-title"><i class="ti ti-settings"></i> Cau hinh</div>' +
            '<div class="tool-info-kv">' +
              '<div class="kv-row"><span class="kv-key">Timezone</span><span class="kv-val">Asia/Ho_Chi_Minh</span></div>' +
              '<div class="kv-row"><span class="kv-key">Tan suat</span><span class="kv-val">Hang ngay (Thu 2 – Thu 6)</span></div>' +
              '<div class="kv-row"><span class="kv-key">Platform</span><span class="kv-val">Lark / Feishu</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="tool-info-section">' +
            '<div class="tool-info-section-title"><i class="ti ti-database"></i> Data sources</div>' +
            '<div class="tool-info-kv">' +
              '<div class="kv-row"><span class="kv-key">members.json</span><span class="kv-val kv-mono">BD-MKT-Daily-Update-Task</span></div>' +
              '<div class="kv-row"><span class="kv-key">reports/DATE/morning</span><span class="kv-val kv-mono">ou_xxx.json</span></div>' +
              '<div class="kv-row"><span class="kv-key">reports/DATE/evening</span><span class="kv-val kv-mono">ou_xxx.json</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="tool-info-section">' +
          '<div class="tool-info-section-title"><i class="ti ti-link"></i> Lien ket</div>' +
          '<div class="tool-info-links">' +
            '<a class="tool-info-link" href="https://github.com/minhwuan1234/BD-MKT-Daily-Update-Task" target="_blank"><i class="ti ti-brand-github"></i> BD-MKT-Daily-Update-Task</a>' +
          '</div>' +
        '</div>' +
      '</div>';

    /* ── Store + init tabs ── */
    window._bdTrackingHTML = statsHTML + chartHTML + membersHTML;
    window._bdInfoHTML     = infoHTML;

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
              if (window._buildBDChart) {
                var sel = document.getElementById("bd-chart-range");
                window._buildBDChart(sel ? parseInt(sel.value) : 7);
              }
            }, 50);
          }
        });
      });
    };

    return tabBar;
  }
});
