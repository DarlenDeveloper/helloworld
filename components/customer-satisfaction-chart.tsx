"use client"

import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from "recharts"
import { Star } from "lucide-react"

const data = [
  { day: "Sat", satisfaction: 10 },
  { day: "Sun", satisfaction: 20 },
  { day: "Mon", satisfaction: 35 },
  { day: "Tue", satisfaction: 45 },
  { day: "Wed", satisfaction: 55 },
  { day: "Thu", satisfaction: 70 },
  { day: "Fri", satisfaction: 85 },
]

export function CustomerSatisfactionChart() {
  return (
    <div className="h-64">
      <div className="flex justify-between text-sm text-gray-500 mb-4">
        <span>0 %</span>
        <span>100 %</span>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <XAxis dataKey="day" axisLine={false} tickLine={false} className="text-xs text-gray-500" />
          <YAxis hide />
          <Area type="monotone" dataKey="satisfaction" stroke="#10b981" fill="url(#greenGradient)" strokeWidth={2} />
          <defs>
            <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
            </linearGradient>
          </defs>
        </AreaChart>
      </ResponsiveContainer>

      <div className="mt-2 flex items-center justify-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
        ))}
      </div>
    </div>
  )
}
