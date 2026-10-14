export default function TrackerPageLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading tracker">
      <span className="sr-only">Loading tracker…</span>
      <div className="h-8 w-48 rounded-lg bg-surface animate-pulse motion-reduce:animate-none" />
      <div className="rounded-2xl border border-base bg-card p-5">
        <div className="mb-6 h-10 w-64 max-w-full rounded-lg bg-surface animate-pulse motion-reduce:animate-none" />
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="flex gap-6 border-t border-base py-5">
            <div className="h-5 w-1/3 rounded bg-surface animate-pulse motion-reduce:animate-none" />
            <div className="h-5 w-1/5 rounded bg-surface animate-pulse motion-reduce:animate-none" />
            <div className="h-5 w-1/5 rounded bg-surface animate-pulse motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  );
}
