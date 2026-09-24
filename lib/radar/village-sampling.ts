import type { PolygonGeometry, Position } from './geojson-validation.ts';

type SamplingOptions = { minPoints?: number; maxPoints?: number };

const exteriorRings = (geometry: PolygonGeometry): Position[][] => {
  if (geometry.type === 'Polygon') return [(geometry.coordinates as Position[][])[0]];
  return (geometry.coordinates as Position[][][]).map((polygon) => polygon[0]);
};

export function pointInPolygon(point: Position, geometry: PolygonGeometry) {
  const [x, y] = point;
  let inside = false;
  for (const ring of exteriorRings(geometry)) {
    for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
      const [currentX, currentY] = ring[current];
      const [previousX, previousY] = ring[previous];
      if ((currentY > y) !== (previousY > y) &&
          x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function centroid(geometry: PolygonGeometry): Position {
  const points = exteriorRings(geometry).flat();
  let crossSum = 0;
  let xSum = 0;
  let ySum = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const cross = current[0] * next[1] - next[0] * current[1];
    crossSum += cross;
    xSum += (current[0] + next[0]) * cross;
    ySum += (current[1] + next[1]) * cross;
  }
  if (Math.abs(crossSum) < 1e-12) {
    return [
      points.reduce((sum, point) => sum + point[0], 0) / points.length,
      points.reduce((sum, point) => sum + point[1], 0) / points.length,
    ];
  }
  return [xSum / (3 * crossSum), ySum / (3 * crossSum)];
}

const distanceSquared = (left: Position, right: Position) =>
  (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2;

export function generateRepresentativeSamplePoints(
  geometry: PolygonGeometry,
  options: SamplingOptions = {},
): Position[] {
  const minPoints = Math.max(3, options.minPoints ?? 3);
  const maxPoints = Math.max(minPoints, Math.min(20, options.maxPoints ?? 5));
  const rings = exteriorRings(geometry);
  const vertices = rings.flat().filter((point, index, list) => index === 0 || distanceSquared(point, list[index - 1]) > 1e-14);
  if (!vertices.length) return [];
  const xs = vertices.map((point) => point[0]);
  const ys = vertices.map((point) => point[1]);
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  let anchor = centroid(geometry);
  if (!pointInPolygon(anchor, geometry)) {
    const gridCandidates: Position[] = [];
    for (let row = 1; row <= 7; row += 1) {
      for (let column = 1; column <= 7; column += 1) {
        gridCandidates.push([
          bounds.minX + (bounds.maxX - bounds.minX) * column / 8,
          bounds.minY + (bounds.maxY - bounds.minY) * row / 8,
        ]);
      }
    }
    anchor = gridCandidates.find((point) => pointInPolygon(point, geometry)) ?? vertices[0];
  }

  const candidates: Position[] = [anchor];
  const gridRatios: number[][] = [];
  for (let row = 1; row <= 5; row += 1) {
    for (let column = 1; column <= 5; column += 1) gridRatios.push([column / 6, row / 6]);
  }
  for (const [xRatio, yRatio] of gridRatios) {
    const candidate: Position = [
      bounds.minX + (bounds.maxX - bounds.minX) * xRatio,
      bounds.minY + (bounds.maxY - bounds.minY) * yRatio,
    ];
    if (pointInPolygon(candidate, geometry)) candidates.push(candidate);
  }
  for (const vertex of vertices) {
    const candidate: Position = [anchor[0] * 0.7 + vertex[0] * 0.3, anchor[1] * 0.7 + vertex[1] * 0.3];
    if (pointInPolygon(candidate, geometry)) candidates.push(candidate);
  }

  const unique = candidates.filter((point, index, list) =>
    list.findIndex((candidate) => distanceSquared(candidate, point) < 1e-12) === index,
  );
  const selected: Position[] = [unique[0]];
  while (selected.length < maxPoints && selected.length < unique.length) {
    const next = unique
      .filter((point) => !selected.includes(point))
      .sort((left, right) =>
        Math.min(...selected.map((point) => distanceSquared(right, point))) -
        Math.min(...selected.map((point) => distanceSquared(left, point))),
      )[0];
    if (!next) break;
    selected.push(next);
  }
  return selected.length >= minPoints ? selected : unique.slice(0, minPoints);
}
