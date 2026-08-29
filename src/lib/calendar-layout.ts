// Audit finding B1: two bookings at the same time in the same bay rendered
// fully on top of each other (identical top/left/right), with the later one
// in array order winning both the paint AND every future click -- the
// earlier one wasn't just visually hidden, it became permanently
// unreachable from the calendar. This assigns each item a column within its
// overlap cluster (classic calendar sweep: track each open column's end
// time, reuse the first one that's free) so overlapping items render side
// by side instead of stacked, and every one stays clickable.
export interface OverlapLayout<T> {
  item: T;
  col: number;
  cols: number;
}

export function layoutOverlaps<T>(
  items: T[],
  getStart: (item: T) => number,
  getEnd: (item: T) => number,
): OverlapLayout<T>[] {
  const sorted = [...items].sort((a, b) => getStart(a) - getStart(b));
  const result: OverlapLayout<T>[] = [];
  const columnEnds: number[] = [];
  let cluster: OverlapLayout<T>[] = [];
  let clusterEnd = -Infinity;

  function closeCluster() {
    if (cluster.length === 0) return;
    const cols = Math.max(...cluster.map((c) => c.col)) + 1;
    for (const c of cluster) c.cols = cols;
    cluster = [];
  }

  for (const item of sorted) {
    const start = getStart(item);
    const end = getEnd(item);
    if (start >= clusterEnd) {
      closeCluster();
      columnEnds.length = 0;
      clusterEnd = -Infinity;
    }
    let col = columnEnds.findIndex((colEnd) => colEnd <= start);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[col] = end;
    }
    const laidOut: OverlapLayout<T> = { item, col, cols: 1 };
    cluster.push(laidOut);
    result.push(laidOut);
    clusterEnd = Math.max(clusterEnd, end);
  }
  closeCluster();

  return result;
}
