import { Card, CardContent } from "@/components/ui/card"
import { MoreHorizontal } from "lucide-react"

interface MetricCardProps {
  title: string
  value: string
  change: string
  chartType: "bar" | "progress"
  chartColor: "teal" | "blue" | "red"
}

export function MetricCard({ title, value, change, chartType, chartColor }: MetricCardProps) {
  const colorClasses = {
    teal: "bg-teal-500",
    blue: "bg-blue-500",
    red: "bg-red-500",
  }

  return (
    <Card className="bg-white border-gray-200 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-600">{title}</h3>
          <MoreHorizontal className="h-4 w-4 text-gray-400" />
        </div>

        <div className="mb-4">
          <div className="text-2xl font-bold text-black mb-1">{value}</div>
          <div className="text-sm text-teal-600 font-medium">{change}</div>
        </div>

        {chartType === "bar" ? (
          <div className="flex items-end gap-1 h-12">
            {[20, 35, 25, 40, 30, 45, 35, 50, 40, 35, 25].map((height, index) => (
              <div
                key={index}
                className={`${colorClasses[chartColor]} rounded-sm flex-1`}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        ) : (
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className={`h-full ${colorClasses[chartColor]} rounded-full`} style={{ width: "75%" }} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
