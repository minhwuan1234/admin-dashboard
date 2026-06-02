/* ══════════════════════════════════════════════════════════════
   TOOL CONFIG: Candidate Scoring
   Data: Google Sheets 3 tabs (Rejected / Considerable / Strong Match)
   ══════════════════════════════════════════════════════════════ */

window.TOOL_REGISTRY = window.TOOL_REGISTRY || [];

window.TOOL_REGISTRY.push({
  id:          "candidate-scoring",
  name:        "Candidate Scoring",
  description: "Tracking ung vien cham diem tu dong qua n8n, phan loai theo nen tang va vi tri.",
  icon:        "ti-user-check",
  status:      "active",

  _sheetId:    "19YTdoUKx_MtflEcz7pyNxAfmvf-MEROsleODroj7fiw",
  _sheetNames: { rejected: "Rejected", consider: "Considerable", strong: "Strong Match" },

  _platformColors: {
    "Linkedin": "#0A66C2", "LinkedIn": "#0A66C2",
    "TopCV":    "#E84141",
    "Glints":   "#0BD0A1",
    "Email":    "#6B7280",
    "Unknown":  "#94A3B8"
  },

  /* ══════════════ FETCH ══════════════ */
  fetchData: async function(utils) {
    var self    = this;
    var sheetId = this._sheetId;
    var names   = this._sheetNames;

    function splitCSVLine(line) {
      var res=[],cur="",inQ=false;
      for (var i=0;i<line.length;i++){
        var c=line[i];
        if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}
        else if(c===','&&!inQ){res.push(cur);cur="";}
        else cur+=c;
      }
      res.push(cur);return res;
    }
    function parseCSV(text){
      var lines=text.split("\n").filter(function(l){return l.trim();});
      if(lines.length<2)return[];
      var hdrs=splitCSVLine(lines[0]);
      return lines.slice(1).map(function(line){
        var vals=splitCSVLine(line),obj={};
        hdrs.forEach(function(h,i){obj[h.trim()]=(vals[i]||"").trim();});
        return obj;
      }).filter(function(r){return r["Timestamp"]&&r["Name"];});
    }
    async function fetchSheet(tab){
      var url="https://docs.google.com/spreadsheets/d/"+sheetId+
              "/gviz/tq?tqx=out:csv&sheet="+encodeURIComponent(tab)+"&t="+Date.now();
      var res=await fetch(url);
      if(!res.ok)throw new Error("HTTP "+res.status);
      return parseCSV(await res.text());
    }
    function toDateStr(ts){
      var m=(ts||"").match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:null;
    }

    var results=await Promise.all([
      fetchSheet(names.rejected).catch(function(){return[];}),
      fetchSheet(names.consider).catch(function(){return[];}),
      fetchSheet(names.strong).catch(function(){return[];})
    ]);
    results[0].forEach(function(r){r._verdict="rejected";});
    results[1].forEach(function(r){r._verdict="consider";});
    results[2].forEach(function(r){r._verdict="strong";});

    var all=results[0].concat(results[1]).concat(results[2]).map(function(r){
      r._dateStr =toDateStr(r["Timestamp"]);
      r._platform=(r["Apply Through"]||"Unknown").trim();
      r._role    =(r["Role"]||r["Position"]||"Unknown").trim();
      return r;
    }).filter(function(r){return r._dateStr;});

    all.sort(function(a,b){return a._dateStr.localeCompare(b._dateStr);});

    var platformSet={},roleSet={};
    all.forEach(function(r){platformSet[r._platform]=true;roleSet[r._role]=true;});
    var platforms=Object.keys(platformSet).sort();
    var roles    =Object.keys(roleSet).sort();

    var fallback=["#818cf8","#fb923c","#2dd4bf","#f472b6","#a3e635"];
    var pColors={};var fi=0;
    platforms.forEach(function(p){
      pColors[p]=self._platformColors[p]||fallback[fi++%fallback.length];
    });

    return {
      all:all,
      totalAll:      all.length,
      totalRejected: results[0].length,
      totalConsider: results[1].length,
      totalStrong:   results[2].length,
      platforms:platforms,
      roles:roles,
      pColors:pColors
    };
  },

  /* ══════════════ CARD ══════════════ */
  renderCard: function(data){
    var total=data.totalAll,sc=data.totalStrong,co=data.totalConsider,re=data.totalRejected;
    var sRate=total>0?Math.round(sc/total*100):0;
    var sColor=sRate>=30?"green":sRate>=15?"amber":"red";
    return '<div class="tool-metrics">'+
      '<div class="tool-metric"><span class="metric-value">'+total+'</span><span class="metric-label">Tong UV</span></div>'+
      '<div class="tool-metric"><span class="metric-value green">'+sc+'</span><span class="metric-label">💚 Strong</span></div>'+
      '<div class="tool-metric"><span class="metric-value amber">'+co+'</span><span class="metric-label">🟡 Consider</span></div>'+
      '<div class="tool-metric"><span class="metric-value red">'+re+'</span><span class="metric-label">❌ Rejected</span></div>'+
      '</div>'+
      '<div class="mini-bar-wrap" style="margin-top:10px">'+
        '<span style="font-size:10px;color:var(--text-muted);width:52px">Strong</span>'+
        '<div class="mini-bar"><div class="mini-bar-fill" style="width:'+sRate+'%"></div></div>'+
        '<span class="mini-bar-pct '+sColor+'">'+sRate+'%</span>'+
      '</div>';
  },

  /* ══════════════ DETAIL ══════════════ */
  renderDetail: function(data,utils){
    if(!data||data._error)return'<div class="state-error"><i class="ti ti-alert-circle"></i> Khong the tai data</div>';
    if(data._loading)return'<div class="state-loading"><div class="spinner"></div><p>Dang tai...</p></div>';

    var tabBar=
      '<div class="tab-bar">'+
        '<button class="tab-btn active" data-tab="tracking"><i class="ti ti-chart-bar"></i> Tracking</button>'+
        '<button class="tab-btn" data-tab="info"><i class="ti ti-info-circle"></i> Thong tin tool</button>'+
      '</div>'+
      '<div id="tab-tracking" class="tab-pane"></div>'+
      '<div id="tab-info"     class="tab-pane" style="display:none"></div>';

    /* Stats */
    var total=data.totalAll,sc=data.totalStrong,co=data.totalConsider,re=data.totalRejected;
    var sRate=total>0?Math.round(sc/total*100):0;
    var cRate=total>0?Math.round(co/total*100):0;
    var statsHTML=
      '<div class="detail-stats">'+
        '<div class="stat-card"><span class="stat-label">Tong ung vien</span><span class="stat-value">'+total+'</span><span class="stat-delta"><i class="ti ti-users"></i> Da cham diem</span></div>'+
        '<div class="stat-card"><span class="stat-label">💚 Strong hire</span><span class="stat-value green">'+sc+'</span><span class="stat-delta">'+sRate+'% tong so</span></div>'+
        '<div class="stat-card"><span class="stat-label">🟡 Consider</span><span class="stat-value amber">'+co+'</span><span class="stat-delta">'+cRate+'% tong so</span></div>'+
        '<div class="stat-card"><span class="stat-label">❌ Rejected</span><span class="stat-value red">'+re+'</span><span class="stat-delta">'+(100-sRate-cRate)+'% tong so</span></div>'+
      '</div>';

    /* Globals */
    window._csAll     =data.all     ||[];
    window._csPlatforms=data.platforms||[];
    window._csPColors  =data.pColors  ||{};

    /* ══ CHART: full-width, 1 col per platform, stacked verdict ══ */
    window._buildCSChart=function(){
      var wrap=document.getElementById("cs-chart-outer");
      if(!wrap)return;

      var all      =window._csAll;
      var platforms=window._csPlatforms;
      var pColors  =window._csPColors;

      if(!all.length){
        wrap.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:220px;gap:8px;color:var(--text-muted)">'+
          '<i class="ti ti-chart-bar-off" style="font-size:32px"></i>'+
          '<span style="font-size:13px">Chua co du lieu</span></div>';
        return;
      }

      /* per-platform data */
      var ptData=platforms.map(function(p){
        var rows=all.filter(function(r){return r._platform===p;});
        var s=rows.filter(function(r){return r._verdict==="strong";}).length;
        var c=rows.filter(function(r){return r._verdict==="consider";}).length;
        var rv=rows.filter(function(r){return r._verdict==="rejected";}).length;
        return{p:p,s:s,c:c,r:rv,total:s+c+rv};
      }).filter(function(d){return d.total>0;});

      var maxVal=Math.max.apply(null,ptData.map(function(d){return d.total;}));
      if(!maxVal)maxVal=1;

      /* Y ticks */
      var rawStep=maxVal/4;
      var tickStep=Math.ceil(rawStep);
      if(tickStep<1)tickStep=1;
      var ticks=[];
      for(var t=0;t<=Math.ceil(maxVal/tickStep);t++)ticks.push(t*tickStep);
      var yMax=ticks[ticks.length-1]||1;

      var CHART_H=220;
      var Y_W=28;

      /* grid lines */
      var gridHTML=ticks.map(function(tick){
        var pct=tick/yMax*100;
        return '<div style="position:absolute;left:0;right:0;bottom:'+pct+'%;border-top:1px dashed rgba(255,255,255,.07);pointer-events:none">'+
          '<span style="position:absolute;right:calc(100% + 6px);transform:translateY(-50%);font-size:10px;color:var(--text-muted);font-family:var(--font-mono);white-space:nowrap">'+tick+'</span>'+
        '</div>';
      }).join("")+
      '<div style="position:absolute;bottom:0;left:0;right:0;border-top:1px solid var(--border-strong)"></div>';

      /* columns */
      var colsHTML=ptData.map(function(d){
        var color=pColors[d.p]||"var(--accent)";
        var pctH =d.total/yMax*100;
        var pctS =d.total>0?d.s/d.total*100:0;
        var pctC =d.total>0?d.c/d.total*100:0;
        var pctR =100-pctS-pctC;

        var tipHtml='<strong>'+d.p+'</strong><br>'+
          '<span style="color:#4ade80">💚 Strong hire: '+d.s+'</span><br>'+
          '<span style="color:#fbbf24">🟡 Consider: '+d.c+'</span><br>'+
          '<span style="color:#f87171">❌ Rejected: '+d.r+'</span><br>'+
          '<span style="color:var(--text-muted)">Total: '+d.total+'</span>';

        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:10px;min-width:0" '+
               'data-tip="'+tipHtml.replace(/"/g,"&quot;")+'">'+
          /* bar column */
          '<div style="width:100%;height:'+CHART_H+'px;position:relative;display:flex;flex-direction:column;justify-content:flex-end">'+
            '<div style="width:100%;height:'+Math.max(pctH,d.total>0?2:0)+'%;'+
                 'display:flex;flex-direction:column-reverse;'+
                 'border-radius:4px 4px 0 0;overflow:hidden;'+
                 'border-bottom:3px solid '+color+'">'+
              (d.r>0?'<div style="flex:'+Math.max(pctR,2)+';background:#f87171"></div>':'')+
              (d.c>0?'<div style="flex:'+Math.max(pctC,2)+';background:#fbbf24"></div>':'')+
              (d.s>0?'<div style="flex:'+Math.max(pctS,2)+';background:#4ade80"></div>':'')+
            '</div>'+
          '</div>'+
          /* label row */
          '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:100%">'+
            '<span style="width:9px;height:9px;border-radius:50%;background:'+color+';flex-shrink:0"></span>'+
            '<span style="font-size:11px;color:var(--text-secondary);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-align:center">'+d.p+'</span>'+
            '<span style="font-size:13px;font-weight:700;color:var(--text-primary);font-family:var(--font-mono)">'+d.total+'</span>'+
          '</div>'+
        '</div>';
      }).join("");

      /* legend */
      var legendHTML=
        '<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:20px;font-size:11px;color:var(--text-muted)">'+
          '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:2px;background:#4ade80"></span>Strong hire</span>'+
          '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:2px;background:#fbbf24"></span>Consider</span>'+
          '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:2px;background:#f87171"></span>Rejected</span>'+
          '<span style="color:var(--border-strong)">|</span>'+
          ptData.map(function(d){
            var color=pColors[d.p]||"var(--accent)";
            return'<span style="display:inline-flex;align-items:center;gap:6px">'+
              '<span style="width:9px;height:9px;border-radius:50%;background:'+color+'"></span>'+d.p+'</span>';
          }).join("")+
        '</div>';

      wrap.innerHTML=legendHTML+
        '<div style="position:relative;padding-left:'+(Y_W+4)+'px">'+
          /* grid */
          '<div style="position:absolute;left:'+(Y_W+4)+'px;right:0;top:0;height:'+CHART_H+'px">'+gridHTML+'</div>'+
          /* bars */
          '<div style="display:flex;align-items:flex-end;gap:12px;height:'+(CHART_H+56)+'px;padding:0 8px">'+
            colsHTML+
          '</div>'+
        '</div>';

      /* tooltips */
      var tip=document.getElementById("_cs_tip");
      if(!tip){
        tip=document.createElement("div");
        tip.id="_cs_tip";
        tip.style.cssText="position:fixed;z-index:99999;background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--text-primary);white-space:nowrap;line-height:1.9;pointer-events:none;display:none;font-family:var(--font-body);box-shadow:0 4px 20px rgba(0,0,0,.35)";
        document.body.appendChild(tip);
      }
      wrap.querySelectorAll("[data-tip]").forEach(function(el){
        el.addEventListener("mouseenter",function(){
          tip.innerHTML=el.dataset.tip.replace(/&quot;/g,'"');
          tip.style.display="block";
        });
        el.addEventListener("mousemove",function(e){
          tip.style.left=(e.clientX-tip.offsetWidth/2)+"px";
          tip.style.top=(e.clientY-tip.offsetHeight-16)+"px";
        });
        el.addEventListener("mouseleave",function(){tip.style.display="none";});
      });
    };

    /* Chart HTML */
    var chartHTML=
      '<div class="members-section" style="margin-bottom:0">'+
        '<div class="section-header">'+
          '<span class="section-title">Theo nen tang</span>'+
          '<span class="section-meta" style="font-size:11px;color:var(--text-muted)">All time</span>'+
        '</div>'+
        '<div id="cs-chart-outer" style="padding:20px 24px 16px"></div>'+
      '</div>';

    /* Summary table */
    var summaryRows=(data.platforms||[]).map(function(p){
      var rows=(data.all||[]).filter(function(r){return r._platform===p;});
      var s=rows.filter(function(r){return r._verdict==="strong";}).length;
      var c=rows.filter(function(r){return r._verdict==="consider";}).length;
      var rv=rows.filter(function(r){return r._verdict==="rejected";}).length;
      var t=rows.length;
      var sRate=t>0?Math.round(s/t*100):0;
      var color=(data.pColors||{})[p]||"var(--accent)";
      return'<tr>'+
        '<td><span style="display:inline-flex;align-items:center;gap:8px">'+
          '<span style="width:8px;height:8px;border-radius:50%;background:'+color+';flex-shrink:0"></span>'+
          '<span style="font-weight:500">'+p+'</span></span></td>'+
        '<td style="text-align:center;font-weight:600;color:#4ade80">'+s+'</td>'+
        '<td style="text-align:center;font-weight:600;color:#fbbf24">'+c+'</td>'+
        '<td style="text-align:center;font-weight:600;color:#f87171">'+rv+'</td>'+
        '<td style="text-align:center;font-family:var(--font-mono);font-weight:700">'+t+'</td>'+
        '<td style="min-width:120px">'+
          '<div style="display:flex;align-items:center;gap:8px">'+
            '<div style="flex:1;height:6px;background:var(--bg-hover);border-radius:3px;overflow:hidden">'+
              '<div style="height:100%;width:'+sRate+'%;background:#4ade80;border-radius:3px"></div>'+
            '</div>'+
            '<span style="font-size:11px;color:var(--text-muted);width:32px;text-align:right">'+sRate+'%</span>'+
          '</div>'+
        '</td>'+
      '</tr>';
    }).join("");

    var summaryHTML=
      '<div class="members-section">'+
        '<div class="section-header"><span class="section-title">Tong hop theo nen tang</span><span class="section-meta">All time</span></div>'+
        '<table class="members-table">'+
          '<thead><tr>'+
            '<th>Nen tang</th>'+
            '<th style="text-align:center">💚 Strong</th>'+
            '<th style="text-align:center">🟡 Consider</th>'+
            '<th style="text-align:center">❌ Rejected</th>'+
            '<th style="text-align:center">Total</th>'+
            '<th>Strong rate</th>'+
          '</tr></thead>'+
          '<tbody>'+summaryRows+'</tbody>'+
        '</table>'+
      '</div>';

    /* Candidates table */
    var verdictOrder={strong:0,consider:1,rejected:2};
    var sorted=(data.all||[]).slice().sort(function(a,b){
      if(b._dateStr!==a._dateStr)return b._dateStr.localeCompare(a._dateStr);
      return(verdictOrder[a._verdict]||0)-(verdictOrder[b._verdict]||0);
    });

    var VERDICT_CFG={
      strong:  {label:"💚 STRONG HIRE",pillClass:"submitted"},
      consider:{label:"🟡 CONSIDER",   pillClass:""},
      rejected:{label:"❌ REJECTED",    pillClass:"missing"}
    };

    function buildRows(rows){
      if(!rows.length)return'<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px">'+
        '<i class="ti ti-inbox" style="font-size:24px;display:block;margin-bottom:8px"></i>Chua co ung vien</td></tr>';
      return rows.map(function(r){
        var vc=VERDICT_CFG[r._verdict]||{label:r._verdict,pillClass:""};
        var cvLink=r["Portfolio"]
          ?'<a href="'+r["Portfolio"]+'" target="_blank" style="color:var(--accent);font-size:11px"><i class="ti ti-file-cv"></i> CV</a>'
          :'<span style="color:var(--text-muted)">—</span>';
        var pColor=(data.pColors||{})[r._platform]||"var(--text-muted)";
        return'<tr>'+
          '<td style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);white-space:nowrap">'+r._dateStr+'</td>'+
          '<td style="font-weight:500">'+r["Name"]+'</td>'+
          '<td style="font-size:12px;color:var(--text-secondary)">'+r._role+'</td>'+
          '<td><span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary)">'+
            '<span style="width:7px;height:7px;border-radius:50%;background:'+pColor+';flex-shrink:0"></span>'+
            r._platform+'</span></td>'+
          '<td><span class="status-pill '+vc.pillClass+'" style="font-size:10px;letter-spacing:.03em">'+vc.label+'</span></td>'+
          '<td style="font-family:var(--font-mono);font-weight:600">'+r["Total Score Display"]+'</td>'+
          '<td>'+cvLink+'</td>'+
        '</tr>';
      }).join("");
    }

    var roles=data.roles||[];
    var roleTabBar=
      '<div style="display:flex;gap:0;border-bottom:1px solid var(--border);overflow-x:auto">'+
      ['Tat ca'].concat(roles).map(function(role,idx){
        var count=role==='Tat ca'?sorted.length:sorted.filter(function(r){return r._role===role;}).length;
        var isActive=idx===0;
        return'<button class="cs-role-tab" data-role="'+role+'" style="'+
          'padding:9px 16px;font-size:12px;font-family:var(--font-body);background:transparent;border:none;'+
          'border-bottom:2px solid '+(isActive?'var(--accent)':'transparent')+';'+
          'color:'+(isActive?'var(--accent)':'var(--text-muted)')+';'+
          'cursor:pointer;white-space:nowrap;transition:color .15s,border-color .15s">'+
          role+' <span style="font-size:10px;opacity:.65">('+count+')</span>'+
        '</button>';
      }).join("")+'</div>';

    var candidatesHTML=
      '<div class="members-section">'+
        '<div class="section-header">'+
          '<span class="section-title">Ung vien theo vi tri</span>'+
          '<span class="section-meta">'+sorted.length+' records</span>'+
        '</div>'+
        roleTabBar+
        '<table class="members-table">'+
          '<thead><tr><th>Ngay</th><th>Ten</th><th>Vi tri</th><th>Nen tang</th><th>Ket qua</th><th>Diem</th><th>CV</th></tr></thead>'+
          '<tbody id="cs-role-tbody">'+buildRows(sorted)+'</tbody>'+
        '</table>'+
      '</div>';

    /* Info tab */
    var infoHTML=
      '<div class="tool-info-page">'+
        '<div class="tool-info-hero">'+
          '<div class="tool-info-icon"><i class="ti ti-user-check"></i></div>'+
          '<div><h2 class="tool-info-name">Candidate Scoring</h2>'+
          '<p class="tool-info-tagline">He thong cham diem CV tu dong bang AI cho cac vi tri tuyen dung tai F.Learning Studio.</p></div>'+
        '</div>'+
        '<div class="tool-info-section">'+
          '<div class="tool-info-section-title"><i class="ti ti-info-circle"></i> Mo ta</div>'+
          '<p class="tool-info-text">Khi co ung vien moi them vao Google Sheet, n8n tu dong tai CV, extract text, cham diem theo rubric rieng cua tung vi tri bang GPT, roi day ket qua vao 3 tab: Rejected / Considerable / Strong Match.</p>'+
        '</div>'+
        '<div class="tool-info-grid">'+
          '<div class="tool-info-section">'+
            '<div class="tool-info-section-title"><i class="ti ti-settings"></i> Cau hinh</div>'+
            '<div class="tool-info-kv">'+
              '<div class="kv-row"><span class="kv-key">Trigger</span><span class="kv-val">Google Sheets — row added</span></div>'+
              '<div class="kv-row"><span class="kv-key">AI model</span><span class="kv-val">GPT-5.4</span></div>'+
              '<div class="kv-row"><span class="kv-key">Positions</span><span class="kv-val">BD, Account, L&D, PC, HR Intern</span></div>'+
              '<div class="kv-row"><span class="kv-key">Verdict</span><span class="kv-val">Strong ≥80% / Consider ≥60% / Weak</span></div>'+
            '</div>'+
          '</div>'+
          '<div class="tool-info-section">'+
            '<div class="tool-info-section-title"><i class="ti ti-database"></i> Data sources</div>'+
            '<div class="tool-info-kv">'+
              '<div class="kv-row"><span class="kv-key">Input</span><span class="kv-val kv-mono">[FAB] Recruitment data</span></div>'+
              '<div class="kv-row"><span class="kv-key">Output</span><span class="kv-val kv-mono">Candidate Scoring Sheet</span></div>'+
            '</div>'+
          '</div>'+
        '</div>'+
        '<div class="tool-info-section">'+
          '<div class="tool-info-section-title"><i class="ti ti-link"></i> Lien ket</div>'+
          '<div class="tool-info-links">'+
            '<a class="tool-info-link" href="https://n8n.tonytran.design/workflow/pExOqbUpHFPYapsI" target="_blank"><i class="ti ti-topology-star"></i> n8n Workflow</a>'+
            '<a class="tool-info-link" href="https://docs.google.com/spreadsheets/d/19YTdoUKx_MtflEcz7pyNxAfmvf-MEROsleODroj7fiw" target="_blank"><i class="ti ti-table"></i> Google Sheet Output</a>'+
          '</div>'+
        '</div>'+
      '</div>';

    /* Store + init */
    window._csTrackingHTML=statsHTML+chartHTML+summaryHTML+candidatesHTML;
    window._csInfoHTML    =infoHTML;
    window._csSorted      =sorted;
    window._csBuildRows   =buildRows;

    window._initCSTabs=function(){
      var tracking=document.getElementById("tab-tracking");
      var info    =document.getElementById("tab-info");
      if(tracking)tracking.innerHTML=window._csTrackingHTML;
      if(info)    info.innerHTML    =window._csInfoHTML;

      setTimeout(function(){
        if(window._buildCSChart)window._buildCSChart();

        /* role tabs */
        var roleTabs=document.querySelectorAll(".cs-role-tab");
        var tbody   =document.getElementById("cs-role-tbody");
        roleTabs.forEach(function(btn){
          btn.addEventListener("click",function(){
            roleTabs.forEach(function(b){
              b.style.borderBottomColor="transparent";
              b.style.color="var(--text-muted)";
            });
            btn.style.borderBottomColor="var(--accent)";
            btn.style.color="var(--accent)";
            var role=btn.dataset.role;
            var rows=role==="Tat ca"
              ?window._csSorted
              :(window._csSorted||[]).filter(function(r){return r._role===role;});
            if(tbody)tbody.innerHTML=window._csBuildRows(rows);
          });
        });
      },50);

      /* main tabs */
      var btns =document.querySelectorAll(".tab-btn");
      var panes=document.querySelectorAll(".tab-pane");
      btns.forEach(function(btn){
        btn.addEventListener("click",function(){
          btns.forEach(function(b){b.classList.remove("active");});
          panes.forEach(function(p){p.style.display="none";p.classList.remove("active");});
          btn.classList.add("active");
          var target=document.getElementById("tab-"+btn.dataset.tab);
          if(target){target.style.display="block";target.classList.add("active");}
          if(btn.dataset.tab==="tracking"){
            setTimeout(function(){if(window._buildCSChart)window._buildCSChart();},50);
          }
        });
      });
    };

    return tabBar;
  }
});
