import { RULE_IDS } from '../../policy.mts';
import { copyGroups } from './copy-groups.mts';
import { listPaths, reuseFinding } from './reuse-finding.mts';
import {
  createSimilarityCache,
  tokenSimilarity,
  type SimilarityCache,
} from './token-similarity.mts';
import type { Finding } from '../../values/findings.mts';
import type { BaselineFile, BaselineSource } from '../facts/typed/fact-types.mts';
import type { ReuseDefinition } from '../facts/typed/reuse-module-types.mts';
import type { Copy, CopyModule, SiblingOptions } from './typed/reuse-types.mts';

type BaselineDefinition = BaselineFile['definitions'][number];
type CopyState =
  | { readonly state: typeof UNTOUCHED | 'new' }
  | { readonly state: 'edited'; readonly before: BaselineDefinition };

const UNTOUCHED = 'untouched';
const KINDS = new Set(['function', 'class']);
const MINIMUM_TOKENS = 20;
const MINIMUM_SIMILARITY = 0.8;

function isComparable(definition: ReuseDefinition): boolean {
  return (
    KINDS.has(definition.kind) && definition.tokens.length >= MINIMUM_TOKENS && !definition.entry
  );
}

function memoized(read: BaselineSource): BaselineSource {
  const known = new Map<string, BaselineFile>();
  return (file) => {
    const found = known.get(file) ?? read(file);
    known.set(file, found);
    return found;
  };
}

function comparedTokens(definition: {
  readonly tokens: readonly string[];
  readonly untypedTokens?: readonly string[] | undefined;
}): readonly string[] {
  return definition.untypedTokens ?? definition.tokens;
}

function tagOf({ text }: { readonly text: string }): string {
  return text.slice(0, text.indexOf('|'));
}

function sameUntypedCode(before: BaselineDefinition, definition: ReuseDefinition): boolean {
  const [left, right] = [before.untypedTokens, definition.untypedTokens];
  return (
    left !== undefined &&
    tagOf(before) === tagOf(definition) &&
    right !== undefined &&
    left.length === right.length &&
    left.every((token, index) => token === right[index])
  );
}

function sameDeclaration(
  left: { readonly name: string; readonly qualifier?: string | undefined },
  right: { readonly name: string; readonly qualifier?: string | undefined },
): boolean {
  return left.name === right.name && left.qualifier === right.qualifier;
}

function stateOf({ path, definition }: Copy, baselineFile: BaselineSource): CopyState {
  const baseline = baselineFile(path);
  if (baseline.unchanged) {
    return { state: UNTOUCHED };
  }
  const before = baseline.definitions.find(
    (candidate) => candidate.kind === definition.kind && sameDeclaration(candidate, definition),
  );
  if (before === undefined) {
    return { state: 'new' };
  }
  return before.text === definition.text || sameUntypedCode(before, definition)
    ? { state: UNTOUCHED }
    : { state: 'edited', before };
}

function divergesFrom(
  cache: SimilarityCache,
  { copy, before }: { readonly copy: Copy; readonly before: BaselineDefinition },
  other: Copy,
): boolean {
  const right = comparedTokens(other.definition);
  const left = comparedTokens(copy.definition);
  const after = tokenSimilarity(cache, { left, right }, MINIMUM_SIMILARITY);
  const earlier = comparedTokens(before);
  return after > 0 && tokenSimilarity(cache, { left: earlier, right }, MINIMUM_SIMILARITY) > after;
}

function editFinding({
  copy,
  untouched,
  analyzerName,
}: {
  readonly copy: Copy;
  readonly untouched: readonly Copy[];
  readonly analyzerName: string;
}): Finding {
  const { name, qualifier = name, line } = copy.definition;
  return reuseFinding(analyzerName, {
    key: 'siblingCopyEdit',
    path: copy.path,
    identity: `sibling-copy:${qualifier}`,
    symbol: name,
    line,
    values: { name: qualifier, others: listPaths(untouched.map(({ path }) => path).toSorted()) },
  });
}

type StatedCopy = CopyState & { readonly copy: Copy };
type EditedCopy = Extract<StatedCopy, { readonly state: 'edited' }>;

function isEdited(found: StatedCopy): found is EditedCopy {
  return found.state === 'edited';
}

function groupFindings({
  copies,
  baselineFile,
  analyzerName,
  cache,
}: {
  readonly copies: readonly Copy[];
  readonly baselineFile: BaselineSource;
  readonly analyzerName: string;
  readonly cache: SimilarityCache;
}): Finding[] {
  const states = copies.map((copy) => ({ copy, ...stateOf(copy, baselineFile) }));
  const untouched = states.filter(({ state }) => state === UNTOUCHED).map(({ copy }) => copy);
  return states
    .filter(isEdited)
    .map((edited) => ({
      copy: edited.copy,
      untouched: untouched.filter((other) => divergesFrom(cache, edited, other)),
    }))
    .filter((found) => found.untouched.length > 0)
    .map((found) => editFinding({ ...found, analyzerName }));
}

export function siblingCopyEditFindings(
  modules: readonly CopyModule[],
  { analyzerName, isExcepted, baselineFile, acrossPackages = false }: SiblingOptions,
): Finding[] {
  if (baselineFile === undefined) {
    return [];
  }
  const baselineOf = memoized(baselineFile);
  const cache = createSimilarityCache();
  const grouped = acrossPackages
    ? modules.map((module) => ({ ...module, packageRoot: '' }))
    : modules;
  return copyGroups(grouped, {
    rule: RULE_IDS.siblingCopyEdit,
    isExcepted,
    isComparable,
    keyOf: ({ kind, name }) => `${kind}\0${name}`,
  }).flatMap((copies) => groupFindings({ copies, baselineFile: baselineOf, analyzerName, cache }));
}
