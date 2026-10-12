import type { ParsedSales } from './parse-sales.js';
import { parseSales } from './parse-sales.js';

type ReadFile = (path: string) => Promise<string>;

type Read =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly message: string };

async function attemptRead(path: string, readFile: ReadFile): Promise<Read> {
  try {
    return { ok: true, text: await readFile(path) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function loadSales(path: string, readFile: ReadFile): Promise<ParsedSales> {
  const read = await attemptRead(path, readFile);
  if (!read.ok) {
    return { kind: 'failure', messages: [`Could not read ${path}: ${read.message}`] };
  }
  return parseSales(read.text, path);
}
