const SUPPORTS_STYLE: Record<string, string> = {
  CLAIMANT: "text-cyan border-cyan",
  RESPONDENT: "text-purple border-purple",
  NEITHER: "text-text-dim border-border-ec-strong",
};

interface AssessedItem {
  id: string;
  supports: string;
  relevance: string;
  source_quality: string;
  duplicate_of?: string;
  reason_code: string;
}

export function EvidenceAssessment({ items }: { items: AssessedItem[] | null }) {
  if (!items) return <p className="text-sm text-text-dim">No assessment recorded yet.</p>;
  return (
    <div>
      <p className="mb-3 text-xs text-text-dim">Validators tolerate bounded judgment differences, but reject opposing support or materially conflicting provenance. Unverified and duplicate sources carry no settlement weight.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.id} className="glass-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="data-mono text-xs text-text-dim">{item.id}</span>
            <span className={`label-sm rounded-sm border px-1.5 py-0.5 ${SUPPORTS_STYLE[item.supports] ?? ""}`}>{item.supports}</span>
          </div>
          <p className="label-sm text-text-dim">Relevance: {item.relevance}</p>
          <p className="label-sm mt-1 text-text-dim">Source quality: {item.source_quality}</p>
          {item.duplicate_of && <p className="mt-1 text-xs text-error">Duplicate content of {item.duplicate_of} · zero weight</p>}
          <p className="label-sm mt-2 text-text-dim">Leader explanation (non-consensus)</p>
          <p className="mt-1 text-sm text-text-dim">{item.reason_code}</p>
        </div>
      ))}
      </div>
    </div>
  );
}
