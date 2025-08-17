"use client"

import { Bar, XAxis, YAxis, ResponsiveContainer, Line, ComposedChart } from "recharts"

const data = [
  { day: "Sat", performance: 25, line: 25 },
  { day: "Sun", performance: 50, line: 50 },
  { day: "Mon", performance: 35, line: 35 },
  { day: "Tue", performance: 75, line: 45 },
  { day: "Wed", performance: 80, line: 80 },
  { day: "Thu", performance: 25, line: 25 },
  { day: "Fri", performance: 65, line: 65 },
]

export function AgentPerformanceChart() {
  return (
    <div className="h-64">
      <div className="flex justify-between text-sm text-gray-500 mb-4">
        <span>0 %</span>
        <span>100 %</span>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <XAxis dataKey="day" axisLine={false} tickLine={false} className="text-xs text-gray-500" />
          <YAxis hide />
          <Bar dataKey="performance" fill="#e0e7ff" radius={[4, 4, 4, 4]} />
          <Line
            type="monotone"
            dataKey="line"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ fill: "#10b981", strokeWidth: 2, r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-2 text-center">
        <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
          75%
        </span>
      </div>
    </div>
  )
}
