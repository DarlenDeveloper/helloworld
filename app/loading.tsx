export default function Loading() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar skeleton */}
      <div className="w-16 bg-gray-50 border-r border-gray-100 p-2 space-y-2 hidden sm:block">
        <div className="h-10 bg-gray-200 rounded animate-pulse" />
        <div className="h-10 bg-gray-200 rounded animate-pulse" />
        <div className="h-10 bg-gray-200 rounded animate-pulse" />
        <div className="h-10 bg-gray-200 rounded animate-pulse" />
        <div className="h-10 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />

        {/* Metric cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-4" />
              <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
              <div className="mt-3 h-2 bg-gray-100 rounded">
                <div className="h-2 bg-gray-200 rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>

        {/* Charts section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="h-6 w-40 bg-gray-200 rounded animate-pulse mb-4" />
            <div className="h-64 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="h-6 w-52 bg-gray-200 rounded animate-pulse mb-4" />
            <div className="h-64 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>

        {/* Table */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
