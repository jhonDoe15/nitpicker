type Mode = 'item-start' | 'plain' | 'quoted' | 'escaped' | 'after-quote';

type Scan = {
  readonly mode: Mode;
  readonly items: readonly string[];
  readonly current: string;
  readonly problem: string | undefined;
};

export type ValueList =
  | { readonly kind: 'values'; readonly values: readonly string[] }
  | { readonly kind: 'invalid'; readonly reason: string };

const START: Scan = { mode: 'item-start', items: [], current: '', problem: undefined };

function endItem(scan: Scan, item: string): Scan {
  return { mode: 'item-start', items: [...scan.items, item], current: '', problem: undefined };
}

function startItem(scan: Scan, char: string): Scan {
  if (/\s/.test(char)) {
    return scan;
  }
  if (char === ',') {
    return endItem(scan, '');
  }
  if (char === '"') {
    return { ...scan, mode: 'quoted' };
  }
  return { ...scan, mode: 'plain', current: char };
}

function plainChar(scan: Scan, char: string): Scan {
  if (char === ',') {
    return endItem(scan, scan.current.trimEnd());
  }
  return { ...scan, current: scan.current + char };
}

function quotedChar(scan: Scan, char: string): Scan {
  if (char === '\\') {
    return { ...scan, mode: 'escaped' };
  }
  if (char === '"') {
    return { ...scan, mode: 'after-quote' };
  }
  return { ...scan, current: scan.current + char };
}

function escapedChar(scan: Scan, char: string): Scan {
  const kept = char === '"' || char === '\\' ? char : `\\${char}`;
  return { ...scan, mode: 'quoted', current: scan.current + kept };
}

function afterQuoteChar(scan: Scan, char: string): Scan {
  if (/\s/.test(char)) {
    return scan;
  }
  if (char === ',') {
    return endItem(scan, scan.current);
  }
  return { ...scan, problem: 'unexpected text after closing quote' };
}

function step(scan: Scan, char: string): Scan {
  if (scan.problem !== undefined) {
    return scan;
  }
  switch (scan.mode) {
    case 'item-start':
      return startItem(scan, char);
    case 'plain':
      return plainChar(scan, char);
    case 'quoted':
      return quotedChar(scan, char);
    case 'escaped':
      return escapedChar(scan, char);
    case 'after-quote':
      return afterQuoteChar(scan, char);
  }
}

function finish(scan: Scan): ValueList {
  if (scan.problem !== undefined) {
    return { kind: 'invalid', reason: scan.problem };
  }
  switch (scan.mode) {
    case 'quoted':
    case 'escaped':
      return { kind: 'invalid', reason: 'unterminated quote' };
    case 'plain':
    case 'after-quote':
      return { kind: 'values', values: [...scan.items, scan.current] };
    case 'item-start':
      return { kind: 'values', values: scan.items.length === 0 ? [] : [...scan.items, ''] };
  }
}

export function splitValueList(raw: string): ValueList {
  return finish(Array.from(raw).reduce(step, START));
}
