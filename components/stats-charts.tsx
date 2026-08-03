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
import type { StatsData } from "@/src/services/admin-service";

// 상태 분포 파이차트 색상 (예정 / 진행 중 / 종료 순서 — getEventStatusDistribution의 반환 순서와 일치)
const STATUS_COLORS = ["#111827", "#6b7280", "#d1d5db"];

export function StatsCharts({
  eventTrend,
  userTrend,
  statusDistribution,
  topEvents,
}: StatsData) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* 이벤트 생성 추이 */}
      <div className="rounded-card bg-card border p-6 shadow-sm">
        <h2 className="mb-4 font-semibold">이벤트 생성 추이</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={eventTrend}>
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
              data={statusDistribution}
              cx="50%"
              cy="45%"
              outerRadius={100}
              dataKey="value"
              label={({ value }) => value}
              labelLine={false}
            >
              {statusDistribution.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                />
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
          <AreaChart data={userTrend}>
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
            data={topEvents}
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
