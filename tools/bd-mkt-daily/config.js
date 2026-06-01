/* ══════════════════════════════════════════════════════════════
   TOOL CONFIG: Daily Update
   
   3 functions bat buoc:
     fetchData(utils)    → fetch + xu ly data, tra ve object
     renderCard(data)    → HTML metrics cho overview card
     renderDetail(data)  → HTML cho detail page
   ══════════════════════════════════════════════════════════════ */

window.TOOL_REGISTRY = window.TOOL_REGISTRY || [];

window.TOOL_REGISTRY.push({
  id:          "daily-update",
  name:        "Daily Task Update Process PM",
  description: "Tracking ti le submit standup hang ngay cua team.",
  icon:        "ti-square-check",
  status:      "active",

  /* ── URLs ── */
  _urls: {
    dailyTasks:   "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/daily-tasks.json",
    responses:    "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/responses.json",
    members:      "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/members.json",
    submissions:  "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/tracking/daily-update-submissions.json",
    snapshotBase: "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/tracking/snapshots/responses-"
  },

  /* ══════════════════════════════
     FETCH + PROCESS DATA
     ══════════════════════════════ */
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
    /* id → name map */
    var idToName = {};
    Object.entries(members || {}).forEach(function(e) { idToName[e[1]] = e[0]; });

    /* responseList — chi lay record hop le */
    var responseList = Array.isArray(responses) ? responses : (responses.responses || []);
    responseList = responseList.filter(function(r) { return r.userId && r.userId.startsWith("ou_"); });

    /* Active members = ai co submission trong lich su */
    var cleanSubs = Array.isArray(submissions)
      ? submissions.filter(function(s) { return s.userId && s.userId.startsWith("ou_"); })
      : [];
    var activeIds = new Set(cleanSubs.map(function(s) { return s.userId; }));

    /* Fallback: neu chua co submissions thi dung daily-tasks */
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

    /* Bar chart: 7 ngay gan nhat */
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

  /* ══════════════════════════════
     RENDER CARD (overview)
     ══════════════════════════════ */
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

  /* ══════════════════════════════
     RENDER DETAIL
     ══════════════════════════════ */
  renderDetail: function(data, utils) {
    if (!data || data._error) return '<div class="state-error"><i class="ti ti-alert-circle"></i> Khong the tai data</div>';
    if (data._loading) return '<div class="state-loading"><div class="spinner"></div><p>Dang tai...</p></div>';

    var tabBar =
      '<div class="tab-bar">' +
        '<button class="tab-btn active" data-tab="tracking"><i class="ti ti-chart-bar"></i> Tracking</button>' +
        '<button class="tab-btn" data-tab="taskinfo"><i class="ti ti-list-check"></i> Thong tin task</button>' +
      '</div>' +
      '<div id="tab-tracking" class="tab-pane active"></div>' +
      '<div id="tab-taskinfo" class="tab-pane" style="display:none"></div>';

    var rate = data.submissionRate;
    var rateColor = rate >= 80 ? "green" : rate >= 50 ? "amber" : "red";

    /* Stats */
    var statsHTML =
      '<div class="detail-stats">' +
      '<div class="stat-card"><span class="stat-label">Ti le submit</span><span class="stat-value ' + rateColor + '">' + rate + '%</span></div>' +
      '<div class="stat-card"><span class="stat-label">Da submit</span><span class="stat-value green">' + data.submittedCount + '</span><span class="stat-delta">/ ' + data.totalMembers + ' members</span></div>' +
      '<div class="stat-card"><span class="stat-label">Chua submit</span><span class="stat-value ' + (data.missingCount === 0 ? "green" : "red") + '">' + data.missingCount + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">Tong tasks</span><span class="stat-value">' + data.allTasks.length + '</span></div>' +
      '</div>';

    /* Bar chart — render via window function, called after DOM inject */
    window._duSubs  = data._rawSubmissions || [];
    window._duTotal = data.totalMembers;

    window._buildDUChart = function(n) {
      var container = document.getElementById("chart-container");
      if (!container) return;

      // Nhom theo tuan neu range >= 30 ngay
      var groupByWeek = n >= 30;

      var now  = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
      var buckets = [];

      if (!groupByWeek) {
        // Tung ngay
        for (var i = n - 1; i >= 0; i--) {
          var d   = new Date(now); d.setDate(d.getDate() - i);
          var ds  = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
          var lbl = String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0");
          var subs  = window._duSubs.filter(function(s) { return s.date === ds; });
          var names = subs.map(function(s) { return s.memberName||s.userId; }).filter(function(x) { return x !== "Unknown"; });
          buckets.push({ lbl: lbl, tooltip: ds, dateStr: ds, count: names.length, names: names, days: 1 });
        }
      } else {
        // Theo tuan — moi bucket = 7 ngay
        var totalWeeks = Math.ceil(n / 7);
        for (var w = totalWeeks - 1; w >= 0; w--) {
          var weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - w * 7 - 6);
          var weekEnd   = new Date(now); weekEnd.setDate(weekEnd.getDate() - w * 7);
          var lblS = String(weekStart.getDate()).padStart(2,"0") + "/" + String(weekStart.getMonth()+1).padStart(2,"0");
          var lblE = String(weekEnd.getDate()).padStart(2,"0") + "/" + String(weekEnd.getMonth()+1).padStart(2,"0");
          var allNames = [];
          var submittedDays = 0;
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
          buckets.push({
            lbl: lblS + "-" + lblE,
            tooltip: lblS + " ~ " + lblE,
            count: submittedDays,   // so ngay co submission trong tuan
            names: allNames,
            days: 7
          });
        }
      }

      var max     = groupByWeek ? 5 : Math.max(window._duTotal, 1); // tuan max 5 ngay lam viec
      var hasData = buckets.some(function(b) { return b.count > 0; });

      if (!hasData) {
        container.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:var(--text-muted)">' +
          '<i class="ti ti-chart-bar-off" style="font-size:28px"></i>' +
          '<span style="font-size:13px">Chua co du lieu trong khoang thoi gian nay</span>' +
          '</div>';
        return;
      }

      container.innerHTML = buckets.map(function(b) {
        var pct = groupByWeek
          ? Math.round(b.count / max * 100)
          : Math.round(b.count / Math.max(window._duTotal, 1) * 100);
        var bc  = pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--accent)" : pct > 0 ? "var(--yellow)" : "var(--bg-hover)";
        var nl  = b.names.length > 0 ? b.names.join(", ") : "Chua co du lieu";
        var tooltipBody = groupByWeek
          ? b.count + " ngay co submission<br><span style=\"color:var(--text-secondary);font-size:11px\">" + nl + "</span>"
          : b.count + "/" + window._duTotal + " nguoi submit<br><span style=\"color:var(--text-secondary);font-size:11px\">" + nl + "</span>";
        var clickable = b.count > 0 && !groupByWeek ? "chart-col--clickable" : "";
        var tipHtml = '<strong>' + b.tooltip + '</strong><br>' + tooltipBody + (b.count > 0 && !groupByWeek ? '<br><span style="color:var(--accent);font-size:10px">↓ Click de xem chi tiet</span>' : '');
        return '<div class="chart-col ' + clickable + '" data-date="' + b.dateStr + '" data-has-data="' + (b.count > 0 ? "1" : "0") + '" data-tip="' + tipHtml.replace(/"/g, "&quot;") + '">' +
          '<div class="chart-bar-wrap">' +
            '<div class="chart-bar" style="height:' + Math.max(pct, 4) + '%;background:' + bc + '"></div>' +
          '</div>' +
          '<div class="chart-label" style="font-size:' + (groupByWeek ? "9px" : "11px") + '">' + b.lbl + '</div>' +
          '<div class="chart-count">' + b.count + '</div>' +
        '</div>';
      }).join("");

      // Global tooltip div
      var globalTip = document.getElementById("_du_global_tip");
      if (!globalTip) {
        globalTip = document.createElement("div");
        globalTip.id = "_du_global_tip";
        globalTip.style.cssText = "position:fixed;z-index:99999;background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text-primary);white-space:nowrap;line-height:1.6;pointer-events:none;display:none;font-family:var(--font-body)";
        document.body.appendChild(globalTip);
      }

      container.querySelectorAll(".chart-col").forEach(function(col) {
        col.addEventListener("mouseenter", function(e) {
          var tip = col.dataset.tip;
          if (!tip) return;
          globalTip.innerHTML = tip.replace(/&quot;/g, '"');
          globalTip.style.display = "block";
        });
        col.addEventListener("mousemove", function(e) {
          globalTip.style.left = (e.clientX - globalTip.offsetWidth / 2) + "px";
          globalTip.style.top  = (e.clientY - globalTip.offsetHeight - 14) + "px";
        });
        col.addEventListener("mouseleave", function() {
          globalTip.style.display = "none";
        });
      });

      // Click handler: fetch snapshot va hien thi ben duoi chart
      container.querySelectorAll(".chart-col--clickable").forEach(function(col) {
        col.addEventListener("click", function() {
          var dateStr = col.dataset.date;
          var detail  = document.getElementById("chart-day-detail");
          if (!detail) return;

          // Toggle: click cung ngay thi dong lai
          if (detail.dataset.activeDate === dateStr && detail.style.display !== "none") {
            detail.style.display = "none";
            detail.dataset.activeDate = "";
            col.classList.remove("chart-col--active");
            container.querySelectorAll(".chart-col--active").forEach(function(c) { c.classList.remove("chart-col--active"); });
            return;
          }

          container.querySelectorAll(".chart-col--active").forEach(function(c) { c.classList.remove("chart-col--active"); });
          col.classList.add("chart-col--active");
          detail.dataset.activeDate = dateStr;
          detail.style.display = "block";
          detail.innerHTML = '<div class="state-loading" style="padding:20px"><div class="spinner"></div><p>Dang tai du lieu ngay ' + dateStr + '...</p></div>';

          window._fetchDaySnapshot(dateStr);
        });
      });
    };

    // Store members map for snapshot rendering
    var _membersMap = {};
    Object.entries(data._members || {}).forEach(function(e) { _membersMap[e[1]] = e[0]; });
    window._duMembersMap  = _membersMap;
    window._duSnapshotBase = "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/tracking/snapshots/responses-";
    window._duMaxTasks    = Math.max.apply(null, (data.memberStatuses || []).map(function(m) { return m.tasks.length || 0; }).concat([1]));

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
            '<div class="section-header">' +
              '<span class="section-title">Chi tiet ngay ' + dateStr + '</span>' +
              '<span class="section-meta">' + responseList.length + ' submissions</span>' +
            '</div>' +
            '<table class="members-table"><thead><tr>' +
              '<th>Thanh vien</th><th>Trang thai</th><th>Gio submit</th>' + taskHeaders +
            '</tr></thead><tbody>' + rows + '</tbody></table>' +
          '</div>';
      }).catch(function() {
        detail.innerHTML = '<div class="state-empty" style="padding:24px"><i class="ti ti-inbox" style="font-size:28px"></i><p>Chua co du lieu cho ngay ' + dateStr + '</p><p style="font-size:12px;color:var(--text-muted)">Snapshot se co sau khi workflow chay lan dau trong ngay do</p></div>';
      });
    };

    var chartHTML =
      '<div class="members-section" style="margin-bottom:0">' +
        '<div class="section-header">' +
          '<span class="section-title">Lich su submit</span>' +
          '<select id="chart-range" style="background:var(--bg-hover);border:1px solid var(--border-strong);color:var(--text-primary);font-size:12px;padding:4px 10px;border-radius:var(--radius-sm);cursor:pointer;outline:none">' +
            '<option value="3">3 ngay gan nhat</option>' +
            '<option value="7" selected="selected">7 ngay gan nhat</option>' +
            '<option value="30">1 thang gan nhat</option>' +
            '<option value="90">3 thang gan nhat</option>' +
          '</select>' +
        '</div>' +
        '<div id="chart-container" class="chart-wrap"></div>' +
      '</div>' +
      '<div id="chart-day-detail" style="display:none;margin-bottom:24px" data-active-date=""></div>';

    /* Members table */
    // Tinh tong submit trong 30 ngay gan nhat
    var now30 = new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Ho_Chi_Minh"}));
    var cutoff = new Date(now30); cutoff.setDate(cutoff.getDate() - 29);
    var cutoffStr = cutoff.getFullYear()+"-"+String(cutoff.getMonth()+1).padStart(2,"0")+"-"+String(cutoff.getDate()).padStart(2,"0");

    var submitCounts = {};
    var rawSubs = (data && data._rawSubmissions) ? data._rawSubmissions : [];
    rawSubs.forEach(function(s) {
      if (s && s.userId && s.userId.startsWith("ou_") && s.date >= cutoffStr) {
        submitCounts[s.userId] = (submitCounts[s.userId] || 0) + 1;
      }
    });
    // Them response hom nay neu chua co trong submissions
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
        ? '<span style="font-family:var(--font-mono);font-weight:600;color:var(--text-primary)">' + totalSubmits + '</span><span style="color:var(--text-muted);font-size:11px"> /30</span>'
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

      return '<tr>' +
        '<td>' + nameCell + '</td>' +
        '<td>' + statusCell + '</td>' +
        '<td style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">' + timeStr + '</td>' +
        taskCols +
        '<td>' + submitCell + '</td>' +
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

    /* Tasks */
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

    /* ── Tab 2: Tool Info (static) ── */
    var taskInfoHTML =
      '<div class="tool-info-page">' +

        /* Hero */
        '<div class="tool-info-hero">' +
          '<div class="tool-info-icon"><i class="ti ti-square-check"></i></div>' +
          '<div>' +
            '<h2 class="tool-info-name">Daily Task Update Process PM</h2>' +
            '<p class="tool-info-tagline">He thong tracking standup hang ngay cho team F.Learning Studio</p>' +
          (data._lastUpdated ? '<p style="font-size:11px;color:var(--text-muted);margin-top:6px;font-family:var(--font-mono)">Last updated: ' + new Date(data._lastUpdated).toLocaleString("vi-VN", {timeZone:"Asia/Ho_Chi_Minh"}) + '</p>' : '') +
          '</div>' +
        '</div>' +

        /* Problem statement */
        '<div class="tool-info-section">' +
          '<div class="tool-info-section-title"><i class="ti ti-alert-triangle"></i> Van de can giai quyet</div>' +
          '<p class="tool-info-text">Them noi dung o day.</p>' +
        '</div>' +

        /* About */
        '<div class="tool-info-section">' +
          '<div class="tool-info-section-title"><i class="ti ti-info-circle"></i> Mo ta</div>' +
          '<p class="tool-info-text">Tool nay giup PM theo doi viec submit standup hang ngay cua toan bo thanh vien. Moi ngay, tung thanh vien nhan link ca nhan qua Lark, dien progress tung task va gui ve. Du lieu duoc tong hop tu dong va hien thi tren dashboard nay.</p>' +
        '</div>' +


        /* Config */
        '<div class="tool-info-grid">' +
          '<div class="tool-info-section">' +
            '<div class="tool-info-section-title"><i class="ti ti-settings"></i> Cau hinh</div>' +
            '<div class="tool-info-kv">' +
              '<div class="kv-row"><span class="kv-key">Timezone</span><span class="kv-val">Asia/Ho_Chi_Minh</span></div>' +
              '<div class="kv-row"><span class="kv-key">Cutoff time</span><span class="kv-val">18:00 ICT</span></div>' +
              '<div class="kv-row"><span class="kv-key">Tan suat</span><span class="kv-val">Hang ngay (Thu 2 – Thu 6)</span></div>' +
              '<div class="kv-row"><span class="kv-key">Trigger</span><span class="kv-val">responses.json thay doi → GitHub Actions</span></div>' +
              '<div class="kv-row"><span class="kv-key">Platform</span><span class="kv-val">Lark / Feishu</span></div>' +
            '</div>' +
          '</div>' +

          '<div class="tool-info-section">' +
            '<div class="tool-info-section-title"><i class="ti ti-database"></i> Data sources</div>' +
            '<div class="tool-info-kv">' +
              '<div class="kv-row"><span class="kv-key">daily-tasks.json</span><span class="kv-val kv-mono">daily-update-task-process-pm</span></div>' +
              '<div class="kv-row"><span class="kv-key">responses.json</span><span class="kv-val kv-mono">daily-update-task-process-pm</span></div>' +
              '<div class="kv-row"><span class="kv-key">members.json</span><span class="kv-val kv-mono">daily-update-task-process-pm</span></div>' +
              '<div class="kv-row"><span class="kv-key">submissions.json</span><span class="kv-val kv-mono">tracking/daily-update-submissions.json</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* Links */
        '<div class="tool-info-section">' +
          '<div class="tool-info-section-title"><i class="ti ti-link"></i> Lien ket</div>' +
          '<div class="tool-info-links">' +
            '<a class="tool-info-link" href="https://github.com/minhwuan1234/daily-update-task-process-pm" target="_blank"><i class="ti ti-brand-github"></i> daily-update-task-process-pm</a>' +
            '<a class="tool-info-link" href="https://github.com/minhwuan1234/admin-dashboard" target="_blank"><i class="ti ti-brand-github"></i> admin-dashboard</a>' +
          '</div>' +
        '</div>' +

      '</div>';

    /* ── Store HTML for tabs ── */
    window._duTrackingHTML  = statsHTML + chartHTML + membersHTML + tasksHTML;
    window._duTaskInfoHTML  = taskInfoHTML;

    window._initDUTabs = function() {
      // Fill pane content first
      var tracking = document.getElementById("tab-tracking");
      var taskinfo = document.getElementById("tab-taskinfo");
      if (tracking) tracking.innerHTML = window._duTrackingHTML;
      if (taskinfo) taskinfo.innerHTML = window._duTaskInfoHTML;

      // Init chart after content is in DOM
      setTimeout(function() {
        var chartRange = document.getElementById("chart-range");
        if (chartRange && window._buildDUChart) {
          window._buildDUChart(parseInt(chartRange.value));
          chartRange.addEventListener("change", function() { window._buildDUChart(parseInt(this.value)); });
        }
      }, 50);

      // Tab switching
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
