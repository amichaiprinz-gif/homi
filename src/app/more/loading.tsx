import BottomNav from '@/components/BottomNav'

export default function MoreLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-lg mx-auto px-4 pt-7 pb-nav">
        <div className="h-8 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-full mb-6 animate-pulse" />

        <div className="h-3 w-12 bg-zinc-200 dark:bg-zinc-800 rounded-full mb-3 animate-pulse" />

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 px-4 py-4 animate-pulse">
              <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-4 w-20 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-2" />
                <div className="h-3 w-32 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
              </div>
              <div className="w-4 h-4 bg-zinc-100 dark:bg-zinc-800 rounded flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
