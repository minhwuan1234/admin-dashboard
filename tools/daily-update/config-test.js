/* ══════════════════════════════════════════════════════════════
   TOOL TEMPLATE
   
   Cach them tool moi:
   1. Copy folder nay thanh tools/[your-tool-id]/
   2. Dien vao cac field ben duoi
   3. Them <script src="tools/[your-tool-id]/config.js"></script>
      vao index.html TRUOC dashboard.js
   4. Done — tool tu hien tren dashboard
   ══════════════════════════════════════════════════════════════ */

window.TOOL_REGISTRY = window.TOOL_REGISTRY || [];

window.TOOL_REGISTRY.push({

  /* ── Bat buoc ── */
  id:          "your-tool-id",
  name:        "Ten Tool",
  description: "Mo ta ngan 1 cau.",
  icon:        "ti-chart-bar",   /* tabler.io/icons */
  status:      "coming-soon",    /* "active" | "coming-soon" | "archived" */

  /* ── fetchData: fetch + xu ly data, tra ve 1 object ──
     utils co san: fetchJson(url, bustCache), formatTime(iso), getVNDateStr(offsetDays)
  ── */
  fetchData: async function(utils) {
    /* Vi du:
    var data = await utils.fetchJson("https://raw.githubusercontent.com/.../data.json", true);
    return {
      total: data.total,
      rate:  data.rate,
      items: data.items
    };
    */
    return {};
  },

  /* ── renderCard: hien thi tren overview card ── */
  renderCard: function(data) {
    /* Vi du:
    return '<div class="tool-metrics">' +
      '<div class="tool-metric"><span class="metric-value green">' + data.total + '</span><span class="metric-label">Total</span></div>' +
    '</div>';
    */
    return '<div class="tool-metrics"><span style="font-size:12px;color:var(--text-muted)">No data</span></div>';
  },

  /* ── renderDetail: hien thi tren detail page khi click vao card ── */
  renderDetail: function(data, utils) {
    /* utils.formatTime(isoString) → "17:46"
       utils.formatDate(date)      → "Thu Sau, 29/05/2026"
       utils.getVNDateStr(0)       → "2026-05-29" (hom nay)
       utils.getVNDateStr(-1)      → "2026-05-28" (hom qua)
    */
    return '<div class="state-empty"><i class="ti ti-tools" style="font-size:32px"></i><p>Chua co detail view.</p></div>';
  }

});
