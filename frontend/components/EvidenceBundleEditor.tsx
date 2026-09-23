"use client";

export interface EvidenceItem {
  kind: "WEB_PAGE" | "ONCHAIN_REF";
  location: string;
  description: string;
}

export function EvidenceBundleEditor({
  items,
  onChange,
  max,
}: {
  items: EvidenceItem[];
  onChange: (items: EvidenceItem[]) => void;
  max: number;
}) {
  function update(index: number, patch: Partial<EvidenceItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function add() {
    if (items.length >= max) return;
    onChange([...items, { kind: "WEB_PAGE", location: "", description: "" }]);
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="glass-card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <select
              value={item.kind}
              onChange={(e) => update(i, { kind: e.target.value as EvidenceItem["kind"] })}
              className="label-sm rounded border border-border-ec bg-navy-elevated px-2 py-1 text-text-ec"
            >
              <option value="WEB_PAGE">Web page</option>
              <option value="ONCHAIN_REF">On-chain reference</option>
            </select>
            <button type="button" onClick={() => remove(i)} className="text-sm text-error hover:underline">
              Remove
            </button>
          </div>
          <input
            value={item.location}
            onChange={(e) => update(i, { location: e.target.value })}
            placeholder={item.kind === "WEB_PAGE" ? "https://... (must be a public https URL)" : "chain:contract:tx reference"}
            className="data-mono w-full rounded border border-border-ec bg-navy-elevated px-3 py-2 text-sm text-text-ec placeholder:text-text-dim/60"
          />
          <textarea
            value={item.description}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="What does this item show, and why does it matter to the claim? (8-600 characters)"
            rows={2}
            className="w-full rounded border border-border-ec bg-navy-elevated px-3 py-2 text-sm text-text-ec placeholder:text-text-dim/60"
          />
        </div>
      ))}
      {items.length < max && (
        <button
          type="button"
          onClick={add}
          className="w-full rounded border border-dashed border-border-ec-strong py-3 text-sm text-text-dim transition hover:border-cyan hover:text-cyan"
        >
          + Add evidence item ({items.length}/{max})
        </button>
      )}
    </div>
  );
}
