import BottomNav from '@/components/BottomNav'

export default function LeaderboardLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-lg mx-auto px-4 pt-7 pb-nav">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="h-8 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-full mb-2 animate-pulse" />
            <div className="h-4 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
          </div>
          <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
        </div>

        {/* Month progress */}
        <div className="mb-6">
          <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden animate-pulse" />
        </div>

        {/* 1st place */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 mb-3 flex items-center gap-4 animate-pulse">
          <div className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="h-5 w-28 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-3" />
            <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full w-full" />
          </div>
          <div className="text-right flex-shrink-0">
            <div className="h-8 w-10 bg-zinc-100 dark:bg-zinc-800 rounded-lg mb-1" />
            <div className="h-3 w-12 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
          </div>
        </div>

        {/* 2nd & 3rd place */}
        {[0, 1].map(i => (
          <div key={i} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 mb-3 flex items-center gap-4 animate-pulse">
            <div className="w-11 h-11 rounded-full bg-zinc-100 dark:bg-zinc-800 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="h-4 w-24 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-2.5" />
              <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full" style={{ width: `${70 - i * 15}%` }} />
            </div>
            <div className="h-7 w-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex-shrink-0" />
          </div>
        ))}
      </div>
      <BottomNav />
    </div>
  )
}
