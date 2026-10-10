/** A shareable path segment for a beach name. Empty when the name has no letters or digits. */
export function slugifyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Station codes can be the whole name ("0", "Francis State Beach"). */
export function slugifyCode(code: string): string {
  const slug = code
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "station";
}

export interface SlugBeach {
  code: string;
  name: string;
  county?: string | null;
  agency?: string | null;
}

/**
 * Path segment for one beach. A station code is not an address: the same code
 * is used by more than one agency. When the file has an agency column and this
 * beach names an agency, the slug is the code plus that agency. Otherwise it
 * is the name, the county, and the code.
 */
export function beachSlugBase(beach: SlugBeach, agencyColumn: boolean): string {
  const code = slugifyCode(beach.code);
  if (agencyColumn && beach.agency?.trim()) {
    const agency = slugifyName(beach.agency);
    if (agency) return `${code}-${agency}`;
  }
  const name = slugifyName(beach.name);
  const county = slugifyName(beach.county ?? "");
  if (!name && !county) return `beach-${code}`;
  return [name, county, code].filter((part) => part.length > 0).join("-");
}

/** One slug per beach, in the same order as the input. A collision gets `-2`, `-3`, and so on. */
export function assignSlugs(beaches: SlugBeach[], agencyColumn = false): string[] {
  const used = new Set<string>();
  return beaches.map((beach) => {
    const base = beachSlugBase(beach, agencyColumn).replace(/-+$/g, "").slice(0, 96).replace(/-+$/g, "") || "beach";
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
      const suffix = `-${n}`;
      candidate = `${base.slice(0, Math.max(1, 96 - suffix.length)).replace(/-+$/g, "")}${suffix}`;
      n += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

export interface SlugIdentity {
  slug: string;
  code: string;
  name: string;
}

/**
 * Canonical slug, then a name-only slug when exactly one beach still uses that
 * older path, then a station code when exactly one beach has it. A repeated
 * code does not resolve.
 */
export function resolveSlugMatch<T extends SlugIdentity>(beaches: T[], requested: string): T | null {
  const exact = beaches.find((beach) => beach.slug === requested);
  if (exact) return exact;
  const legacy = beaches.filter((beach) => slugifyName(beach.name) === requested && requested.length > 0);
  if (legacy.length === 1) return legacy[0]!;
  const exactCode = beaches.filter((beach) => beach.code === requested);
  if (exactCode.length === 1) return exactCode[0]!;
  const folded = beaches.filter((beach) => beach.code.toLowerCase() === requested.toLowerCase());
  if (folded.length === 1) return folded[0]!;
  return null;
}
