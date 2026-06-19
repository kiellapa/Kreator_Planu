import type { Rectangle } from '../types';

export type Point = { x: number; y: number; };
export type Segment = { x1: number; y1: number; x2: number; y2: number };

// --- Geometry Helper Functions for Path Generation ---

const mergeIntervals = (intervals: [number, number][]): [number, number][] => {
  if (intervals.length === 0) return [];
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    const current = intervals[i];
    if (current[0] <= last[1]) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push(current);
    }
  }
  return merged;
};

const subtractSingleInterval = (a: [number, number], b: [number, number]): [number, number][] => {
  const [a1, a2] = a;
  const [b1, b2] = b;
  if (a2 <= b1 || a1 >= b2) return [[a1, a2]];
  if (a1 >= b1 && a2 <= b2) return [];
  if (a1 < b1 && a2 > b2) return [[a1, b1], [b2, a2]];
  if (a1 < b1 && a2 <= b2) return [[a1, b1]];
  if (a1 >= b1 && a2 > b2) return [[b2, a2]];
  return [];
};

const subtractIntervals = (intervalsA: [number, number][], intervalsB: [number, number][]): [number, number][] => {
  const mergedA = mergeIntervals(intervalsA);
  const mergedB = mergeIntervals(intervalsB);
  let result: [number, number][] = mergedA;
  for (const b of mergedB) {
    result = result.flatMap(a => subtractSingleInterval(a, b));
  }
  return result;
};

export const getBoundarySegments = (parts: Rectangle[]): Segment[] => {
  if (parts.length === 0) return [];

  const hSegments: Map<number, { tops: [number, number][]; bottoms: [number, number][] }> = new Map();
  const vSegments: Map<number, { lefts: [number, number][]; rights: [number, number][] }> = new Map();

  for (const part of parts) {
    if (!hSegments.has(part.y)) hSegments.set(part.y, { tops: [], bottoms: [] });
    hSegments.get(part.y)!.tops.push([part.x, part.x + part.width]);
    if (!hSegments.has(part.y + part.height)) hSegments.set(part.y + part.height, { tops: [], bottoms: [] });
    hSegments.get(part.y + part.height)!.bottoms.push([part.x, part.x + part.width]);

    if (!vSegments.has(part.x)) vSegments.set(part.x, { lefts: [], rights: [] });
    vSegments.get(part.x)!.lefts.push([part.y, part.y + part.height]);
    if (!vSegments.has(part.x + part.width)) vSegments.set(part.x + part.width, { lefts: [], rights: [] });
    vSegments.get(part.x + part.width)!.rights.push([part.y, part.y + part.height]);
  }

  const boundarySegments: Segment[] = [];
  for (const [y, { tops, bottoms }] of hSegments.entries()) {
    subtractIntervals(tops, bottoms).forEach(([x1, x2]) => boundarySegments.push({ x1, y1: y, x2, y2: y }));
    subtractIntervals(bottoms, tops).forEach(([x1, x2]) => boundarySegments.push({ x1: x2, y1: y, x2: x1, y2: y }));
  }
  for (const [x, { lefts, rights }] of vSegments.entries()) {
    subtractIntervals(lefts, rights).forEach(([y1, y2]) => boundarySegments.push({ x1: x, y1: y2, x2: x, y2: y1 }));
    subtractIntervals(rights, lefts).forEach(([y1, y2]) => boundarySegments.push({ x1: x, y1, x2: x, y2 }));
  }

  return boundarySegments;
}

export const orderSegmentsIntoPolygons = (segments: Segment[]): Point[][] => {
  if (segments.length === 0) return [];

  const endpoints = new Map<string, Segment>();
  for (const seg of segments) {
    endpoints.set(`${seg.x1},${seg.y1}`, seg);
  }

  const polygons: Point[][] = [];
  while (endpoints.size > 0) {
    const [startKey, startSeg] = endpoints.entries().next().value;
    endpoints.delete(startKey);
    
    const currentPolygon: Point[] = [{ x: startSeg.x1, y: startSeg.y1 }];
    let currentSeg = startSeg;

    while (true) {
      currentPolygon.push({ x: currentSeg.x2, y: currentSeg.y2 });
      const nextKey = `${currentSeg.x2},${currentSeg.y2}`;
      
      if (nextKey === startKey) {
        currentPolygon.pop(); // Remove duplicate end point
        break;
      }
      
      const nextSeg = endpoints.get(nextKey);
      if (!nextSeg) {
        // This can happen with disjointed segments, break and start a new polygon
        break;
      }
      
      endpoints.delete(nextKey);
      currentSeg = nextSeg;
    }
    polygons.push(currentPolygon);
  }

  return polygons;
};
