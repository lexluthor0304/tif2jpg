export type PageMode = 'all' | 'custom';

export function parsePageSelection(totalPages: number, mode: PageMode, expression: string): number[] {
  if (mode === 'all' || !expression.trim()) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const result = new Set<number>();
  const parts = expression.split(/[,\s]+/).filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [startRaw, endRaw] = part.split('-', 2);
      const start = parseInt(startRaw, 10);
      const end = parseInt(endRaw, 10);
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      const step = start <= end ? 1 : -1;
      for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
        addPage(result, totalPages, i);
      }
    } else {
      const value = parseInt(part, 10);
      if (!Number.isNaN(value)) {
        addPage(result, totalPages, value);
      }
    }
  }
  if (result.size === 0) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  return Array.from(result).sort((a, b) => a - b);
}

function addPage(set: Set<number>, totalPages: number, humanIndex: number) {
  const index = humanIndex - 1;
  if (index >= 0 && index < totalPages) {
    set.add(index);
  }
}
