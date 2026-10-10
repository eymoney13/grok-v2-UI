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
  /** Pipeline id. When this cell is filled, it is the path. */
  stationKey?: string | null;
}

/**
 * The `agency|station_code` key, without a raw pipe.
 * `Orange County|0` becomes `orange-county~0`. A key with no pipe is slugified as one piece.
 */
export function encodeStationKey(stationKey: string): string {
  const pipe = stationKey.indexOf("|");
  if (pipe === -1) {
    return slugifyStationKey(stationKey) || "station";
  }
  const agency = slugifyName(stationKey.slice(0, pipe)) || "agency";
  const code = slugifyCode(stationKey.slice(pipe + 1));
  return `${agency}~${code}`;
}

/** A published station_key with the pipe and other punctuation turned into hyphens. */
export function slugifyStationKey(stationKey: string): string {
  return stationKey
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
    .replace(/-+$/g, "");
}

/**
 * Path segment for one beach. A filled `station_key` becomes the beach-name
 * slug, then `--`, then the encoded key (`orange-county~0`). The encoded key
 * is what resolves back to `agency|station_code`. Otherwise a station code is
 * not an address: the same code is used by more than one agency. When the file
 * has an agency column and this beach names an agency, the slug is the code
 * plus that agency. Otherwise it is the name, the county, and the code.
 */
export function beachSlugBase(beach: SlugBeach, agencyColumn: boolean): string {
  const rawKey = beach.stationKey?.trim();
  if (rawKey) {
    const encoded = encodeStationKey(rawKey);
    const name = (slugifyName(beach.name) || "beach").slice(0, 80).replace(/-+$/g, "");
    return `${name}--${encoded}`;
  }
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

/** Keep a name--key slug's encoded key intact. Other slugs stay within 96 characters. */
function fitSlug(base: string): string {
  const marker = base.indexOf("--");
  if (marker === -1) {
    return base.replace(/-+$/g, "").slice(0, 96).replace(/-+$/g, "") || "beach";
  }
  const encoded = base.slice(marker);
  const name = base.slice(0, marker).replace(/-+$/g, "").slice(0, 80).replace(/-+$/g, "") || "beach";
  return `${name}${encoded}`;
}

/** One slug per beach, in the same order as the input. A collision gets `-2`, `-3`, and so on. */
export function assignSlugs(beaches: SlugBeach[], agencyColumn = false): string[] {
  const used = new Set<string>();
  return beaches.map((beach) => {
    const base = fitSlug(beachSlugBase(beach, agencyColumn));
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${n}`;
      n += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

/** The encoded key at the end of a `name--key` path, or the path itself when it is only the key. */
function encodedKeyInPath(requested: string): string | null {
  if (!requested.includes("--") && !requested.includes("~")) return null;
  const marker = requested.indexOf("--");
  const key = marker === -1 ? requested : requested.slice(marker + 2);
  return key || null;
}

export interface SlugIdentity {
  slug: string;
  code: string;
  name: string;
  stationKey?: string | null;
}

/**
 * Canonical slug, then the encoded key (with or without an old name prefix),
 * then the raw `agency|station_code` value, then a name-only slug when exactly
 * one beach still uses that older path, then a station code when exactly one
 * beach has it. A repeated code does not resolve.
 */
export function resolveSlugMatch<T extends SlugIdentity>(beaches: T[], requested: string): T | null {
  const exact = beaches.find((beach) => beach.slug === requested);
  if (exact) return exact;
  const encodedWanted = encodedKeyInPath(requested);
  if (encodedWanted) {
    const byEncoded = beaches.filter((beach) => beach.stationKey && encodeStationKey(beach.stationKey) === encodedWanted);
    if (byEncoded.length === 1) return byEncoded[0]!;
    const bySuffix = beaches.filter((beach) => {
      const marker = beach.slug.indexOf("--");
      return marker !== -1 && beach.slug.slice(marker + 2) === encodedWanted;
    });
    if (bySuffix.length === 1) return bySuffix[0]!;
  }
  const exactKey = beaches.filter((beach) => beach.stationKey === requested);
  if (exactKey.length === 1) return exactKey[0]!;
  const foldedKey = beaches.filter((beach) => beach.stationKey?.toLowerCase() === requested.toLowerCase());
  if (foldedKey.length === 1) return foldedKey[0]!;
  const legacy = beaches.filter((beach) => slugifyName(beach.name) === requested && requested.length > 0);
  if (legacy.length === 1) return legacy[0]!;
  const exactCode = beaches.filter((beach) => beach.code === requested);
  if (exactCode.length === 1) return exactCode[0]!;
  const folded = beaches.filter((beach) => beach.code.toLowerCase() === requested.toLowerCase());
  if (folded.length === 1) return folded[0]!;
  return null;
}
