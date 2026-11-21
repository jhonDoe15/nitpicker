import { RULE_IDS } from '../../policy.mts';
import { copyGroups } from './copy-groups.mts';
import { listPaths, reuseFinding } from './reuse-finding.mts';
import type { Finding } from '../../values/findings.mts';
import type { ReuseDefinition } from '../facts/typed/reuse-module-types.mts';
import type { Copy, CopyFindingContext, CopyModule } from './typed/reuse-types.mts';

const SAME: Readonly<Record<string, string>> = {
  const: 'the same value',
  function: 'the same code',
  type: 'the same shape',
  interface: 'the same shape',
};
const FIX: Readonly<Record<'exported' | 'private', string>> = {
  exported: 'Keep one definition and import it.',
  private: 'Move it to one module and import it.',
};
const DUPLICATES_ANALYZER_MINIMUM = { lines: 5, tokens: 50 };

function isLargeEnoughForDuplicatesAnalyzer({ lines, size }: ReuseDefinition): boolean {
  return lines >= DUPLICATES_ANALYZER_MINIMUM.lines && size >= DUPLICATES_ANALYZER_MINIMUM.tokens;
}

function isShared({ kind, literal, exported }: ReuseDefinition): boolean {
  return exported && (kind === 'type' || kind === 'interface' || (kind === 'const' && literal));
}

function isComparable(definition: ReuseDefinition): boolean {
  const comparesByText = definition.kind === 'function' || isShared(definition);
  return (
    definition.used &&
    definition.tokens.length > 0 &&
    comparesByText &&
    !isLargeEnoughForDuplicatesAnalyzer(definition)
  );
}

function fixFor(exported: boolean, otherCopies: readonly Copy[], privateFix = FIX.private): string {
  if (exported) {
    return FIX.exported;
  }
  const exportedOther = otherCopies
    .filter(({ definition }) => definition.exported)
    .map(({ path: other }) => other)
    .reduce<string | undefined>(
      (best, other) => (best === undefined || other < best ? other : best),
      undefined,
    );
  return exportedOther === undefined ? privateFix : `Import it from ${exportedOther} instead.`;
}

function copyFinding({
  copy,
  copies,
  analyzerName,
  privateFix,
}: {
  readonly copy: Copy;
  readonly copies: readonly Copy[];
  readonly analyzerName: string;
  readonly privateFix: string | undefined;
}): Finding {
  const { name, qualifier = name, kind, line, exported } = copy.definition;
  const otherCopies = copies.filter(({ path: other }) => other !== copy.path);
  const others = otherCopies.map(({ path: p }) => p).toSorted();
  return reuseFinding(analyzerName, {
    key: 'duplicateDefinition',
    path: copy.path,
    identity: `duplicate:${qualifier}`,
    symbol: name,
    line,
    values: {
      name: qualifier,
      same: SAME[kind] ?? '',
      others: listPaths(others),
      fix: fixFor(exported, otherCopies, privateFix),
    },
  });
}

export function duplicateDefinitionFindings(
  facts: readonly CopyModule[],
  {
    analyzerName,
    isExcepted,
    privateFix,
  }: CopyFindingContext & { readonly privateFix?: string | undefined },
): Finding[] {
  return copyGroups(facts, {
    rule: RULE_IDS.duplicateDefinition,
    isExcepted,
    isComparable,
    keyOf: ({ kind, name, key }) => `${kind}\0${name}\0${key}`,
  }).flatMap((copies) =>
    copies.map((copy) => copyFinding({ copy, copies, analyzerName, privateFix })),
  );
}
