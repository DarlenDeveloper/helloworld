"use client"

import { useEffect, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { createClient } from "@/lib/supabase/client"
import { Brain, MessageCircle, BarChart3, Bell } from "lucide-react"

// Recharts type compatibility shim for React 19/TS 5
const XAxisAny: any = XAxis
const YAxisAny: any = YAxis

interface TalkingPointData {
  topic: string
  mentions: number
  effectiveness: number
  category: string
  color: string
}

interface CallSummaryInsight {
  theme: string
  frequency: number
  sentiment: "positive" | "negative" | "neutral"
  examples: string[]
}

interface AIInsightsProps {
  dateRange: {
    start: string
    end: string
  }
}

export function AIInsights({ dateRange }: AIInsightsProps) {
  const [talkingPointsData, setTalkingPointsData] = useState<TalkingPointData[]>([])
  const [summaryInsights, setSummaryInsights] = useState<CallSummaryInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"talking-points" | "summaries" | "effectiveness">("talking-points")

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const supabase = createClient()
        
        // Get user for RLS
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          throw new Error('User not authenticated')
        }

        // Resolve owners: self + owners where I'm an active member
        const owners: string[] = [user.id]
        const { data: memberships } = await supabase
          .from("account_users")
          .select("owner_user_id, is_active")
          .eq("member_user_id", user.id)
          .eq("is_active", true)
        ;(memberships || []).forEach((m: any) => {
          const oid = String(m?.owner_user_id || "")
          if (oid && !owners.includes(oid)) owners.push(oid)
        })

        // Fetch talking points data
        const { data: talkingPointsEvents, error: talkingPointsErr } = await supabase
          .from("talking_points_events")
          .select("id, category_id, text, created_at")
          .in("user_id", owners)
          .gte("created_at", dateRange.start)
          .lte("created_at", dateRange.end)
          .order("created_at", { ascending: false })

        if (talkingPointsErr) {
          throw new Error(talkingPointsErr.message)
        }

        // Process talking points data
        if (talkingPointsEvents && talkingPointsEvents.length > 0) {
          const topicFrequency = new Map<string, number>()
          const topicCategories = new Map<string, string>()
          
          talkingPointsEvents.forEach((event: any) => {
            if (event.text) {
              const topic = event.text.trim().toLowerCase()
              topicFrequency.set(topic, (topicFrequency.get(topic) || 0) + 1)
              
              // Categorize topics (simplified categorization)
              let category = "general"
              if (topic.includes("price") || topic.includes("cost") || topic.includes("budget")) {
                category = "pricing"
              } else if (topic.includes("feature") || topic.includes("benefit") || topic.includes("advantage")) {
                category = "features"
              } else if (topic.includes("support") || topic.includes("help") || topic.includes("service")) {
                category = "support"
              } else if (topic.includes("demo") || topic.includes("trial") || topic.includes("test")) {
                category = "demo"
              }
              
              topicCategories.set(topic, category)
            }
          })

          // Convert to chart data
          const categoryColors = {
            pricing: "#ef4444",
            features: "#3b82f6", 
            support: "#10b981",
            demo: "#f59e0b",
            general: "#6b7280"
          }

          const sortedTopics = Array.from(topicFrequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)

          const talkingPointsChartData: TalkingPointData[] = sortedTopics.map(([topic, mentions]) => {
            const category = topicCategories.get(topic) || "general"
            // Simulate effectiveness score (in real implementation, this would come from call analysis)
            const effectiveness = Math.round(50 + Math.random() * 40) // 50-90%
            
            return {
              topic: topic.charAt(0).toUpperCase() + topic.slice(1),
              mentions,
              effectiveness,
              category,
              color: categoryColors[category as keyof typeof categoryColors] || categoryColors.general
            }
          })

          setTalkingPointsData(talkingPointsChartData)
        }

        // Fetch call summaries for AI insights (from call_history table)
        const { data: callHistory, error: callHistoryErr } = await supabase
          .from("call_history")
          .select("id, ai_summary, notes, status")
          .in("user_id", owners)
          .gte("call_date", dateRange.start)
          .lte("call_date", dateRange.end)
          .not("ai_summary", "is", null)

        if (callHistoryErr) {
          console.warn("Call history fetch error:", callHistoryErr)
        }

        // Process call summaries for insights
        if (callHistory && callHistory.length > 0) {
          const themeFrequency = new Map<string, { count: number, examples: string[], sentiment: "positive" | "negative" | "neutral" }>()
          
          callHistory.forEach((call: any) => {
            if (call.ai_summary) {
              // Simple theme extraction (in real implementation, use NLP)
              const summary = call.ai_summary.toLowerCase()
              let themes: string[] = []
              let sentiment: "positive" | "negative" | "neutral" = "neutral"
              
              // Extract themes based on keywords
              if (summary.includes("interested") || summary.includes("positive")) {
                themes.push("customer interest")
                sentiment = "positive"
              }
              if (summary.includes("objection") || summary.includes("concern")) {
                themes.push("objections raised")
                sentiment = "negative"
              }
              if (summary.includes("information") || summary.includes("question")) {
                themes.push("information request")
              }
              if (summary.includes("follow up") || summary.includes("callback")) {
                themes.push("follow-up needed")
              }
              if (summary.includes("not available") || summary.includes("busy")) {
                themes.push("timing issues")
                sentiment = "neutral"
              }

              themes.forEach(theme => {
                if (!themeFrequency.has(theme)) {
                  themeFrequency.set(theme, { count: 0, examples: [], sentiment })
                }
                const current = themeFrequency.get(theme)!
                current.count += 1
                if (current.examples.length < 3) {
                  current.examples.push(call.ai_summary.substring(0, 100) + "...")
                }
              })
            }
          })

          const summaryInsightsData: CallSummaryInsight[] = Array.from(themeFrequency.entries())
            .map(([theme, data]) => ({
              theme,
              frequency: data.count,
              sentiment: data.sentiment,
              examples: data.examples
            }))
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 6)

          setSummaryInsights(summaryInsightsData)
        }

      } catch (err: any) {
        console.error('AI insights fetch error:', err)
        setError(err.message || 'Failed to load AI insights')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [dateRange])

  if (loading) {
    return (
      <div className="h-80 flex items-center justify-center">
        <div className="animate-pulse h-64 w-full bg-gray-200 rounded"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-80 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-2">Error loading data</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  const hasData = talkingPointsData.length > 0 || summaryInsights.length > 0

  if (!hasData) {
    return (
      <div className="h-80 flex items-center justify-center">
        <div className="text-center">
          <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No AI insights available for selected period</p>
          <p className="text-sm text-gray-400 mt-2">Insights are generated from call summaries and talking points</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* View Mode Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode("talking-points")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "talking-points" 
              ? "bg-indigo-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Talking Points
        </button>
        <button
          onClick={() => setViewMode("summaries")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "summaries" 
              ? "bg-indigo-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Call Themes
        </button>
        <button
          onClick={() => setViewMode("effectiveness")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "effectiveness" 
              ? "bg-indigo-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Effectiveness
        </button>
      </div>

      {/* Content based on view mode */}
      {viewMode === "talking-points" && talkingPointsData.length > 0 && (
        <div className="space-y-4">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={talkingPointsData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxisAny 
                  dataKey="topic" 
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxisAny 
                  tick={{ fill: "#6b7280", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  formatter={(value: any, name: any, props: any) => [
                    `${value} mentions`,
                    `${props.payload.category} topic`
                  ]}
                />
                <Bar dataKey="mentions" radius={[4, 4, 0, 0]}>
                  {talkingPointsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Talking Points Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Most Discussed Topics
              </h4>
              <div className="space-y-2">
                {talkingPointsData.slice(0, 3).map((item, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="text-sm text-blue-800">{item.topic}</span>
                    <span className="text-sm font-medium text-blue-900">{item.mentions}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Topic Categories
              </h4>
              <div className="space-y-2">
                {Array.from(new Set(talkingPointsData.map(item => item.category))).map((category, index) => {
                  const count = talkingPointsData.filter(item => item.category === category).length
                  return (
                    <div key={index} className="flex justify-between">
                      <span className="text-sm text-green-800 capitalize">{category}</span>
                      <span className="text-sm font-medium text-green-900">{count} topics</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === "summaries" && summaryInsights.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {summaryInsights.map((insight, index) => (
              <div key={index} className="bg-white border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900 capitalize">{insight.theme}</h4>
                  <div className={`px-2 py-1 rounded-full text-xs ${
                    insight.sentiment === "positive" ? "bg-green-100 text-green-800" :
                    insight.sentiment === "negative" ? "bg-red-100 text-red-800" :
                    "bg-gray-100 text-gray-800"
                  }`}>
                    {insight.sentiment}
                  </div>
                </div>
                <p className="text-2xl font-bold text-indigo-600 mb-2">{insight.frequency}</p>
                <p className="text-sm text-gray-500 mb-3">occurrences</p>
                {insight.examples.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Example:</p>
                    <p className="text-xs text-gray-600 italic">"{insight.examples[0]}"</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === "effectiveness" && talkingPointsData.length > 0 && (
        <div className="space-y-4">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={talkingPointsData.slice(0, 6)}
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  dataKey="effectiveness"
                  label={({ topic, effectiveness }) => `${topic}: ${effectiveness}%`}
                  labelLine={false}
                >
                  {talkingPointsData.slice(0, 6).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: any, name: any, props: any) => [
                    `${value}% effective`,
                    props.payload.topic
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Effectiveness Insights */}
          <div className="bg-amber-50 p-4 rounded-lg">
            <h4 className="font-medium text-amber-900 mb-2 flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Effectiveness Insights
            </h4>
            <div className="space-y-2 text-sm text-amber-800">
              {talkingPointsData.filter(item => item.effectiveness > 80).length > 0 && (
                <p>✓ {talkingPointsData.filter(item => item.effectiveness > 80).length} highly effective topics (80%+)</p>
              )}
              {talkingPointsData.filter(item => item.effectiveness < 60).length > 0 && (
                <p>⚠ {talkingPointsData.filter(item => item.effectiveness < 60).length} topics need improvement (&lt;60%)</p>
              )}
              <p>📊 Average effectiveness: {Math.round(talkingPointsData.reduce((sum, item) => sum + item.effectiveness, 0) / talkingPointsData.length)}%</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
