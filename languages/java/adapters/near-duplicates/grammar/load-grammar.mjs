import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { Language } from 'web-tree-sitter';

/**
 * The tree-sitter grammar for `language` (`java`, `kotlin` or `go`). Each grammar is kept
 * brotli-compressed, since the Kotlin one is several megabytes as plain WebAssembly.
 *
 * @param {'java' | 'kotlin' | 'go'} language
 * @returns {Promise<Language>}
 */
export function loadGrammar(language) {
  const file = new URL(`tree-sitter-${language}.wasm.br`, import.meta.url);
  return Language.load(brotliDecompressSync(readFileSync(file)));
}
