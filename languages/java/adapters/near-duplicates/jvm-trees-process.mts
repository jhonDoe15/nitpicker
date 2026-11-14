import { readFileSync } from 'node:fs';
import { Parser } from 'web-tree-sitter';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { loadGrammar } from './grammar/load-grammar.mjs';
import { kotlinUnits } from './kotlin/units.mjs';
import { javaExtractions } from './extract/file-extractions.mjs';
import { javaUnits } from './tree/units.mjs';

type TreesRequest = {
  readonly root: string;
  readonly files: readonly string[];
  readonly texts: Readonly<Record<string, string>> | undefined;
  readonly mode: string;
};
type UnitsOf = (program: unknown, file: string) => unknown;
type Grammar = { readonly parser: Parser; readonly unitsOf: UnitsOf };

const GRAMMARS = {
  java: javaUnits,
  kotlin: kotlinUnits,
} as const;

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function textsOf(value: object): Readonly<Record<string, string>> | undefined {
  if ('texts' in value && typeof value.texts === 'object' && value.texts !== null) {
    return Object.fromEntries(
      Object.entries(value.texts).filter((entry): entry is [string, string] => isText(entry[1])),
    );
  }
  return undefined;
}

function modeOf(value: object): string {
  return 'mode' in value && value.mode === 'partial' ? 'partial' : 'whole';
}

function treesRequest(value: unknown): TreesRequest {
  if (typeof value === 'object' && value !== null && 'root' in value && 'files' in value) {
    const { root, files } = value;
    if (isText(root) && Array.isArray(files) && files.every(isText)) {
      return { root, files, texts: textsOf(value), mode: modeOf(value) };
    }
  }
  throw new TypeError('The JVM trees request must be { root, files } with text values');
}

async function grammarOf(name: keyof typeof GRAMMARS): Promise<Grammar> {
  const parser = new Parser();
  parser.setLanguage(await loadGrammar(name));
  return { parser, unitsOf: GRAMMARS[name] };
}

function unitsOf({ parser, unitsOf: convert }: Grammar, root: string, file: string): unknown[] {
  const full: unknown = pathInside(root, file);
  if (typeof full !== 'string') {
    throw new Error(`${file} is outside ${root}`);
  }
  const tree = parser.parse(readFileSync(full, 'utf8'));
  if (tree === null) {
    return [];
  }
  try {
    const units: unknown = convert(tree.rootNode, file);
    return Array.isArray(units) ? units.map((unit: unknown) => unit) : [];
  } finally {
    tree.delete();
  }
}

type ExtractionSource = { readonly text: string; readonly mode: string };

function extractionsOf({ parser }: Grammar, file: string, source: ExtractionSource): unknown {
  const tree = parser.parse(source.text);
  if (tree === null) {
    return { fixes: [], notes: [] };
  }
  try {
    return javaExtractions(tree.rootNode, file, source);
  } finally {
    tree.delete();
  }
}

async function main(): Promise<unknown> {
  const request = treesRequest(JSON.parse(readFileSync(0, 'utf8')));
  await Parser.init();
  const java = await grammarOf('java');
  const { texts } = request;
  if (texts !== undefined) {
    return Object.fromEntries(
      request.files.map((file) => [
        file,
        extractionsOf(java, file, { text: texts[file] ?? '', mode: request.mode }),
      ]),
    );
  }
  const kotlin = request.files.some((file) => file.endsWith('.kt'))
    ? await grammarOf('kotlin')
    : java;
  return request.files.flatMap((file) =>
    unitsOf(file.endsWith('.kt') ? kotlin : java, request.root, file),
  );
}

process.stdout.write(JSON.stringify(await main()));
