const DAILY_UPDATE_TOOL = {
  id:          "daily-update-task-pm",
  name:        "daily-",
  description: "Tracking tỉ lệ submit standup hàng ngày của team.",
  icon:        "ti-check-square",
  status:      "active",

  dataSource: {
    type:          "github-json",
    dailyTasksUrl: "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/daily-tasks.json",
    responsesUrl:  "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/responses.json",
    membersUrl:    "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/members.json",
    summaryUrl:    "https://raw.githubusercontent.com/minhwuan1234/daily-update-task-process-pm/main/tracking/daily-update-summary.json",
    cacheBust:     true,
  },

  metrics: [
    {
      key:     "submissionRate",
      label:   "Tỉ lệ submit",
      format:  "percent",
      colorFn: (v) => v >= 80 ? "green" : v >= 50 ? "amber" : "red",
    },
    {
      key:      "submittedCount",
      label:    "Đã submit",
      format:   "fraction",
      denomKey: "totalMembers",
    },
    {
      key:     "missingCount",
      label:   "Chưa submit",
      format:  "number",
      colorFn: (v) => v === 0 ? "green" : v <= 2 ? "amber" : "red",
    },
  ],

  renderDetail: null,
};

window.TOOL_REGISTRY = window.TOOL_REGISTRY || [];
window.TOOL_REGISTRY.push(DAILY_UPDATE_TOOL);
