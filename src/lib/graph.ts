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
