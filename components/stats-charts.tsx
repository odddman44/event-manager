"use client";

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// 이벤트 생성 추이 (9/16 ~ 10/14)
const eventTrendData = [
  { date: "9/16", count: 2 },
  { date: "9/18", count: 3 },
  { date: "9/20", count: 1 },
  { date: "9/22", count: 3 },
  { date: "9/24", count: 2 },
  { date: "9/26", count: 2 },
  { date: "9/28", count: 1 },
  { date: "9/30", count: 2 },
  { date: "10/2", count: 3 },
  { date: "10/4", count: 2 },
  { date: "10/6", count: 2 },
  { date: "10/8", count: 1 },
  { date: "10/10", count: 3 },
  { date: "10/12", count: 2 },
  { date: "10/14", count: 3 },
];

// 사용자 가입 추이
const userTrendData = [
  { date: "9/16", count: 2 },
  { date: "9/18", count: 3 },
  { date: "9/20", count: 1 },
  { date: "9/22", count: 2 },
  { date: "9/24", count: 3 },
  { date: "9/26", count: 1 },
  { date: "9/28", count: 2 },
  { date: "9/30", count: 1 },
  { date: "10/2", count: 3 },
  { date: "10/4", count: 2 },
  { date: "10/6", count: 1 },
  { date: "10/8", count: 2 },
  { date: "10/10", count: 3 },
  { date: "10/12", count: 1 },
  { date: "10/14", count: 2 },
];

// 이벤트 상태 분포
const statusData = [
  { name: "예정", value: 10, color: "#111827" },
  { name: "진행 중", value: 5, color: "#6b7280" },
  { name: "종료", value: 5, color: "#d1d5db" },
];

// 인기 이벤트 TOP 5
const topEventsData = [
  { name: "AI/ML 해커톤 2025", participants: 24 },
  { name: "개발자 네트워킹 밤", participants: 20 },
  { name: "풀스택 부트캠프", participants: 16 },
  { name: "백엔드 컨퍼런스", participants: 12 },
  { name: "UX/UI 워크샵", participants: 10 },
];

export function StatsCharts() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* 이벤트 생성 추이 */}
      <div className="rounded-card bg-card border p-6 shadow-sm">
        <h2 className="mb-4 font-semibold">이벤트 생성 추이</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={eventTrendData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
            />
            <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Line
              type="monotone"
              dataKey="count"
              name="이벤트 수"
              stroke="#111827"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 이벤트 상태 분포 */}
      <div className="rounded-card bg-card border p-6 shadow-sm">
        <h2 className="mb-4 font-semibold">이벤트 상태 분포</h2>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={statusData}
              cx="50%"
              cy="45%"
              outerRadius={100}
              dataKey="value"
              label={({ value }) => value}
              labelLine={false}
            >
              {statusData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Legend
              iconType="circle"
              iconSize={10}
              formatter={(value) => (
                <span style={{ fontSize: "12px" }}>{value}</span>
              )}
            />
            <Tooltip
              contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
              formatter={(value, name) => [`${value}개`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* 사용자 가입 추이 */}
      <div className="rounded-card bg-card border p-6 shadow-sm">
        <h2 className="mb-4 font-semibold">사용자 가입 추이</h2>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={userTrendData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
            />
            <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
            <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
            <Area
              type="monotone"
              dataKey="count"
              name="가입자 수"
              stroke="#6b7280"
              fill="#d1d5db"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 인기 이벤트 TOP 5 */}
      <div className="rounded-card bg-card border p-6 shadow-sm">
        <h2 className="mb-4 font-semibold">인기 이벤트 TOP 5</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={topEventsData}
            layout="vertical"
            margin={{ left: 8, right: 16 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11 }}
              width={100}
              className="fill-muted-foreground"
            />
            <Tooltip
              contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
              formatter={(value) => [`${value}명`, "참여자"]}
            />
            <Bar
              dataKey="participants"
              name="참여자"
              fill="#111827"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
