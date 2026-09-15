/** URL-/Datei-tauglicher Slug aus einem Titel (auch für Buch-IDs). */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[äöüß]/g, (char) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[char] ?? char)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "buch"
  );
}