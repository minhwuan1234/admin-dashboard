# Admin Dashboard — F.Learning Studio

## Cấu trúc tổng quan

```
admin-dashboard/
├── index.html          ← Entry point, hiển thị tất cả tools
├── style.css           ← Global styles (màu, font, layout chung)
├── dashboard.js        ← Core engine: load tools, render cards, fetch data
├── tools/              ← Mỗi tool = 1 folder riêng
│   ├── daily-update/   ← Tool 1: Daily standup tracking
│   │   └── config.js   ← Config của tool này (data source, metrics, display)
│   └── [tool-name]/    ← Tool N: thêm folder mới ở đây
│       └── config.js
└── assets/
    └── ...
```

## Cách thêm tool mới

1. Tạo folder mới trong `tools/`
2. Copy `tools/_template/config.js` và điền vào
3. Import trong `dashboard.js` → array `TOOLS`
4. Done — tool tự render lên dashboard

## Tool config schema

Mỗi `config.js` export một object với các field sau:

```js
export default {
  id: "tool-id",              // unique, dùng để route
  name: "Tool Name",          // hiển thị trên card
  description: "...",         // 1 câu mô tả ngắn
  icon: "ti-chart-bar",       // Tabler icon class
  status: "active",           // "active" | "coming-soon" | "archived"
  dataSource: {
    type: "github-json",      // hiện tại chỉ support "github-json"
    url: "https://raw.githubusercontent.com/...",
  },
  metrics: [                  // các số liệu hiển thị trên card
    {
      key: "submissionRate",  // key trong data JSON
      label: "Tỉ lệ submit",
      format: "percent",      // "percent" | "number" | "text"
    }
  ],
  detailView: "daily-update", // tên module JS để render detail page
}
```
