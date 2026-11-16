import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { Language } from 'web-tree-sitter';

export function loadGrammar(language: 'java' | 'kotlin' | 'go'): Promise<Language> {
  const file = new URL(`tree-sitter-${language}.wasm.br`, import.meta.url);
  return Language.load(brotliDecompressSync(readFileSync(file)));
}
