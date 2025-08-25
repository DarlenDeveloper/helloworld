export default function Loading() {
  return (
    <div className="ml-20 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="flex gap-3">
          <div className="h-10 w-36 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-36 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="h-28 bg-white border border-gray-200 rounded-lg animate-pulse" />
        <div className="h-28 bg-white border border-gray-200 rounded-lg animate-pulse" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="h-10 flex-1 bg-gray-200 rounded animate-pulse" />
        <div className="h-10 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-10 w-48 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-200 rounded animate-pulse mb-2" />
        ))}
      </div>
    </div>
  )
}
