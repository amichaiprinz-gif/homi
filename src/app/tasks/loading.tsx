import BottomNav from '@/components/BottomNav'

export default function TasksLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-lg mx-auto px-4 pt-7 pb-nav">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
          <div className="h-9 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mb-5">
          {[48, 56, 44, 52].map((w, i) => (
            <div key={i} className={`h-8 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse`} style={{ width: `${w}px` }} />
          ))}
        </div>

        {/* Task card skeletons */}
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-center gap-3 animate-pulse"
            >
              <div className="w-9 h-9 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-4 w-40 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-2" />
                <div className="h-3 w-28 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
              </div>
              <div className="h-3 w-12 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
