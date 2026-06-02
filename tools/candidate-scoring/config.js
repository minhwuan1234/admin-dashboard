/* ══════════════════════════════════════════════════════════════
   TOOL CONFIG: Candidate Scoring
   Data source: Google Sheets (3 tabs) — CSV export
     Rejected / Considerable / Strong Match
   ══════════════════════════════════════════════════════════════ */

window.TOOL_REGISTRY = window.TOOL_REGISTRY || [];

window.TOOL_REGISTRY.push({
  id:          "candidate-scoring",
  name:        "Candidate Scoring",
  description: "Tracking ung vien cham diem tu dong qua n8n, phan loai theo nen tang va vi tri.",
  icon:        "ti-user-check",
  status:      "active",

  _sheetId: "19YTdoUKx_MtflEcz7pyNxAfmvf-MEROsleODroj7fiw",
  _sheetNames: { rejected: "Rejected", consider: "Considerable", strong: "Strong Match" },

  /* ══════════════════════════════ FETCH ══════════════════════════════ */
  fetchData: async function(utils) {
    var sheetId = this._sheetId;
    var names   = this._sheetNames;

    function splitCSVLine(line) {
      var result = [], cur = "", inQ = false;
      for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (c === ',' && !inQ) { result.push(cur); cur = ""; }
        else cur += c;
      }
      result.push(cur);
      return result;
    }

    function parseCSV(text) {
      var lines = text.split("\n").filter(function(l) { return l.trim(); });
      if (lines.length < 2) return [];
      var headers = splitCSVLine(lines[0]);
      return lines.slice(1).map(function(line) {
        var vals = splitCSVLine(line);
        var obj  = {};
        headers.forEach(function(h, i) { obj[h.trim()] = (vals[i] || "").trim(); });
        return obj;
      }).filter(function(r) { return r["Timestamp"] && r["Name"]; });
    }

    async function fetchSheet(tab) {
      var url = "https://docs.google.com/spreadsheets/d/" + sheetId +
                "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(tab) + "&t=" + Date.now();
      var res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return parseCSV(await res.text());
    }

    function toDateStr(ts) {
      var m = (ts || "").match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;
    }

    /* Week key: Mon of that week */
    function toWeekKey(dateStr) {
      if (!dateStr) return null;
      var d = new Date(dateStr + "T00:00:00");
      var day = d.getDay(); // 0=Sun
      var diff = day === 0 ? -6 : 1 - day; // shift to Monday
      d.setDate(d.getDate() + diff);
      return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
    }

    function weekLabel(weekKey) {
      var d   = new Date(weekKey + "T00:00:00");
      var end = new Date(d); end.setDate(end.getDate() + 6);
      return String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0") +
             "–" + String(end.getDate()).padStart(2,"0") + "/" + String(end.getMonth()+1).padStart(2,"0");
    }

    var results = await Promise.all([
      fetchSheet(names.rejected).catch(function() { return []; }),
      fetchSheet(names.consider).catch(function() { return []; }),
      fetchSheet(names.strong).catch(function()   { return []; })
    ]);

    var rejected = results[0], consider = results[1], strong = results[2];
    rejected.forEach(function(r) { r._verdict = "rejected"; });
    consider.forEach(function(r) { r._verdict = "consider"; });
    strong.forEach(function(r)   { r._verdict = "strong"; });

    var all = rejected.concat(consider).concat(strong).map(function(r) {
      r._dateStr  = toDateStr(r["Timestamp"]);
      r._weekKey  = toWeekKey(r._dateStr);
      r._platform = (r["Apply Through"] || "Unknown").trim();
      r._role     = (r["Role"] || r["Position"] || "Unknown").trim();
      return r;
    }).filter(function(r) { return r._dateStr; });

    all.sort(function(a, b) { return a._dateStr.localeCompare(b._dateStr); });

    /* Unique platforms & roles */
    var platformSet = {}, roleSet = {};
    all.forEach(function(r) {
      platformSet[r._platform] = true;
      roleSet[r._role] = true;
    });
    var platforms = Object.keys(platformSet).sort();
    var roles     = Object.keys(roleSet).sort();

    return {
      all:           all,
      totalAll:      all.length,
      totalRejected: rejected.length,
      totalConsider: consider.length,
      totalStrong:   strong.length,
      platforms:     platforms,
      roles:         roles,
      toWeekKey:     toWeekKey,
      weekLabel:     weekLabel
    };
  },

  /* ══════════════════════════════ CARD ══════════════════════════════ */
  renderCard: function(data) {
    var total = data.totalAll, sc = data.totalStrong, co = data.totalConsider, re = data.totalRejected;
    var sRate = total > 0 ? Math.round(sc / total * 100) : 0;
    var sColor = sRate >= 30 ? "green" : sRate >= 15 ? "amber" : "red";
    return '<div class="tool-metrics">' +
      '<div class="tool-metric"><span class="metric-value">' + total + '</span><span class="metric-label">Tong UV</span></div>' +
      '<div class="tool-metric"><span class="metric-value green">' + sc + '</span><span class="metric-label">💚 Strong</span></div>' +
      '<div class="tool-metric"><span class="metric-value amber">' + co + '</span><span class="metric-label">🟡 Consider</span></div>' +
      '<div class="tool-metric"><span class="metric-value red">' + re + '</span><span class="metric-label">❌ Rejected</span></div>' +
      '</div>' +
      '<div class="mini-bar-wrap" style="margin-top:10px">' +
        '<span style="font-size:10px;color:var(--text-muted);width:52px">Strong</span>' +
        '<div class="mini-bar"><div class="mini-bar-fill" style="width:' + sRate + '%"></div></div>' +
        '<span class="mini-bar-pct ' + sColor + '">' + sRate + '%</span>' +
      '</div>';
  },

  /* ══════════════════════════════ DETAIL ══════════════════════════════ */
  renderDetail: function(data, utils) {
    if (!data || data._error) return '<div class="state-error"><i class="ti ti-alert-circle"></i> Khong the tai data</div>';
    if (data._loading) return '<div class="state-loading"><div class="spinner"></div><p>Dang tai...</p></div>';

    var tabBar =
      '<div class="tab-bar">' +
        '<button class="tab-btn active" data-tab="tracking"><i class="ti ti-chart-bar"></i> Tracking</button>' +
        '<button class="tab-btn" data-tab="info"><i class="ti ti-info-circle"></i> Thong tin tool</button>' +
      '</div>' +
      '<div id="tab-tracking" class="tab-pane"></div>' +
      '<div id="tab-info"     class="tab-pane" style="display:none"></div>';

    /* ── Stats ── */
    var total = data.totalAll, sc = data.totalStrong, co = data.totalConsider, re = data.totalRejected;
    var sRate = total > 0 ? Math.round(sc / total * 100) : 0;
    var cRate = total > 0 ? Math.round(co / total * 100) : 0;
    var statsHTML =
      '<div class="detail-stats">' +
        '<div class="stat-card"><span class="stat-label">Tong ung vien</span><span class="stat-value">' + total + '</span><span class="stat-delta"><i class="ti ti-users"></i> Da cham diem</span></div>' +
        '<div class="stat-card"><span class="stat-label">💚 Strong hire</span><span class="stat-value green">' + sc + '</span><span class="stat-delta">' + sRate + '% tong so</span></div>' +
        '<div class="stat-card"><span class="stat-label">🟡 Consider</span><span class="stat-value amber">' + co + '</span><span class="stat-delta">' + cRate + '% tong so</span></div>' +
        '<div class="stat-card"><span class="stat-label">❌ Rejected</span><span class="stat-value red">' + re + '</span><span class="stat-delta">' + (100 - sRate - cRate) + '% tong so</span></div>' +
      '</div>';

    /* ── Store globals ── */
    window._csAll       = data.all       || [];
    window._csPlatforms = data.platforms || [];
    window._csRoles     = data.roles     || [];
    window._csWeekKey   = data.toWeekKey;
    window._csWeekLabel = data.weekLabel;

    /* Platform colors */
    var PLATFORM_COLORS = [
      "var(--accent)", "#a78bfa", "#34d399", "#f59e0b",
      "#f472b6", "#60a5fa", "#fb923c", "#94a3b8"
    ];
    window._csPlatformColors = {};
    window._csPlatforms.forEach(function(p, i) {
      window._csPlatformColors[p] = PLATFORM_COLORS[i % PLATFORM_COLORS.length];
    });

    /* ══ CHART BUILDER ══ */
    window._buildCSChart = function(rangeVal) {
      var container = document.getElementById("cs-chart-container");
      if (!container) return;

      var all       = window._csAll;
      var platforms = window._csPlatforms;
      var pColors   = window._csPlatformColors;
      var isAllTime = rangeVal === 0;

      /* ── ALL TIME: 1 group per platform ── */
      if (isAllTime) {
        var maxV = 0;
        var ptData = platforms.map(function(p) {
          var rows = all.filter(function(r) { return r._platform === p; });
          var s = rows.filter(function(r) { return r._verdict === "strong"; }).length;
          var c = rows.filter(function(r) { return r._verdict === "consider"; }).length;
          var rv = rows.filter(function(r) { return r._verdict === "rejected"; }).length;
          if (s+c+rv > maxV) maxV = s+c+rv;
          return { p: p, s: s, c: c, r: rv, total: s+c+rv };
        }).filter(function(d) { return d.total > 0; });

        if (!maxV) {
          container.innerHTML = _csEmptyChart();
          return;
        }

        container.innerHTML = '<div style="display:flex;align-items:flex-end;gap:24px;height:100%;padding:0 20px">' +
          ptData.map(function(d) {
            var pct   = Math.round(d.total / maxV * 100);
            var color = pColors[d.p] || "var(--accent)";
            var pctS  = d.total > 0 ? Math.round(d.s / d.total * 100) : 0;
            var pctC  = d.total > 0 ? Math.round(d.c / d.total * 100) : 0;
            var pctR  = 100 - pctS - pctC;
            var tipHtml = '<strong>' + d.p + '</strong><br>' +
              '<span style="color:var(--green)">💚 Strong: ' + d.s + '</span><br>' +
              '<span style="color:var(--yellow)">🟡 Consider: ' + d.c + '</span><br>' +
              '<span style="color:var(--red)">❌ Rejected: ' + d.r + '</span><br>' +
              '<span style="color:var(--text-muted)">Total: ' + d.total + '</span>';
            return '<div class="chart-col" style="flex:1;min-width:48px" data-tip="' + tipHtml.replace(/"/g,"&quot;") + '">' +
              '<div class="chart-bar-wrap">' +
                _csStackedBar(pct, pctS, pctC, pctR, d.s, d.c, d.r) +
              '</div>' +
              '<div class="chart-label" style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">' + d.p + '</div>' +
              '<div class="chart-count">' + d.total + '</div>' +
            '</div>';
          }).join("") +
        '</div>';

        _csTooltip(container);
        return;
      }

      /* ── RANGE: group by week, split by platform ── */
      var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
      var cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - rangeVal + 1);
      var cutoffStr = cutoff.getFullYear() + "-" + String(cutoff.getMonth()+1).padStart(2,"0") + "-" + String(cutoff.getDate()).padStart(2,"0");

      /* collect weeks in range */
      var filtered = all.filter(function(r) { return r._dateStr >= cutoffStr; });
      var weekSet  = {};
      filtered.forEach(function(r) { if (r._weekKey) weekSet[r._weekKey] = true; });

      /* fill missing weeks so timeline is continuous */
      var wk = new Date(cutoff);
      var day = wk.getDay(); var diff = day === 0 ? -6 : 1 - day;
      wk.setDate(wk.getDate() + diff);
      var today = new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Ho_Chi_Minh"}));
      while (wk <= today) {
        var wks = wk.getFullYear()+"-"+String(wk.getMonth()+1).padStart(2,"0")+"-"+String(wk.getDate()).padStart(2,"0");
        weekSet[wks] = true;
        wk.setDate(wk.getDate() + 7);
      }
      var weeks = Object.keys(weekSet).sort();

      /* active platforms in range */
      var activePlatforms = platforms.filter(function(p) {
        return filtered.some(function(r) { return r._platform === p; });
      });

      if (!filtered.length) {
        container.innerHTML = _csEmptyChart();
        return;
      }

      /* max per week-platform combo for scaling */
      var maxVal = 0;
      weeks.forEach(function(wk) {
        activePlatforms.forEach(function(p) {
          var cnt = filtered.filter(function(r) { return r._weekKey === wk && r._platform === p; }).length;
          if (cnt > maxVal) maxVal = cnt;
        });
      });
      if (!maxVal) maxVal = 1;

      /* render groups */
      var groupWidth = Math.max(48, Math.floor(560 / Math.max(weeks.length, 1)));

      container.innerHTML = '<div style="display:flex;align-items:flex-end;gap:8px;height:100%;padding:0 12px;overflow-x:auto">' +
        weeks.map(function(wk) {
          var wLabel = window._csWeekLabel ? window._csWeekLabel(wk) : wk;
          var cols = activePlatforms.map(function(p) {
            var rows  = filtered.filter(function(r) { return r._weekKey === wk && r._platform === p; });
            var s     = rows.filter(function(r) { return r._verdict === "strong"; }).length;
            var c     = rows.filter(function(r) { return r._verdict === "consider"; }).length;
            var rv    = rows.filter(function(r) { return r._verdict === "rejected"; }).length;
            var total = s + c + rv;
            if (!total) return "";
            var pct   = Math.round(total / maxVal * 100);
            var pctS  = Math.round(s / total * 100);
            var pctC  = Math.round(c / total * 100);
            var pctR  = 100 - pctS - pctC;
            var color = pColors[p] || "var(--accent)";
            var tipHtml = '<strong>' + p + ' — ' + wLabel + '</strong><br>' +
              '<span style="color:var(--green)">💚 Strong: ' + s + '</span><br>' +
              '<span style="color:var(--yellow)">🟡 Consider: ' + c + '</span><br>' +
              '<span style="color:var(--red)">❌ Rejected: ' + rv + '</span>';
            return '<div class="chart-col" style="flex:0 0 ' + Math.max(20, Math.floor(groupWidth / activePlatforms.length) - 4) + 'px;min-width:14px" data-tip="' + tipHtml.replace(/"/g,"&quot;") + '">' +
              '<div class="chart-bar-wrap">' +
                _csStackedBar(pct, pctS, pctC, pctR, s, c, rv) +
              '</div>' +
              '<div class="chart-count" style="font-size:9px">' + total + '</div>' +
            '</div>';
          }).join("");

          if (!cols.trim()) return "";

          return '<div style="display:flex;flex-direction:column;align-items:center;gap:0;flex:0 0 auto">' +
            '<div style="display:flex;align-items:flex-end;gap:2px;height:calc(100% - 28px)">' + cols + '</div>' +
            '<div style="font-size:10px;color:var(--text-muted);text-align:center;margin-top:4px;white-space:nowrap">' + wLabel + '</div>' +
          '</div>';
        }).join("") +
      '</div>';

      _csTooltip(container);
    };

    /* Stacked bar helper */
    function _csStackedBar(totalPct, pctS, pctC, pctR, s, c, r) {
      var h = Math.max(totalPct, (s+c+r) > 0 ? 4 : 0);
      return '<div style="position:absolute;bottom:0;left:0;right:0;height:' + h + '%;display:flex;flex-direction:column-reverse">' +
        (s > 0 ? '<div style="flex:' + pctS + ';background:var(--green);min-height:3px"></div>' : '') +
        (c > 0 ? '<div style="flex:' + pctC + ';background:var(--yellow);min-height:3px"></div>' : '') +
        (r > 0 ? '<div style="flex:' + pctR + ';background:var(--red);min-height:3px"></div>' : '') +
      '</div>';
    }
    window._csStackedBar = _csStackedBar;

    function _csEmptyChart() {
      return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:var(--text-muted)">' +
        '<i class="ti ti-chart-bar-off" style="font-size:28px"></i>' +
        '<span style="font-size:13px">Chua co du lieu trong khoang thoi gian nay</span>' +
      '</div>';
    }

    function _csTooltip(container) {
      var tip = document.getElementById("_cs_tip");
      if (!tip) {
        tip = document.createElement("div");
        tip.id = "_cs_tip";
        tip.style.cssText = "position:fixed;z-index:99999;background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text-primary);white-space:nowrap;line-height:1.8;pointer-events:none;display:none;font-family:var(--font-body)";
        document.body.appendChild(tip);
      }
      container.querySelectorAll(".chart-col").forEach(function(col) {
        col.addEventListener("mouseenter", function() {
          var t = col.dataset.tip; if (!t) return;
          tip.innerHTML = t.replace(/&quot;/g, '"');
          tip.style.display = "block";
        });
        col.addEventListener("mousemove", function(e) {
          tip.style.left = (e.clientX - tip.offsetWidth / 2) + "px";
          tip.style.top  = (e.clientY - tip.offsetHeight - 14) + "px";
        });
        col.addEventListener("mouseleave", function() { tip.style.display = "none"; });
      });
    }
    window._csTooltip = _csTooltip;

    /* ── Chart HTML ── */
    /* Platform legend */
    var legendHTML = (data.platforms || []).map(function(p) {
      var color = (window._csPlatformColors || {})[p] || "var(--accent)";
      return '<span style="display:inline-flex;align-items:center;gap:5px">' +
        '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + color + '"></span>' +
        '<span style="font-size:11px;color:var(--text-muted)">' + p + '</span>' +
      '</span>';
    }).join("");

    var chartHTML =
      '<div class="members-section" style="margin-bottom:0">' +
        '<div class="section-header">' +
          '<span class="section-title">Theo nen tang</span>' +
          '<select id="cs-chart-range" style="background:var(--bg-hover);border:1px solid var(--border-strong);color:var(--text-primary);font-size:12px;padding:4px 10px;border-radius:var(--radius-sm);cursor:pointer;outline:none">' +
            '<option value="7"  selected>7 ngay</option>' +
            '<option value="14">2 tuan</option>' +
            '<option value="30">1 thang</option>' +
            '<option value="0">All time</option>' +
          '</select>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:12px;padding:0 20px 12px">' +
          '<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:var(--green);display:inline-block"></span><span style="font-size:11px;color:var(--text-muted)">Strong hire</span></span>' +
          '<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:var(--yellow);display:inline-block"></span><span style="font-size:11px;color:var(--text-muted)">Consider</span></span>' +
          '<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:var(--red);display:inline-block"></span><span style="font-size:11px;color:var(--text-muted)">Rejected</span></span>' +
          (legendHTML ? '<span style="color:var(--border-strong)">|</span>' + legendHTML : '') +
        '</div>' +
        '<div id="cs-chart-container" class="chart-wrap" style="min-height:180px"></div>' +
      '</div>';

    /* ── Summary table (all time, by platform) ── */
    var summaryRows = (data.platforms || []).map(function(p) {
      var rows = (data.all || []).filter(function(r) { return r._platform === p; });
      var s  = rows.filter(function(r) { return r._verdict === "strong"; }).length;
      var c  = rows.filter(function(r) { return r._verdict === "consider"; }).length;
      var rv = rows.filter(function(r) { return r._verdict === "rejected"; }).length;
      var t  = rows.length;
      var sRate = t > 0 ? Math.round(s/t*100) : 0;
      var color = (window._csPlatformColors || {})[p] || "var(--accent)";
      return '<tr>' +
        '<td><span style="display:inline-flex;align-items:center;gap:8px">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0"></span>' +
          '<span style="font-weight:500">' + p + '</span>' +
        '</span></td>' +
        '<td style="text-align:center;font-weight:600;color:var(--green)">' + s + '</td>' +
        '<td style="text-align:center;font-weight:600;color:var(--yellow)">' + c + '</td>' +
        '<td style="text-align:center;font-weight:600;color:var(--red)">' + rv + '</td>' +
        '<td style="text-align:center;font-family:var(--font-mono);font-weight:700">' + t + '</td>' +
        '<td style="min-width:100px">' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<div style="flex:1;height:6px;background:var(--bg-hover);border-radius:3px;overflow:hidden">' +
              '<div style="height:100%;width:' + sRate + '%;background:var(--green)"></div>' +
            '</div>' +
            '<span style="font-size:11px;color:var(--text-muted);width:32px;text-align:right">' + sRate + '%</span>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join("");

    var summaryHTML =
      '<div class="members-section">' +
        '<div class="section-header"><span class="section-title">Tong hop theo nen tang</span><span class="section-meta">All time</span></div>' +
        '<table class="members-table">' +
          '<thead><tr>' +
            '<th>Nen tang</th>' +
            '<th style="text-align:center">💚 Strong</th>' +
            '<th style="text-align:center">🟡 Consider</th>' +
            '<th style="text-align:center">❌ Rejected</th>' +
            '<th style="text-align:center">Total</th>' +
            '<th>Strong rate</th>' +
          '</tr></thead>' +
          '<tbody>' + summaryRows + '</tbody>' +
        '</table>' +
      '</div>';

    /* ── Candidates table — tabbed by position ── */
    var roles   = data.roles || [];
    var allRows = data.all   || [];

    /* Sort: date desc, verdict order */
    var verdictOrder = { strong: 0, consider: 1, rejected: 2 };
    var sorted = allRows.slice().sort(function(a, b) {
      if (b._dateStr !== a._dateStr) return b._dateStr.localeCompare(a._dateStr);
      return (verdictOrder[a._verdict]||0) - (verdictOrder[b._verdict]||0);
    });

    var VERDICT_CFG = {
      strong:   { label: "💚 Strong hire", pillClass: "submitted" },
      consider: { label: "🟡 Consider",    pillClass: "" },
      rejected: { label: "❌ Rejected",     pillClass: "missing" }
    };

    function buildCandidateRows(rows) {
      if (!rows.length) return '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px"><i class="ti ti-inbox" style="font-size:20px;display:block;margin-bottom:6px"></i>Chua co ung vien</td></tr>';
      return rows.map(function(r) {
        var vc  = VERDICT_CFG[r._verdict] || { label: r._verdict, pillClass: "" };
        var cvLink = r["Portfolio"]
          ? '<a href="' + r["Portfolio"] + '" target="_blank" style="color:var(--accent);font-size:11px"><i class="ti ti-file-cv"></i> CV</a>'
          : '<span style="color:var(--text-muted)">—</span>';
        return '<tr>' +
          '<td style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">' + (r._dateStr || "—") + '</td>' +
          '<td style="font-weight:500;white-space:nowrap">' + (r["Name"] || "—") + '</td>' +
          '<td style="font-size:12px;color:var(--text-secondary)">' + (r._platform || "—") + '</td>' +
          '<td><span class="status-pill ' + vc.pillClass + '" style="font-size:10px">' + vc.label + '</span></td>' +
          '<td style="font-family:var(--font-mono);font-weight:600">' + (r["Total Score Display"] || "—") + '</td>' +
          '<td>' + cvLink + '</td>' +
        '</tr>';
      }).join("");
    }

    /* Tab bar for roles */
    var roleTabBar = '<div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:0;overflow-x:auto">' +
      ['Tat ca'].concat(roles).map(function(role, idx) {
        var count = role === 'Tat ca' ? sorted.length : sorted.filter(function(r) { return r._role === role; }).length;
        return '<button class="cs-role-tab' + (idx === 0 ? ' active' : '') + '" data-role="' + role + '" style="' +
          'padding:8px 14px;font-size:12px;font-family:var(--font-body);background:transparent;border:none;' +
          'border-bottom:2px solid ' + (idx === 0 ? 'var(--accent)' : 'transparent') + ';' +
          'color:' + (idx === 0 ? 'var(--accent)' : 'var(--text-muted)') + ';' +
          'cursor:pointer;white-space:nowrap;transition:all 0.15s">' +
          role + ' <span style="font-size:10px;opacity:0.7">(' + count + ')</span>' +
        '</button>';
      }).join("") +
    '</div>';

    var candidatesHTML =
      '<div class="members-section">' +
        '<div class="section-header"><span class="section-title">Ung vien theo vi tri</span><span class="section-meta">' + sorted.length + ' records</span></div>' +
        roleTabBar +
        '<div id="cs-role-table-wrap">' +
          '<table class="members-table">' +
            '<thead><tr><th>Ngay</th><th>Ten</th><th>Nen tang</th><th>Ket qua</th><th>Diem</th><th>CV</th></tr></thead>' +
            '<tbody id="cs-role-tbody">' + buildCandidateRows(sorted) + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';

    /* ── Info tab ── */
    var infoHTML =
      '<div class="tool-info-page">' +
        '<div class="tool-info-hero">' +
          '<div class="tool-info-icon"><i class="ti ti-user-check"></i></div>' +
          '<div><h2 class="tool-info-name">Candidate Scoring</h2>' +
          '<p class="tool-info-tagline">He thong cham diem CV tu dong bang AI cho cac vi tri tuyen dung tai F.Learning Studio.</p></div>' +
        '</div>' +
        '<div class="tool-info-section">' +
          '<div class="tool-info-section-title"><i class="ti ti-info-circle"></i> Mo ta</div>' +
          '<p class="tool-info-text">Khi co ung vien moi them vao Google Sheet, n8n tu dong tai CV, extract text, cham diem theo rubric rieng cua tung vi tri bang GPT, roi day ket qua vao 3 tab: Rejected / Considerable / Strong Match.</p>' +
        '</div>' +
        '<div class="tool-info-grid">' +
          '<div class="tool-info-section">' +
            '<div class="tool-info-section-title"><i class="ti ti-settings"></i> Cau hinh</div>' +
            '<div class="tool-info-kv">' +
              '<div class="kv-row"><span class="kv-key">Trigger</span><span class="kv-val">Google Sheets — row added</span></div>' +
              '<div class="kv-row"><span class="kv-key">AI model</span><span class="kv-val">GPT-5.4</span></div>' +
              '<div class="kv-row"><span class="kv-key">Positions</span><span class="kv-val">BD, Account, L&D, PC, HR Intern</span></div>' +
              '<div class="kv-row"><span class="kv-key">Verdict</span><span class="kv-val">Strong ≥80% / Consider ≥60% / Weak</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="tool-info-section">' +
            '<div class="tool-info-section-title"><i class="ti ti-database"></i> Data sources</div>' +
            '<div class="tool-info-kv">' +
              '<div class="kv-row"><span class="kv-key">Input sheet</span><span class="kv-val kv-mono">[FAB] Recruitment data</span></div>' +
              '<div class="kv-row"><span class="kv-key">Output sheet</span><span class="kv-val kv-mono">Candidate Scoring</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="tool-info-section">' +
          '<div class="tool-info-section-title"><i class="ti ti-link"></i> Lien ket</div>' +
          '<div class="tool-info-links">' +
            '<a class="tool-info-link" href="https://n8n.tonytran.design/workflow/pExOqbUpHFPYapsI" target="_blank"><i class="ti ti-topology-star"></i> n8n Workflow</a>' +
            '<a class="tool-info-link" href="https://docs.google.com/spreadsheets/d/19YTdoUKx_MtflEcz7pyNxAfmvf-MEROsleODroj7fiw" target="_blank"><i class="ti ti-table"></i> Google Sheet Output</a>' +
          '</div>' +
        '</div>' +
      '</div>';

    /* ── Store + init ── */
    window._csTrackingHTML = statsHTML + chartHTML + summaryHTML + candidatesHTML;
    window._csInfoHTML     = infoHTML;
    window._csSorted       = sorted;
    window._csBuildRows    = buildCandidateRows;

    window._initCSTabs = function() {
      var tracking = document.getElementById("tab-tracking");
      var info     = document.getElementById("tab-info");
      if (tracking) tracking.innerHTML = window._csTrackingHTML;
      if (info)     info.innerHTML     = window._csInfoHTML;

      /* Init chart */
      setTimeout(function() {
        if (window._buildCSChart) {
          window._buildCSChart(7);
          var sel = document.getElementById("cs-chart-range");
          if (sel) sel.addEventListener("change", function() {
            window._buildCSChart(parseInt(this.value));
          });
        }

        /* Role tab switching */
        var roleTabs = document.querySelectorAll(".cs-role-tab");
        var tbody    = document.getElementById("cs-role-tbody");
        roleTabs.forEach(function(btn) {
          btn.addEventListener("click", function() {
            roleTabs.forEach(function(b) {
              b.style.borderBottomColor = "transparent";
              b.style.color = "var(--text-muted)";
              b.classList.remove("active");
            });
            btn.style.borderBottomColor = "var(--accent)";
            btn.style.color = "var(--accent)";
            btn.classList.add("active");
            var role = btn.dataset.role;
            var rows = role === "Tat ca"
              ? window._csSorted
              : (window._csSorted || []).filter(function(r) { return r._role === role; });
            if (tbody) tbody.innerHTML = window._csBuildRows(rows);
          });
        });
      }, 50);

      /* Tab switching */
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
              if (window._buildCSChart) {
                var sel = document.getElementById("cs-chart-range");
                window._buildCSChart(sel ? parseInt(sel.value) : 7);
              }
            }, 50);
          }
        });
      });
    };

    return tabBar;
  }
});
