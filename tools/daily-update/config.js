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
  name:        "Daily Update",
  description: "Tracking ti le submit standup hang ngay cua team.",
  icon:        "ti-square-check",
  status:      "active",

  /* ── URLs ── */
  _urls: {
    dailyTasks:  "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/daily-tasks.json",
    responses:   "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/responses.json",
    members:     "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/members.json",
    submissions: "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/tracking/daily-update-submissions.json"
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
      utils.fetchJson(urls.submissions, true).catch(function() { return []; })
    ]);
    return this._process(results[0], results[1], results[2], results[3], utils);
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

    return { totalMembers: totalMembers, submittedCount: submittedCount, missingCount: missingCount, submissionRate: submissionRate, memberStatuses: memberStatuses, allTasks: allTasks, chartDays: chartDays };
  },

  /* ══════════════════════════════
     RENDER CARD (overview)
     ══════════════════════════════ */
  renderCard: function(data) {
    var rate = data.submissionRate;
    var rateColor = rate >= 80 ? "green" : rate >= 50 ? "amber" : "red";
    var barColor  = rate >= 80 ? "" : rate >= 50 ? "amber" : "red";
    return '<div class="tool-metrics">' +
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

    /* Bar chart */
    var maxCount = Math.max(data.totalMembers, 1);
    var bars = data.chartDays.map(function(d) {
      var pct      = Math.round(d.count / maxCount * 100);
      var barColor = pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--accent)" : pct > 0 ? "var(--yellow)" : "var(--bg-hover)";
      var nameList = d.names.length > 0 ? d.names.join(", ") : "Chua co ai submit";
      return '<div class="chart-col">' +
        '<div class="chart-bar-wrap">' +
          '<div class="chart-tooltip"><strong>' + d.dateStr + '</strong><br>' + d.count + '/' + d.total + ' nguoi submit<br><span style="color:var(--text-secondary);font-size:11px">' + nameList + '</span></div>' +
          '<div class="chart-bar" style="height:' + Math.max(pct, 4) + '%;background:' + barColor + '"></div>' +
        '</div>' +
        '<div class="chart-label">' + d.label + '</div>' +
        '<div class="chart-count">' + d.count + '</div>' +
      '</div>';
    }).join("");

    var chartHTML =
      '<div class="members-section" style="margin-bottom:24px">' +
        '<div class="section-header"><span class="section-title">7 ngay gan nhat</span><span class="section-meta">Hover vao cot de xem chi tiet</span></div>' +
        '<div class="chart-wrap">' + bars + '</div>' +
      '</div>';

    /* Members table */
    var rows = data.memberStatuses.slice().sort(function(a, b) {
      if (a.status === b.status) return a.name.localeCompare(b.name);
      return a.status === "submitted" ? -1 : 1;
    }).map(function(m) {
      var avgProg = m.tasks.length > 0
        ? Math.round(m.tasks.reduce(function(s,t) { return s + parseInt(t.progress||0); }, 0) / m.tasks.length)
        : null;
      var progCell = avgProg !== null
        ? '<span class="progress-badge ' + (avgProg===100?"done":avgProg>=60?"high":"medium") + '">' + avgProg + '%</span>'
        : '<span style="color:var(--text-muted)">—</span>';
      return '<tr>' +
        '<td><span style="font-weight:500">' + m.name + '</span>' + (m.message ? '<br><span style="font-size:11px;color:var(--text-muted)">' + m.message.substring(0,80) + (m.message.length>80?"…":"") + '</span>' : '') + '</td>' +
        '<td><span class="status-pill ' + m.status + '">' + (m.status==="submitted"?"✓ Da submit":"✗ Chua submit") + '</span></td>' +
        '<td style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">' + (utils ? utils.formatTime(m.submittedAt) : "—") + '</td>' +
        '<td style="text-align:center">' + progCell + '</td>' +
        '<td style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">' + (m.tasks.length > 0 ? m.tasks.length + " task" : "—") + '</td>' +
      '</tr>';
    }).join("");

    var membersHTML =
      '<div class="members-section">' +
        '<div class="section-header"><span class="section-title">Trang thai submit hom nay</span><span class="section-meta">' + data.submittedCount + '/' + data.totalMembers + ' members</span></div>' +
        '<table class="members-table"><thead><tr>' +
          '<th>Thanh vien</th><th>Trang thai</th><th>Gio submit</th><th style="text-align:center">Avg progress</th><th>Tasks</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div>';

    /* Tasks */
    var taskRowsHTML = data.allTasks.length === 0
      ? '<div class="state-empty" style="padding:24px"><i class="ti ti-inbox" style="font-size:28px"></i><p>Chua co task nao duoc submit</p></div>'
      : data.allTasks.map(function(t) {
          var pct = parseInt(t.progress||0);
          var pc  = pct===100?"done":pct>=60?"high":pct>=30?"medium":"low";
          return '<div class="task-row">' +
            '<div class="task-title-cell">' + (t.title||"—") + '</div>' +
            '<div class="task-member-cell">' + (t.memberName||"—") + '</div>' +
            '<div class="progress-badge ' + pc + '">' + (t.progress||"—") + '</div>' +
            '<div class="time-badge">' + (t.timeSpent||"—") + '</div>' +
          '</div>';
        }).join("");

    var tasksHTML =
      '<div class="task-breakdown">' +
        '<div class="section-header"><span class="section-title">Chi tiet tasks</span><span class="section-meta">' + data.allTasks.length + ' tasks</span></div>' +
        taskRowsHTML +
      '</div>';

    return statsHTML + chartHTML + membersHTML + tasksHTML;
  }
});
