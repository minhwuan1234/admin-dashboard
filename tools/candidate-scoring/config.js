/* ══════════════════════════════════════════════════════════════
   TOOL CONFIG: Candidate Scoring
   
   Data source: Google Sheets (3 tabs) — exported via CSV
     - Rejected     → verdict: Weak
     - Considerable → verdict: Consider
     - Strong Match → verdict: Strong hire
   
   Tracking: theo ngay dua vao cot Timestamp
   ══════════════════════════════════════════════════════════════ */

window.TOOL_REGISTRY = window.TOOL_REGISTRY || [];

window.TOOL_REGISTRY.push({
  id:          "candidate-scoring",
  name:        "Candidate Scoring",
  description: "Tracking ung vien duoc cham diem tu dong qua n8n, phan loai theo Rejected / Consider / Strong hire.",
  icon:        "ti-user-check",
  status:      "active",

  /* ── Sheet IDs ── */
  _sheetId: "19YTdoUKx_MtflEcz7pyNxAfmvf-MEROsleODroj7fiw",

  _sheetNames: {
    rejected:  "Rejected",
    consider:  "Considerable",
    strong:    "Strong Match"
  },

  /* ══════════════════════════════
     FETCH DATA
     ══════════════════════════════ */
  fetchData: async function(utils) {
    var sheetId = this._sheetId;
    var names   = this._sheetNames;

    /* Fetch CSV tung tab */
    async function fetchSheet(tabName) {
      var url = "https://docs.google.com/spreadsheets/d/" + sheetId +
                "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(tabName) + "&t=" + Date.now();
      var res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status + " — " + tabName);
      var csv = await res.text();
      return parseCSV(csv);
    }

    /* CSV parser don gian, xu ly quoted fields */
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

    function splitCSVLine(line) {
      var result = [], cur = "", inQ = false;
      for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (c === '"') {
          if (inQ && line[i+1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (c === ',' && !inQ) {
          result.push(cur); cur = "";
        } else {
          cur += c;
        }
      }
      result.push(cur);
      return result;
    }

    /* Lay date string tu Timestamp "2026-04-07 16:33:39" */
    function toDateStr(ts) {
      if (!ts) return null;
      var m = ts.match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;
    }

    var results = await Promise.all([
      fetchSheet(names.rejected).catch(function() { return []; }),
      fetchSheet(names.consider).catch(function() { return []; }),
      fetchSheet(names.strong).catch(function()   { return []; })
    ]);

    var rejected  = results[0];
    var consider  = results[1];
    var strong    = results[2];

    /* Tag verdict */
    rejected.forEach(function(r) { r._verdict = "rejected"; r._dateStr = toDateStr(r["Timestamp"]); });
    consider.forEach(function(r) { r._verdict = "consider"; r._dateStr = toDateStr(r["Timestamp"]); });
    strong.forEach(function(r)   { r._verdict = "strong";   r._dateStr = toDateStr(r["Timestamp"]); });

    var all = rejected.concat(consider).concat(strong).filter(function(r) { return r._dateStr; });

    /* Sort by date asc */
    all.sort(function(a, b) { return a._dateStr.localeCompare(b._dateStr); });

    /* Alltime totals */
    var totalRejected = rejected.length;
    var totalConsider = consider.length;
    var totalStrong   = strong.length;
    var totalAll      = all.length;

    /* Unique dates */
    var allDates = [];
    var seen     = {};
    all.forEach(function(r) {
      if (!seen[r._dateStr]) { seen[r._dateStr] = true; allDates.push(r._dateStr); }
    });

    return {
      all:           all,
      totalAll:      totalAll,
      totalRejected: totalRejected,
      totalConsider: totalConsider,
      totalStrong:   totalStrong,
      allDates:      allDates
    };
  },

  /* ══════════════════════════════
     RENDER CARD (overview)
     ══════════════════════════════ */
  renderCard: function(data) {
    var total = data.totalAll;
    var sc    = data.totalStrong;
    var co    = data.totalConsider;
    var re    = data.totalRejected;
    var sRate = total > 0 ? Math.round(sc / total * 100) : 0;
    var sColor = sRate >= 30 ? "green" : sRate >= 15 ? "amber" : "red";

    return '<div class="tool-metrics">' +
      '<div class="tool-metric"><span class="metric-value">' + total + '</span><span class="metric-label">Tong ung vien</span></div>' +
      '<div class="tool-metric"><span class="metric-value green">' + sc + '</span><span class="metric-label">💚 Strong hire</span></div>' +
      '<div class="tool-metric"><span class="metric-value amber">' + co + '</span><span class="metric-label">🟡 Consider</span></div>' +
      '<div class="tool-metric"><span class="metric-value red">' + re + '</span><span class="metric-label">❌ Rejected</span></div>' +
      '</div>' +
      '<div class="mini-bar-wrap" style="margin-top:10px">' +
        '<span style="font-size:10px;color:var(--text-muted);width:52px">Strong</span>' +
        '<div class="mini-bar">' +
          '<div class="mini-bar-fill" style="width:' + sRate + '%"></div>' +
        '</div>' +
        '<span class="mini-bar-pct ' + sColor + '">' + sRate + '%</span>' +
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
      '<div id="tab-info"     class="tab-pane" style="display:none"></div>';

    /* ── Stats ── */
    var total = data.totalAll;
    var sc    = data.totalStrong;
    var co    = data.totalConsider;
    var re    = data.totalRejected;
    var sRate = total > 0 ? Math.round(sc / total * 100) : 0;
    var cRate = total > 0 ? Math.round(co / total * 100) : 0;

    var statsHTML =
      '<div class="detail-stats">' +
        '<div class="stat-card"><span class="stat-label">Tong ung vien</span><span class="stat-value">' + total + '</span><span class="stat-delta"><i class="ti ti-users"></i> Da cham diem</span></div>' +
        '<div class="stat-card"><span class="stat-label">💚 Strong hire</span><span class="stat-value green">' + sc + '</span><span class="stat-delta">' + sRate + '% tong so</span></div>' +
        '<div class="stat-card"><span class="stat-label">🟡 Consider</span><span class="stat-value amber">' + co + '</span><span class="stat-delta">' + cRate + '% tong so</span></div>' +
        '<div class="stat-card"><span class="stat-label">❌ Rejected</span><span class="stat-value red">' + re + '</span><span class="stat-delta">' + (100 - sRate - cRate) + '% tong so</span></div>' +
      '</div>';

    /* ── Chart ── */
    /* Luu data global cho chart builder */
    window._csAll = data.all || [];

    window._buildCSChart = function(rangeVal) {
      var container = document.getElementById("cs-chart-container");
      if (!container) return;

      var isAllTime = rangeVal === 0;

      /* ── ALL TIME: 3 cot tong ── */
      if (isAllTime) {
        var totS = window._csAll.filter(function(r) { return r._verdict === "strong"; }).length;
        var totC = window._csAll.filter(function(r) { return r._verdict === "consider"; }).length;
        var totR = window._csAll.filter(function(r) { return r._verdict === "rejected"; }).length;
        var maxV = Math.max(totS, totC, totR, 1);

        container.innerHTML =
          '<div class="chart-col" style="flex:0 0 120px">' +
            '<div class="chart-bar-wrap">' +
              '<div class="chart-bar" style="height:' + Math.max(Math.round(totS/maxV*100), totS>0?4:0) + '%;background:var(--green)"></div>' +
            '</div>' +
            '<div class="chart-label">Strong hire</div>' +
            '<div class="chart-count green">' + totS + '</div>' +
          '</div>' +
          '<div class="chart-col" style="flex:0 0 120px">' +
            '<div class="chart-bar-wrap">' +
              '<div class="chart-bar" style="height:' + Math.max(Math.round(totC/maxV*100), totC>0?4:0) + '%;background:var(--yellow)"></div>' +
            '</div>' +
            '<div class="chart-label">Consider</div>' +
            '<div class="chart-count amber">' + totC + '</div>' +
          '</div>' +
          '<div class="chart-col" style="flex:0 0 120px">' +
            '<div class="chart-bar-wrap">' +
              '<div class="chart-bar" style="height:' + Math.max(Math.round(totR/maxV*100), totR>0?4:0) + '%;background:var(--red)"></div>' +
            '</div>' +
            '<div class="chart-label">Rejected</div>' +
            '<div class="chart-count red">' + totR + '</div>' +
          '</div>';

        _attachCSTooltips(container);
        return;
      }

      /* ── RANGE: stacked bar theo ngay ── */
      var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
      var buckets = [];
      for (var i = rangeVal - 1; i >= 0; i--) {
        var d   = new Date(now); d.setDate(d.getDate() - i);
        var ds  = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
        var lbl = String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0");
        var dayRows = window._csAll.filter(function(r) { return r._dateStr === ds; });
        buckets.push({
          ds:  ds,
          lbl: lbl,
          s:   dayRows.filter(function(r) { return r._verdict === "strong"; }).length,
          c:   dayRows.filter(function(r) { return r._verdict === "consider"; }).length,
          r:   dayRows.filter(function(r) { return r._verdict === "rejected"; }).length
        });
      }

      var maxTotal = Math.max.apply(null, buckets.map(function(b) { return b.s + b.c + b.r; }).concat([1]));
      var hasData  = buckets.some(function(b) { return b.s + b.c + b.r > 0; });

      if (!hasData) {
        container.innerHTML =
          '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:var(--text-muted)">' +
            '<i class="ti ti-chart-bar-off" style="font-size:28px"></i>' +
            '<span style="font-size:13px">Chua co du lieu trong khoang thoi gian nay</span>' +
          '</div>';
        return;
      }

      container.innerHTML = buckets.map(function(b) {
        var totalDay = b.s + b.c + b.r;
        var pctS = totalDay > 0 ? Math.round(b.s / maxTotal * 100) : 0;
        var pctC = totalDay > 0 ? Math.round(b.c / maxTotal * 100) : 0;
        var pctR = totalDay > 0 ? Math.round(b.r / maxTotal * 100) : 0;
        var totalPct = pctS + pctC + pctR;
        if (totalPct < 4 && totalDay > 0) totalPct = 4;

        var tipHtml = '<strong>' + b.ds + '</strong><br>' +
          '<span style="color:var(--green)">💚 Strong: ' + b.s + '</span><br>' +
          '<span style="color:var(--yellow)">🟡 Consider: ' + b.c + '</span><br>' +
          '<span style="color:var(--red)">❌ Rejected: ' + b.r + '</span>';

        return '<div class="chart-col" data-date="' + b.ds + '" data-tip="' + tipHtml.replace(/"/g, "&quot;") + '">' +
          '<div class="chart-bar-wrap">' +
            /* stacked: strong (bott) + consider (mid) + rejected (top) */
            '<div style="position:absolute;bottom:0;left:0;right:0;display:flex;flex-direction:column-reverse;height:100%;">' +
              (b.s > 0 ? '<div style="flex:0 0 ' + Math.max(pctS,2) + '%;background:var(--green);min-height:' + (b.s>0?3:0) + 'px"></div>' : '') +
              (b.c > 0 ? '<div style="flex:0 0 ' + Math.max(pctC,2) + '%;background:var(--yellow);min-height:' + (b.c>0?3:0) + 'px"></div>' : '') +
              (b.r > 0 ? '<div style="flex:0 0 ' + Math.max(pctR,2) + '%;background:var(--red);min-height:' + (b.r>0?3:0) + 'px"></div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="chart-label">' + b.lbl + '</div>' +
          '<div class="chart-count">' + (totalDay > 0 ? totalDay : '') + '</div>' +
        '</div>';
      }).join("");

      _attachCSTooltips(container);
    };

    /* Tooltip helper */
    function _attachCSTooltips(container) {
      var globalTip = document.getElementById("_cs_global_tip");
      if (!globalTip) {
        globalTip = document.createElement("div");
        globalTip.id = "_cs_global_tip";
        globalTip.style.cssText = "position:fixed;z-index:99999;background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text-primary);white-space:nowrap;line-height:1.8;pointer-events:none;display:none;font-family:var(--font-body)";
        document.body.appendChild(globalTip);
      }
      container.querySelectorAll(".chart-col").forEach(function(col) {
        col.addEventListener("mouseenter", function() {
          var tip = col.dataset.tip;
          if (!tip) return;
          globalTip.innerHTML = tip.replace(/&quot;/g, '"');
          globalTip.style.display = "block";
        });
        col.addEventListener("mousemove", function(e) {
          globalTip.style.left = (e.clientX - globalTip.offsetWidth / 2) + "px";
          globalTip.style.top  = (e.clientY - globalTip.offsetHeight - 14) + "px";
        });
        col.addEventListener("mouseleave", function() { globalTip.style.display = "none"; });
      });
    }
    window._attachCSTooltips = _attachCSTooltips;

    var chartHTML =
      '<div class="members-section" style="margin-bottom:0">' +
        '<div class="section-header">' +
          '<span class="section-title">Candidates theo ngay</span>' +
          '<select id="cs-chart-range" style="background:var(--bg-hover);border:1px solid var(--border-strong);color:var(--text-primary);font-size:12px;padding:4px 10px;border-radius:var(--radius-sm);cursor:pointer;outline:none">' +
            '<option value="7"  selected>7 ngay</option>' +
            '<option value="14">2 tuan</option>' +
            '<option value="30">1 thang</option>' +
            '<option value="0">All time</option>' +
          '</select>' +
        '</div>' +
        /* Legend */
        '<div style="display:flex;gap:16px;padding:0 20px 12px;font-size:11px;color:var(--text-muted)">' +
          '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--green);margin-right:5px"></span>Strong hire</span>' +
          '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--yellow);margin-right:5px"></span>Consider</span>' +
          '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--red);margin-right:5px"></span>Rejected</span>' +
        '</div>' +
        '<div id="cs-chart-container" class="chart-wrap"></div>' +
      '</div>';

    /* ── Candidates table ── */
    var verdictOrder = { strong: 0, consider: 1, rejected: 2 };
    var sorted = (data.all || []).slice().sort(function(a, b) {
      // Sort by date desc, then verdict
      if (b._dateStr !== a._dateStr) return b._dateStr.localeCompare(a._dateStr);
      return (verdictOrder[a._verdict] || 0) - (verdictOrder[b._verdict] || 0);
    });

    var VERDICT_CFG = {
      strong:   { label: "💚 Strong hire", cls: "green" },
      consider: { label: "🟡 Consider",    cls: "amber" },
      rejected: { label: "❌ Rejected",     cls: "red"   }
    };

    var tableRows = sorted.length === 0
      ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">Chua co data</td></tr>'
      : sorted.map(function(r) {
          var vc  = VERDICT_CFG[r._verdict] || { label: r._verdict, cls: "" };
          var ts  = (r["Timestamp"] || "").substring(0, 16).replace("T", " ");
          var score = r["Total Score Display"] || "—";
          var portal = r["Apply Through"] || "—";
          var role   = r["Role"] || r["Position"] || "—";
          var cvLink = r["Portfolio"] ? '<a href="' + r["Portfolio"] + '" target="_blank" style="color:var(--accent);font-size:11px"><i class="ti ti-file-cv"></i> CV</a>' : "—";

          return '<tr>' +
            '<td style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">' + (r["_dateStr"] || "—") + '</td>' +
            '<td style="font-weight:500;white-space:nowrap">' + (r["Name"] || "—") + '</td>' +
            '<td style="font-size:12px;color:var(--text-secondary)">' + role + '</td>' +
            '<td><span class="status-pill ' + (r._verdict === "strong" ? "submitted" : r._verdict === "consider" ? "" : "missing") + '" style="font-size:10px">' + vc.label + '</span></td>' +
            '<td style="font-family:var(--font-mono);font-weight:600;color:var(--' + vc.cls + ', var(--text-primary))">' + score + '</td>' +
            '<td>' + cvLink + '</td>' +
          '</tr>';
        }).join("");

    var candidatesHTML =
      '<div class="members-section">' +
        '<div class="section-header">' +
          '<span class="section-title">Tat ca candidates</span>' +
          '<span class="section-meta">' + sorted.length + ' records</span>' +
        '</div>' +
        '<table class="members-table">' +
          '<thead><tr>' +
            '<th>Ngay</th><th>Ten</th><th>Vi tri</th><th>Ket qua</th><th>Diem</th><th>CV</th>' +
          '</tr></thead>' +
          '<tbody>' + tableRows + '</tbody>' +
        '</table>' +
      '</div>';

    /* ── Tab info ── */
    var infoHTML =
      '<div class="tool-info-page">' +
        '<div class="tool-info-hero">' +
          '<div class="tool-info-icon"><i class="ti ti-user-check"></i></div>' +
          '<div>' +
            '<h2 class="tool-info-name">Candidate Scoring</h2>' +
            '<p class="tool-info-tagline">He thong cham diem CV tu dong bang AI cho cac vi tri tuyen dung tai F.Learning Studio.</p>' +
          '</div>' +
        '</div>' +
        '<div class="tool-info-section">' +
          '<div class="tool-info-section-title"><i class="ti ti-info-circle"></i> Mo ta</div>' +
          '<p class="tool-info-text">Khi co ung vien moi duoc them vao Google Sheet, n8n tu dong tai CV, extract text, cham diem theo rubric rieng cua tung vi tri bang GPT, roi day ket qua vao 3 tab tuong ung: Rejected / Considerable / Strong Match.</p>' +
        '</div>' +
        '<div class="tool-info-grid">' +
          '<div class="tool-info-section">' +
            '<div class="tool-info-section-title"><i class="ti ti-settings"></i> Cau hinh</div>' +
            '<div class="tool-info-kv">' +
              '<div class="kv-row"><span class="kv-key">Trigger</span><span class="kv-val">Google Sheets — row added</span></div>' +
              '<div class="kv-row"><span class="kv-key">AI model</span><span class="kv-val">GPT-5.4</span></div>' +
              '<div class="kv-row"><span class="kv-key">Positions</span><span class="kv-val">BD, Account, L&D, PC, HR Intern</span></div>' +
              '<div class="kv-row"><span class="kv-key">Verdict</span><span class="kv-val">Strong hire ≥80% / Consider ≥60% / Weak</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="tool-info-section">' +
            '<div class="tool-info-section-title"><i class="ti ti-database"></i> Data sources</div>' +
            '<div class="tool-info-kv">' +
              '<div class="kv-row"><span class="kv-key">Input</span><span class="kv-val kv-mono">[FAB] Recruitment data</span></div>' +
              '<div class="kv-row"><span class="kv-key">Output</span><span class="kv-val kv-mono">Candidate Scoring Sheet</span></div>' +
              '<div class="kv-row"><span class="kv-key">Tab Rejected</span><span class="kv-val kv-mono">Overall Verdict = Weak</span></div>' +
              '<div class="kv-row"><span class="kv-key">Tab Considerable</span><span class="kv-val kv-mono">Overall Verdict = Consider</span></div>' +
              '<div class="kv-row"><span class="kv-key">Tab Strong Match</span><span class="kv-val kv-mono">Overall Verdict = Strong hire</span></div>' +
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
    window._csTrackingHTML = statsHTML + chartHTML + candidatesHTML;
    window._csInfoHTML     = infoHTML;

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
          if (sel) {
            sel.addEventListener("change", function() {
              window._buildCSChart(parseInt(this.value));
            });
          }
        }
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
