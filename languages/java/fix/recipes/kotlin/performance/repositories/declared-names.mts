import { escapeRegExp } from '../../shared/kotlin-scan.mts';

type Binding =
  | { readonly kind: 'typed'; readonly type: string }
  | { readonly kind: 'inferred'; readonly initializer: string }
  | { readonly kind: 'other' };

const TYPE = String.raw`[A-Za-z_][\w.]*(?:<[^()=\n]*>)?\??`;
const REACTIVE = /\b(?:Mono|Flux|Flow|suspend|Reactive\w*|Coroutine\w*)\b/u;
const ITERABLE_TYPES = new Set([
  ...['Iterable', 'Collection', 'List', 'Set', 'MutableIterable', 'MutableCollection'],
  ...['MutableList', 'MutableSet', 'ArrayList', 'HashSet', 'LinkedHashSet', 'LinkedList'],
]);
const ITERABLE_FACTORIES = [
  ...['listOf', 'setOf', 'mutableListOf', 'mutableSetOf', 'arrayListOf'],
  ...['hashSetOf', 'linkedSetOf', 'emptyList', 'emptySet'],
].join('|');
const ITERABLE_CONVERSIONS = ['toList', 'toSet', 'toMutableList', 'toMutableSet'].join('|');
const ITERABLE_INITIALIZER = new RegExp(
  String.raw`^(?:(?:${ITERABLE_FACTORIES})\b|.*\.(?:${ITERABLE_CONVERSIONS})\s*\(\s*\)$)`,
  'u',
);

function bindingPatterns(name: string): readonly { kind: Binding['kind']; pattern: RegExp }[] {
  const escaped = escapeRegExp(name);
  return [
    { kind: 'typed', pattern: new RegExp(String.raw`(?<![\w.])${escaped}\s*:\s*(${TYPE})`, 'gu') },
    {
      kind: 'inferred',
      pattern: new RegExp(
        String.raw`\b(?:val|var)\s+${escaped}\b(?!\s*:)\s*(?:=\s*([^\n]*))?`,
        'gu',
      ),
    },
    { kind: 'other', pattern: new RegExp(String.raw`\bfor\s*\(\s*${escaped}\b(?!\s*:)`, 'gu') },
    {
      kind: 'other',
      pattern: new RegExp(String.raw`(?<![\w.])${escaped}\s*(?:,\s*[A-Za-z_]\w*\s*)*->`, 'gu'),
    },
    {
      kind: 'other',
      pattern: new RegExp(
        String.raw`(?:\b(?:val|var)\s*|\bfor\s*\(\s*)\([^()\n]*(?<![\w.])${escaped}(?![\w])[^()\n]*\)`,
        'gu',
      ),
    },
    {
      kind: 'other',
      pattern: new RegExp(String.raw`\([^()\n]*(?<![\w.])${escaped}(?![\w])[^()\n]*\)\s*->`, 'gu'),
    },
  ];
}

export function bindingsOf(code: string, name: string): readonly Binding[] {
  return bindingPatterns(name).flatMap(({ kind, pattern }) =>
    [...code.matchAll(pattern)].map((match): Binding => {
      if (kind === 'typed') {
        return { kind, type: match[1] ?? '' };
      }
      return kind === 'inferred'
        ? { kind, initializer: (match[1] ?? '').trim() }
        : { kind: 'other' };
    }),
  );
}

function baseName(type: string): string {
  const bare = type.replace(/<.*$/u, '');
  return bare.slice(bare.lastIndexOf('.') + 1);
}

function reactiveFile(code: string): boolean {
  return REACTIVE.test(code);
}

export function isRepositoryName(code: string, name: string): boolean {
  const bindings = bindingsOf(code, name);
  return (
    bindings.length > 0 &&
    !reactiveFile(code) &&
    bindings.every(
      (binding) =>
        binding.kind === 'typed' &&
        !binding.type.endsWith('?') &&
        baseName(binding.type).endsWith('Repository'),
    )
  );
}

export function isIterableName(code: string, name: string): boolean {
  const bindings = bindingsOf(code, name);
  return (
    bindings.length > 0 &&
    bindings.every((binding) => {
      if (binding.kind === 'typed') {
        return !binding.type.endsWith('?') && ITERABLE_TYPES.has(baseName(binding.type));
      }
      return binding.kind === 'inferred' && ITERABLE_INITIALIZER.test(binding.initializer);
    })
  );
}
