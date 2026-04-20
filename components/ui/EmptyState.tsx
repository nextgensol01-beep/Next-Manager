interface EmptyStateProps { message?: string; description?: string; }
export default function EmptyState({ message = "No data found", description }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-6">
      <div className="w-12 h-12 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-3">
        <svg className="w-6 h-6 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
      </div>
      <p className="font-medium text-default mb-1">{message}</p>
      {description && <p className="text-sm text-muted">{description}</p>}
    </div>
  );
}
