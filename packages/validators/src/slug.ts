const MAX_SLUG_LENGTH = 80;

/** URL-safe slug from a title: lower-case ASCII letters, digits and single hyphens. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug || "item";
}

/** The first of `base`, `base-2`, `base-3`... that `isTaken` does not report as used. */
export async function uniqueSlug(base: string, isTaken: (slug: string) => Promise<boolean>): Promise<string> {
  let candidate = base;
  for (let n = 2; await isTaken(candidate); n++) {
    const suffix = `-${n}`;
    candidate = base.slice(0, MAX_SLUG_LENGTH - suffix.length) + suffix;
  }
  return candidate;
}
