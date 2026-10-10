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

/**
 * One slug per station. A repeated beach name keeps both pages by appending
 * the station code. The code is also the fallback when a name does not
 * slugify to anything usable.
 */
export function assignSlugs(beaches: { code: string; name: string }[]): Map<string, string> {
  const bases = beaches.map((beach) => {
    const fromName = slugifyName(beach.name);
    return {
      code: beach.code,
      base: fromName.length >= 2 ? fromName : `beach-${slugifyCode(beach.code)}`,
    };
  });
  const counts = new Map<string, number>();
  for (const item of bases) counts.set(item.base, (counts.get(item.base) ?? 0) + 1);

  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const item of bases) {
    const withCode = counts.get(item.base)! > 1 ? `${item.base}-${slugifyCode(item.code)}` : item.base;
    let candidate = withCode.replace(/-+$/g, "").slice(0, 96).replace(/-+$/g, "") || `beach-${slugifyCode(item.code)}`;
    if (used.has(candidate)) candidate = `${candidate}-${slugifyCode(item.code)}`;
    let n = 2;
    while (used.has(candidate)) {
      candidate = `${withCode}-${n}`;
      n += 1;
    }
    used.add(candidate);
    out.set(item.code, candidate);
  }
  return out;
}
