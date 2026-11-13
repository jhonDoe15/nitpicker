import { readFileSync } from 'node:fs';
import { Parser } from 'web-tree-sitter';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { loadGrammar } from './grammar/load-grammar.mjs';
import { kotlinUnits } from './kotlin/units.mjs';
import { javaUnits } from './tree/units.mjs';

type TreesRequest = { readonly root: string; readonly files: readonly string[] };
type UnitsOf = (program: unknown, file: string) => unknown;
type Grammar = { readonly parser: Parser; readonly unitsOf: UnitsOf };

const GRAMMARS = {
  java: javaUnits,
  kotlin: kotlinUnits,
} as const;

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function treesRequest(value: unknown): TreesRequest {
  if (typeof value === 'object' && value !== null && 'root' in value && 'files' in value) {
    const { root, files } = value;
    if (isText(root) && Array.isArray(files) && files.every(isText)) {
      return { root, files };
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

const request = treesRequest(JSON.parse(readFileSync(0, 'utf8')));
await Parser.init();
const java = await grammarOf('java');
const kotlin = request.files.some((file) => file.endsWith('.kt'))
  ? await grammarOf('kotlin')
  : java;
process.stdout.write(
  JSON.stringify(
    request.files.flatMap((file) =>
      unitsOf(file.endsWith('.kt') ? kotlin : java, request.root, file),
    ),
  ),
);
