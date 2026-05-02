import BottomNav from '@/components/BottomNav'

export default function ShoppingLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-lg mx-auto px-4 pt-7 pb-nav">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
          <div className="flex items-center gap-2">
            <div className="h-8 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
          </div>
        </div>

        {/* Item skeletons */}
        <div className="space-y-2">
          {[80, 56, 72, 48, 64].map((w, i) => (
            <div
              key={i}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3.5 flex items-center gap-3 animate-pulse"
            >
              <div className="w-5 h-5 rounded bg-zinc-100 dark:bg-zinc-800 flex-shrink-0" />
              <div className={`h-4 bg-zinc-100 dark:bg-zinc-800 rounded-full`} style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
