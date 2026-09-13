/**
 * Wort-Diff ohne Abhängigkeit — Basis für den Versions-Vergleich und die Korrektur-Vorschau.
 *
 * Verfahren: Präfix und Suffix werden getrimmt (der Normalfall ist eine kleine lokale Änderung);
 * nur der geänderte Mittelteil läuft durch ein LCS-Diff. Ist der Mittelteil zu groß für das
 * LCS-Feld, wird er grob als „entfernt + hinzugefügt" ausgegeben — das bleibt korrekt, nur
 * gröber, und verhindert Pathologie-Kosten bei sehr unterschiedlichen Texten.
 */

export type DiffOp = "same" | "add" | "remove";

export interface DiffPart {
  op: DiffOp;
  /** Wort-Token inklusive führendem Leerraum (beim Zusammensetzen bleibt die Formatierung). */
  text: string;
}

export interface DiffStats {
  added: number;
  removed: number;
}

/** Obergrenze für das LCS-Feld (Zeilen × Spalten). Darüber grober Block-Diff. */
const LCS_LIMIT = 1_000_000;

function tokenize(text: string): string[] {
  // Führender Leerraum gehört zum Token (nicht der nachfolgende): so gilt „drei" == „drei "
  // und ein unverändertes Wort wird nicht nur wegen eines folgenden Wortes als geändert gezählt.
  return text.match(/\s*\S+/g) ?? [];
}

function push(parts: DiffPart[], op: DiffOp, text: string): void {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last && last.op === op) last.text += text;
  else parts.push({ op, text });
}

function diffMiddle(a: string[], b: string[], parts: DiffPart[]): void {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] =
        a[i] === b[j]
          ? (dp[(i + 1) * width + (j + 1)] as number) + 1
          : Math.max(dp[(i + 1) * width + j] as number, dp[i * width + (j + 1)] as number);
    }
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(parts, "same", a[i] as string);
      i += 1;
      j += 1;
    } else if ((dp[(i + 1) * width + j] as number) >= (dp[i * width + (j + 1)] as number)) {
      push(parts, "remove", a[i] as string);
      i += 1;
    } else {
      push(parts, "add", b[j] as string);
      j += 1;
    }
  }
  while (i < n) {
    push(parts, "remove", a[i] as string);
    i += 1;
  }
  while (j < m) {
    push(parts, "add", b[j] as string);
    j += 1;
  }
}

/** Wort-Diff zwischen zwei Fassungen (gleiche Abschnitte werden zusammengefasst). */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const parts: DiffPart[] = [];

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  push(parts, "same", a.slice(0, start).join(""));

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length === 0) {
    push(parts, "add", midB.join(""));
  } else if (midB.length === 0) {
    push(parts, "remove", midA.join(""));
  } else if (midA.length * midB.length > LCS_LIMIT) {
    push(parts, "remove", midA.join(""));
    push(parts, "add", midB.join(""));
  } else {
    diffMiddle(midA, midB, parts);
  }

  push(parts, "same", a.slice(endA).join(""));
  return parts;
}

/** Wortzahlen der Änderungen (für die Bilanz „+n / −m Wörter"). */
export function diffStats(parts: DiffPart[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const part of parts) {
    const trimmed = part.text.trim();
    if (trimmed.length === 0) continue;
    const count = trimmed.split(/\s+/).length;
    if (part.op === "add") added += count;
    else if (part.op === "remove") removed += count;
  }
  return { added, removed };
}
