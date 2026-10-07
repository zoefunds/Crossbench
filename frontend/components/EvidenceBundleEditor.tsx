"use client";

export interface EvidenceItem {
  kind: "WEB_PAGE" | "ONCHAIN_REF";
  location: string;
  description: string;
  chain_id?: string;
  reference_type?: "BLOCK" | "TRANSACTION" | "CONTRACT" | "ACCOUNT";
  reference_value?: string;
}

const BLOCKED_SOURCE_HOSTS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
  "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "tiny.cc", "pastebin.com",
  "paste.ee", "hastebin.com", "ghostbin.com",
]);

function isInternalIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
  const [a, b] = parts.map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isInternalIpv6(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(":")) return false;
  return host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || /^fe[89ab]/.test(host);
}

export function isValidPublicSourceUrl(value: string): boolean {
  if (value.length < 8 || value.length > 800) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !!hostname &&
      hostname !== "localhost" &&
      !hostname.endsWith(".local") &&
      ![...BLOCKED_SOURCE_HOSTS].some((blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`)) &&
      !isInternalIpv4(hostname) &&
      !isInternalIpv6(hostname)
    );
  } catch {
    return false;
  }
}

export function canonicalEvidenceUrl(value: string): string | null {
  if (!isValidPublicSourceUrl(value)) return null;
  const url = new URL(value);
  const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "") || "/";
  return `https://${url.hostname.toLowerCase()}${url.port && url.port !== "443" ? `:${url.port}` : ""}${path}${url.search}`;
}

export function hasDuplicateEvidenceLocations(items: EvidenceItem[]): boolean {
  const locations = items.map((item) => canonicalEvidenceUrl(item.location));
  const ledgerRefs = items.map((item) => item.kind === "ONCHAIN_REF"
    ? `${item.chain_id?.trim().toLowerCase()}:${item.reference_type}:${item.reference_value?.trim().toLowerCase()}`
    : null);
  return locations.some((location, index) => location !== null && locations.indexOf(location) !== index) ||
    ledgerRefs.some((reference, index) => reference !== null && ledgerRefs.indexOf(reference) !== index);
}

export function isValidEvidenceItem(item: EvidenceItem): boolean {
  const descriptionLength = item.description.trim().length;
  const ledgerIdentityValid = item.kind === "WEB_PAGE" || (
    !!item.chain_id?.trim().match(/^[A-Za-z0-9._:/-]{1,64}$/) &&
    !!item.reference_type &&
    !!item.reference_value?.trim().match(/^[A-Za-z0-9._:/-]{2,200}$/)
  );
  return isValidPublicSourceUrl(item.location) && descriptionLength >= 8 && descriptionLength <= 600 && ledgerIdentityValid;
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
              onChange={(e) => update(i, e.target.value === "ONCHAIN_REF"
                ? { kind: "ONCHAIN_REF", chain_id: "eip155:1", reference_type: "TRANSACTION", reference_value: "" }
                : { kind: "WEB_PAGE", chain_id: undefined, reference_type: undefined, reference_value: undefined })}
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
            placeholder={item.kind === "WEB_PAGE" ? "https://... (public source URL)" : "https://explorer.../tx/... (public explorer/API URL)"}
            maxLength={800}
            className="data-mono w-full rounded border border-border-ec bg-navy-elevated px-3 py-2 text-sm text-text-ec placeholder:text-text-dim/60"
          />
          {item.location.length > 0 && !item.location.startsWith("https://") && (
            <p className="text-xs text-error">Every validator must be able to fetch this source independently, so a public HTTPS URL is required.</p>
          )}
          {item.kind === "ONCHAIN_REF" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={item.chain_id ?? ""}
                onChange={(e) => update(i, { chain_id: e.target.value })}
                placeholder="Chain ID, e.g. eip155:1"
                maxLength={64}
                className="data-mono rounded border border-border-ec bg-navy-elevated px-3 py-2 text-sm text-text-ec"
              />
              <select
                value={item.reference_type ?? "TRANSACTION"}
                onChange={(e) => update(i, { reference_type: e.target.value as EvidenceItem["reference_type"] })}
                className="rounded border border-border-ec bg-navy-elevated px-3 py-2 text-sm text-text-ec"
              >
                <option value="BLOCK">Block</option>
                <option value="TRANSACTION">Transaction</option>
                <option value="CONTRACT">Contract</option>
                <option value="ACCOUNT">Account</option>
              </select>
              <input
                value={item.reference_value ?? ""}
                onChange={(e) => update(i, { reference_value: e.target.value })}
                placeholder="Hash, height, or address"
                maxLength={200}
                className="data-mono rounded border border-border-ec bg-navy-elevated px-3 py-2 text-sm text-text-ec"
              />
            </div>
          )}
          <textarea
            value={item.description}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="What does this item show, and why does it matter to the claim? (8-600 characters)"
            rows={2}
            maxLength={600}
            className="w-full rounded border border-border-ec bg-navy-elevated px-3 py-2 text-sm text-text-ec placeholder:text-text-dim/60"
          />
        </div>
      ))}
      {hasDuplicateEvidenceLocations(items) && (
        <p className="text-xs text-error">Duplicate source URLs or identical on-chain objects are not allowed, even when different explorers are used.</p>
      )}
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
