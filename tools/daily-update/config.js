window.TOOL_REGISTRY = window.TOOL_REGISTRY || [];

window.TOOL_REGISTRY.push({
  id:          "daily-update",
  name:        "Daily Update",
  description: "Tracking ti le submit standup hang ngay cua team.",
  icon:        "ti-square-check",
  status:      "active",

  dataSource: {
    type:           "github-json",
    dailyTasksUrl:  "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/daily-tasks.json",
    responsesUrl:   "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/responses.json",
    membersUrl:     "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/members.json",
    summaryUrl:     "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/tracking/daily-update-summary.json",
    submissionsUrl: "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/tracking/daily-update-submissions.json",
    cacheBust:      true
  },

  metrics: [
    {
      key:    "submissionRate",
      label:  "Ti le submit",
      format: "percent",
      colorFn: function(v) { return v >= 80 ? "green" : v >= 50 ? "amber" : "red"; }
    },
    {
      key:      "submittedCount",
      label:    "Da submit",
      format:   "fraction",
      denomKey: "totalMembers"
    },
    {
      key:    "missingCount",
      label:  "Chua submit",
      format: "number",
      colorFn: function(v) { return v === 0 ? "green" : v <= 2 ? "amber" : "red"; }
    }
  ],

  renderDetail: null
});
