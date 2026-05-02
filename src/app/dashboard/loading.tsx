import BottomNav from '@/components/BottomNav'

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-lg mx-auto px-4 pt-7 pb-nav">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-full mb-2 animate-pulse" />
            <div className="h-7 w-40 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
          </div>
          <div className="w-10 h-10 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2.5 mb-7">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 border-t-2 border-t-zinc-200 dark:border-t-zinc-700 rounded-xl p-3.5 text-center animate-pulse"
            >
              <div className="h-7 w-7 mx-auto bg-zinc-100 dark:bg-zinc-800 rounded-lg mb-1.5" />
              <div className="h-2.5 w-10 mx-auto bg-zinc-100 dark:bg-zinc-800 rounded-full" />
            </div>
          ))}
        </div>

        {/* Section label */}
        <div className="h-2.5 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-full mb-3 animate-pulse" />

        {/* Task card skeletons */}
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 border-r-4 border-r-zinc-200 dark:border-r-zinc-700 rounded-xl p-4 flex items-center gap-3 animate-pulse"
            >
              <div className="w-9 h-9 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-4 w-36 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-2" />
                <div className="h-3 w-24 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
              </div>
              <div className="w-8 h-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
