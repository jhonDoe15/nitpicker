import { readFileSync } from 'node:fs';
import { Parser } from 'web-tree-sitter';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { fileRequest as untypedFileRequest } from '../../../../shared/near-duplicates/trees-request.mjs';
import { isText } from '../../../../shared/values/readers.mts';
import { loadGrammar } from './grammar/load-grammar.mts';
import { kotlinUnits } from './kotlin/units.mts';
import { javaExtractions } from './extract/file-extractions.mts';
import { javaUnits } from './tree/units.mts';
import { shorterFixes, type Grammar } from './simplify/shorter-fixes.mts';

type TreesRequest = {
  readonly root: string;
  readonly files: readonly string[];
  readonly texts: Readonly<Record<string, string>> | undefined;
  readonly mode: string;
};
const fileRequest: (value: unknown) => { root: string; files: string[] } = untypedFileRequest;

const GRAMMARS = {
  java: javaUnits,
  kotlin: kotlinUnits,
} as const;

function textsOf(value: object): Readonly<Record<string, string>> | undefined {
  if ('texts' in value && typeof value.texts === 'object' && value.texts !== null) {
    return Object.fromEntries(
      Object.entries(value.texts).filter((entry): entry is [string, string] => isText(entry[1])),
    );
  }
  return undefined;
}

const MODES = new Set(['partial', 'shorter']);

function modeOf(value: object): string {
  return 'mode' in value && typeof value.mode === 'string' && MODES.has(value.mode)
    ? value.mode
    : 'whole';
}

function treesRequest(value: unknown): TreesRequest {
  const { root, files } = fileRequest(value);
  const extras = typeof value === 'object' && value !== null ? value : {};
  return { root, files, texts: textsOf(extras), mode: modeOf(extras) };
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

type Source = { readonly file: string; readonly text: string };

function extractionsOf(
  { parser }: Grammar,
  sources: readonly Source[],
  options: { readonly root: string; readonly mode: string },
): unknown {
  const trees = sources.flatMap(({ file, text }) => {
    const tree = parser.parse(text);
    return tree === null ? [] : [{ tree, file, text }];
  });
  try {
    return javaExtractions(
      trees.map(({ tree, file, text }) => ({ rootNode: tree.rootNode, file, text })),
      { ...options, parse: (text: string) => parser.parse(text) },
    );
  } finally {
    for (const { tree } of trees) {
      tree.delete();
    }
  }
}

async function main(): Promise<unknown> {
  const request = treesRequest(JSON.parse(readFileSync(0, 'utf8')));
  await Parser.init();
  const java = await grammarOf('java');
  const { texts } = request;
  if (texts !== undefined && request.mode === 'shorter') {
    const kotlin = await grammarOf('kotlin');
    return {
      fixes: request.files.flatMap((file) =>
        shorterFixes(file.endsWith('.kt') ? kotlin : java, { file, text: texts[file] ?? '' }),
      ),
    };
  }
  if (texts !== undefined) {
    return extractionsOf(
      java,
      request.files.map((file) => ({ file, text: texts[file] ?? '' })),
      { root: request.root, mode: request.mode },
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
