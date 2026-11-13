import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Language, Parser } from 'web-tree-sitter';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { javaUnits } from './tree/units.mjs';

type TreesRequest = { readonly root: string; readonly files: readonly string[] };

const GRAMMAR = fileURLToPath(new URL('grammar/tree-sitter-java.wasm', import.meta.url));

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
  throw new TypeError('The Java trees request must be { root, files } with text values');
}

async function javaParser(): Promise<Parser> {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load(GRAMMAR));
  return parser;
}

function unitsOf(parser: Parser, root: string, file: string): unknown[] {
  const full: unknown = pathInside(root, file);
  if (typeof full !== 'string') {
    throw new Error(`${file} is outside ${root}`);
  }
  const tree = parser.parse(readFileSync(full, 'utf8'));
  if (tree === null) {
    return [];
  }
  try {
    const units: unknown = javaUnits(tree.rootNode, file);
    return Array.isArray(units) ? units.map((unit: unknown) => unit) : [];
  } finally {
    tree.delete();
  }
}

const request = treesRequest(JSON.parse(readFileSync(0, 'utf8')));
const parser = await javaParser();
process.stdout.write(
  JSON.stringify(request.files.flatMap((file) => unitsOf(parser, request.root, file))),
);
