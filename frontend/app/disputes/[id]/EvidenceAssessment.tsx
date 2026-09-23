const SUPPORTS_STYLE: Record<string, string> = {
  CLAIMANT: "text-cyan border-cyan",
  RESPONDENT: "text-purple border-purple",
  NEITHER: "text-text-dim border-border-ec-strong",
};

interface AssessedItem {
  id: string;
  supports: string;
  relevance: string;
  reason_code: string;
}

export function EvidenceAssessment({ items }: { items: AssessedItem[] | null }) {
  if (!items) return <p className="text-sm text-text-dim">No assessment recorded yet.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.id} className="glass-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="data-mono text-xs text-text-dim">{item.id}</span>
            <span className={`label-sm rounded-sm border px-1.5 py-0.5 ${SUPPORTS_STYLE[item.supports] ?? ""}`}>{item.supports}</span>
          </div>
          <p className="label-sm text-text-dim">Relevance: {item.relevance}</p>
          <p className="mt-1 text-sm text-text-dim">{item.reason_code}</p>
        </div>
      ))}
    </div>
  );
}
