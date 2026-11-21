import { readFileSync } from 'node:fs';
import { Parser, type Node } from 'web-tree-sitter';
import { pathInside } from '../../../../shared/filesystem.mts';
import { fileRequest as untypedFileRequest } from '../../../../shared/near-duplicates/trees-request.mts';
import { isText } from '../../../../shared/values/readers.mts';
import { loadGrammar } from './grammar/load-grammar.mts';
import { kotlinUnits } from './kotlin/units.mts';
import { javaExtractions } from './extract/file-extractions.mts';
import { kotlinExtractions } from './extract/kotlin/extractions.mts';
import { javaUnits } from './tree/units.mts';
import { shorterFixes, type Grammar } from './simplify/shorter-fixes.mts';
import { switchLabelFixes } from './simplify/switch-labels.mts';

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

const MODES = new Set(['partial', 'shorter', 'switches']);
const FIXERS = { shorter: shorterFixes, switches: switchLabelFixes } as const;

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

type Collected = { readonly fixes: unknown[]; readonly notes: unknown[] };
type Parsed = { readonly rootNode: Node; readonly file: string; readonly text: string };
type Extract = (parsed: Parsed[]) => Collected;

function extractionsOf(
  { parser }: Grammar,
  sources: readonly Source[],
  extract: Extract,
): Collected {
  const trees = sources.flatMap(({ file, text }) => {
    const tree = parser.parse(text);
    return tree === null ? [] : [{ tree, file, text }];
  });
  try {
    return extract(trees.map(({ tree, file, text }) => ({ rootNode: tree.rootNode, file, text })));
  } finally {
    for (const { tree } of trees) {
      tree.delete();
    }
  }
}

function joined(parts: readonly Collected[]): Collected {
  return {
    fixes: parts.flatMap(({ fixes }) => fixes),
    notes: parts.flatMap(({ notes }) => notes),
  };
}

type Grammars = { readonly java: Grammar; readonly kotlin: Grammar };
type Texts = Readonly<Record<string, string>>;

function isKotlin(file: string): boolean {
  return file.endsWith('.kt');
}

async function grammarsFor(files: readonly string[]): Promise<Grammars> {
  const java = await grammarOf('java');
  return { java, kotlin: files.some(isKotlin) ? await grammarOf('kotlin') : java };
}

function grammarFor(grammars: Grammars, file: string): Grammar {
  return isKotlin(file) ? grammars.kotlin : grammars.java;
}

function isFixerMode(mode: string): mode is keyof typeof FIXERS {
  return mode === 'shorter' || mode === 'switches';
}

function sourcesOf(texts: Texts, files: readonly string[]): Source[] {
  return files.map((file) => ({ file, text: texts[file] ?? '' }));
}

function fixesResult(request: TreesRequest, texts: Texts, grammars: Grammars): unknown {
  const { mode, files } = request;
  const fixer = isFixerMode(mode) ? FIXERS[mode] : undefined;
  return {
    fixes: files.flatMap((file) =>
      fixer === undefined
        ? []
        : fixer(grammarFor(grammars, file), { file, text: texts[file] ?? '' }),
    ),
  };
}

function extractionResult(request: TreesRequest, texts: Texts, grammars: Grammars): Collected {
  const { root, mode, files } = request;
  const { java, kotlin } = grammars;
  return joined([
    extractionsOf(
      java,
      sourcesOf(
        texts,
        files.filter((file) => !isKotlin(file)),
      ),
      (parsed) =>
        javaExtractions(parsed, { root, mode, parse: (text: string) => java.parser.parse(text) }),
    ),
    extractionsOf(kotlin, sourcesOf(texts, files.filter(isKotlin)), (parsed) =>
      kotlinExtractions(parsed, { mode }),
    ),
  ]);
}

async function main(): Promise<unknown> {
  const request = treesRequest(JSON.parse(readFileSync(0, 'utf8')));
  await Parser.init();
  const grammars = await grammarsFor(request.files);
  const { texts, mode } = request;
  if (texts !== undefined && isFixerMode(mode)) {
    return fixesResult(request, texts, grammars);
  }
  if (texts !== undefined) {
    return extractionResult(request, texts, grammars);
  }
  return request.files.flatMap((file) => unitsOf(grammarFor(grammars, file), request.root, file));
}

process.stdout.write(JSON.stringify(await main()));
