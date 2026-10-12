import { parseSettings } from './parse-settings.js';
import type { Settings } from './parse-settings.js';

type SourceLine = {
  readonly text: string;
  readonly source: string;
  readonly chain: readonly string[];
};

type Failure =
  | { readonly kind: 'missing-source'; readonly name: string }
  | { readonly kind: 'include-cycle'; readonly chain: readonly string[] }
  | { readonly kind: 'empty-include'; readonly source: string };

type Expansion = { readonly kind: 'lines'; readonly lines: readonly SourceLine[] } | Failure;

type Sources = ReadonlyMap<string, string>;

type Resolution = Failure | { readonly kind: 'resolved'; readonly settings: Settings };

const NO_LINES: Expansion = { kind: 'lines', lines: [] };

function linesOf(name: string, chain: readonly string[], sources: Sources): Expansion {
  const text = sources.get(name);
  if (text === undefined) {
    return { kind: 'missing-source', name };
  }
  const lines: readonly SourceLine[] = text
    .split('\n')
    .map((line): SourceLine => ({ text: line, source: name, chain: [...chain, name] }));
  return { kind: 'lines', lines };
}

function includeName(text: string): string | undefined {
  const rest = text.replace(/^\s*include\s*=/, '');
  return rest === text ? undefined : rest.trim();
}

function expandLine(line: SourceLine, sources: Sources): Expansion {
  const name = includeName(line.text);
  if (name === undefined) {
    return { kind: 'lines', lines: [line] };
  }
  if (name === '') {
    return { kind: 'empty-include', source: line.source };
  }
  if (line.chain.includes(name)) {
    return { kind: 'include-cycle', chain: [...line.chain, name] };
  }
  return linesOf(name, line.chain, sources);
}

function join(parts: readonly Expansion[]): Expansion {
  return parts.reduce<Expansion>((joined, part): Expansion => {
    if (joined.kind !== 'lines') {
      return joined;
    }
    if (part.kind !== 'lines') {
      return part;
    }
    return { kind: 'lines', lines: [...joined.lines, ...part.lines] };
  }, NO_LINES);
}

function expandPass(state: Expansion, sources: Sources): Expansion {
  if (state.kind !== 'lines') {
    return state;
  }
  return join(state.lines.map((line) => expandLine(line, sources)));
}

export function resolveSettings(entry: string, sources: Sources): Resolution {
  const passes: readonly string[] = Array.from(sources.keys());
  const expanded = passes.reduce<Expansion>(
    (state) => expandPass(state, sources),
    linesOf(entry, [], sources),
  );
  if (expanded.kind !== 'lines') {
    return expanded;
  }
  const text = expanded.lines.map((line) => line.text).join('\n');
  return { kind: 'resolved', settings: parseSettings(text) };
}
