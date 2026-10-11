export type SplitResult =
  | { readonly kind: 'fields'; readonly fields: readonly string[] }
  | { readonly kind: 'unterminated-quote' }
  | { readonly kind: 'malformed-quote' };

type Mode = 'start' | 'unquoted' | 'quoted' | 'closed';

type Scan = {
  readonly mode: Mode;
  readonly fields: readonly string[];
  readonly current: string;
  readonly malformed: boolean;
};

const INITIAL: Scan = { mode: 'start', fields: [], current: '', malformed: false };

function endField(scan: Scan): Scan {
  return { mode: 'start', fields: [...scan.fields, scan.current], current: '', malformed: false };
}

function markMalformed(scan: Scan): Scan {
  return { ...scan, malformed: true };
}

function scanStart(scan: Scan, char: string): Scan {
  if (char === '"') {
    return { ...scan, mode: 'quoted' };
  }
  if (char === ',') {
    return endField(scan);
  }
  return { ...scan, mode: 'unquoted', current: char };
}

function scanUnquoted(scan: Scan, char: string): Scan {
  if (char === '"') {
    return markMalformed(scan);
  }
  if (char === ',') {
    return endField(scan);
  }
  return { ...scan, current: `${scan.current}${char}` };
}

function scanQuoted(scan: Scan, char: string): Scan {
  if (char === '"') {
    return { ...scan, mode: 'closed' };
  }
  return { ...scan, current: `${scan.current}${char}` };
}

function scanClosed(scan: Scan, char: string): Scan {
  if (char === '"') {
    return { ...scan, mode: 'quoted', current: `${scan.current}"` };
  }
  if (char === ',') {
    return endField(scan);
  }
  return markMalformed(scan);
}

function scanChar(scan: Scan, char: string): Scan {
  if (scan.malformed) {
    return scan;
  }
  switch (scan.mode) {
    case 'start':
      return scanStart(scan, char);
    case 'unquoted':
      return scanUnquoted(scan, char);
    case 'quoted':
      return scanQuoted(scan, char);
    case 'closed':
      return scanClosed(scan, char);
  }
}

export function splitLine(line: string): SplitResult {
  const end = Array.from(line).reduce(scanChar, INITIAL);
  if (end.malformed) {
    return { kind: 'malformed-quote' };
  }
  if (end.mode === 'quoted') {
    return { kind: 'unterminated-quote' };
  }
  return { kind: 'fields', fields: [...end.fields, end.current] };
}
