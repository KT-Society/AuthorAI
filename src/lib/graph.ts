/**
 * Kleines, deterministisches Graph-Layout (keine Abhängigkeit).
 *
 * Knoten liegen auf einem Kreis, sortiert nach Vernetzungsgrad — dadurch sind stark
 * verbundene Figuren gleichmäßig verteilt und der Graph bleibt auch mit vielen Figuren
 * (getestet bis 40) lesbar.
 */

export interface GraphNode {
  id: string;
  name: string;
  x: number;
  y: number;
}

export function layoutCircle<T extends { id: string; name: string }>(
  items: T[],
  width: number,
  height: number,
  padding = 64,
): GraphNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(30, Math.min(width, height) / 2 - padding);
  const count = items.length;

  return items.map((item, index) => {
    const angle = (index / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
    return {
      id: item.id,
      name: item.name,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
}

/** Sortiert Knoten absteigend nach Grad (Anzahl Beziehungen), dann alphabetisch. */
export function sortByDegree<T extends { id: string }>(
  items: T[],
  edges: { fromId: string; toId: string }[],
): T[] {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.fromId, (degree.get(edge.fromId) ?? 0) + 1);
    degree.set(edge.toId, (degree.get(edge.toId) ?? 0) + 1);
  }
  return [...items].sort(
    (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0),
  );
}

/**
 * Kantenpfad als leichte Kurve zur Mitte — gerade Linien überkreuzen sich im Kreis
 * unschön, die Krümmung macht parallele Beziehungen unterscheidbar.
 */
export function edgePath(from: GraphNode, to: GraphNode, curvature = 0.18): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cx = mx - dy * curvature;
  const cy = my + dx * curvature;
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

/** Kantenstärke aus der Intensität (−1 … 1). */
export function edgeWidth(intensity: number): number {
  return 1 + Math.abs(Math.max(-1, Math.min(1, intensity))) * 3;
}

/** Deckkraft aus der Intensität — schwache Beziehungen treten zurück. */
export function edgeOpacity(intensity: number): number {
  return 0.25 + Math.abs(Math.max(-1, Math.min(1, intensity))) * 0.6;
}

/**
 * SVG-Pfad für eine Sparkline über Intensitätswerten (−1 … 1).
 * Dient der Beziehungs-Entwicklung (Arc) in Listen.
 */
export function sparklinePath(
  values: number[],
  width = 72,
  height = 18,
  padding = 1,
): string {
  if (values.length === 0) return "";
  const innerHeight = Math.max(1, height - padding * 2);
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;

  return values
    .map((value, index) => {
      const clamped = Math.max(-1, Math.min(1, value));
      const x = padding + step * index;
      // +1 (zugewandt) liegt oben.
      const y = padding + ((1 - clamped) / 2) * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Mittelwert der „Nulllinie" in einer Sparkline (für die gestrichelte Referenz). */
export function sparklineZeroY(height = 18, padding = 1): number {
  return padding + ((1 - 0) / 2) * Math.max(1, height - padding * 2);
}
