import { findNearDuplicates } from '../../near-duplicates/engine.mts';
import type { ProveLogic, SkippedPair } from '../../near-duplicates/engine.mts';
import { KEY_MODES, compareText, keyOf } from '../../near-duplicates/tree/keys.mts';
import { RULE_IDS } from '../../policy.mts';
import { listNames } from '../../messages/messages.mts';
import { reuseFinding } from '../reuse/reuse-finding.mts';
import { isPlatformVariant } from './platform-variants.mts';
import { isTypeSpecialized } from './type-families.mts';
import { shortText } from '../../near-duplicates/unit-parts.mts';
import { present } from '../../near-duplicates/tree/nodes.mts';
import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';
import type { Finding } from '../../values/findings.mts';
import type { FactUnit, RuleContext } from '../facts/typed/fact-types.mts';
import type {
  NearFinding,
  NearHole,
  NearMatch,
  NearPair,
  NearRun,
  NearSide,
} from './near-types.mts';

const CLONE_ANALYZER_MINIMUM = { lines: 5, tokens: 100, exactTokens: 50 };
const SHOWN_TEXT = 40;
const NORMALIZED_LITERALS = new Set<string | undefined>(['string', 'number', 'char']);

const FIXES: Readonly<Record<string, string>> = {
  same: 'Keep one, and call it from both places.',
  parameterizable:
    'Extract one function that takes the differing values as parameters, and call it from both places.',
  'partial-run': 'Extract lines {run} into one function, and call it from both places.',
};

const SAME_DIFFERENCES: Readonly<Record<string, string>> = {
  names: 'apart from renamed names',
  logic: 'apart from how its logic is written (a solver proved both give the same results)',
  inlined: 'once same-file helper calls are inlined',
};

function unitIdOf({ file, name }: { readonly file: string; readonly name: string }): string {
  return `${file}#${name}`;
}

function withoutSharedPrefix(value: string, other: string): string {
  const own = value.replace(/^[a-z]+:/u, '');
  const theirs = other.replace(/^[a-z]+:/u, '');
  const shared = Array.from(own).findIndex((character, index) => character !== theirs[index]);
  const cut = own.slice(0, shared === -1 ? own.length : shared).search(/[^./]*$/u);
  return own.slice(cut);
}

function holeText(node: TreeNode, other: TreeNode): string {
  if (node.kind === 'none') {
    return 'nothing';
  }
  if (node.kind === 'literal' || node.kind === 'type') {
    return shortText(node.value ?? '', SHOWN_TEXT);
  }
  if (node.kind === 'name' && node.text === other.text) {
    return withoutSharedPrefix(node.value ?? '', other.value ?? '');
  }
  return node.text === undefined
    ? `the ${node.kind} on line ${String(node.start)}`
    : shortText(node.text, SHOWN_TEXT);
}

function holeList(parameters: readonly NearHole[], side: number): string {
  return listNames(
    parameters.map((parameter) => {
      const [here, there]: [TreeNode, TreeNode] =
        side === 0 ? [parameter.a, parameter.b] : [parameter.b, parameter.a];
      return `${holeText(here, there)} / ${holeText(there, here)}`;
    }),
  );
}

function lines({ start, end }: NearRun): string {
  return start === end ? String(start) : `${String(start)}-${String(end)}`;
}

function differenceOf(finding: NearFinding, [here, other]: NearPair): string {
  if (finding.verdict === 'same') {
    return SAME_DIFFERENCES[finding.proof ?? 'names'] ?? '';
  }
  if (finding.verdict === 'parameterizable') {
    const parameters = finding.parameters ?? [];
    const count = parameters.length;
    return `apart from ${String(count)} ${count === 1 ? 'value' : 'values'} (${holeList(parameters, here.side)})`;
  }
  const run = finding.run ?? [];
  return `in lines ${lines(present(run[here.side]))} here and ${lines(present(run[other.side]))} there`;
}

function sides(finding: NearFinding, units: ReadonlyMap<string, FactUnit>): NearPair {
  const located = finding.units.map((id, side): NearSide => ({ ...present(units.get(id)), side }));
  const [first, second] = located.toSorted((left, right) =>
    compareText(unitIdOf(right), unitIdOf(left)),
  );
  return [present(first), present(second)];
}

function isNormalizedByCloneAnalyzer(node: TreeNode): boolean {
  return (
    node.children.length === 0 &&
    (node.kind === 'name' || (node.kind === 'literal' && NORMALIZED_LITERALS.has(node.literal)))
  );
}

function hasCloneTokens(finding: NearFinding): boolean {
  return (
    finding.verdict === 'same' ||
    (finding.verdict === 'parameterizable' &&
      (finding.parameters ?? []).every(
        ({ a, b }) => isNormalizedByCloneAnalyzer(a) && isNormalizedByCloneAnalyzer(b),
      ))
  );
}

function cloneTokensMinimum([here, other]: NearPair): number {
  const left = keyOf(here.tree, KEY_MODES.own);
  const right = keyOf(other.tree, KEY_MODES.own);
  return left === right ? CLONE_ANALYZER_MINIMUM.exactTokens : CLONE_ANALYZER_MINIMUM.tokens;
}

function isLeftToCloneAnalyzer(finding: NearFinding, pair: NearPair): boolean {
  const minimum = cloneTokensMinimum(pair);
  return (
    hasCloneTokens(finding) &&
    !finding.rewritten &&
    pair.every(
      ({ start, end, tokens }) =>
        end - start + 1 >= CLONE_ANALYZER_MINIMUM.lines && tokens >= minimum,
    )
  );
}

function nearDuplicateFinding(
  finding: NearFinding,
  { pair, analyzerName }: { readonly pair: NearPair; readonly analyzerName: string },
): Finding {
  const [here, other] = pair;
  const run = finding.run === undefined ? undefined : lines(present(finding.run[here.side]));
  return reuseFinding(analyzerName, {
    key: 'nearDuplicate',
    path: here.file,
    identity: `near-duplicate:${pair.map(unitIdOf).toSorted(compareText).join('|')}`,
    symbol: here.name,
    line: here.start,
    values: {
      name: here.name,
      other: `${other.name} (${other.file}:${String(other.start)})`,
      difference: differenceOf(finding, pair),
      fix: (FIXES[finding.verdict] ?? '').replace('{run}', () => String(run)),
    },
  });
}

function warnOfSkipped(failed: readonly SkippedPair[]): void {
  const [first] = failed;
  if (first !== undefined) {
    process.emitWarning(
      `The near-duplicate check skipped ${String(failed.length)} pair(s) it could not compare. ` +
        `The first is ${first.units.join(' and ')}: ${first.reason}`,
    );
  }
}

export function nearDuplicateMatches(
  units: readonly FactUnit[],
  options: Pick<RuleContext, 'isExcepted'> & { readonly proveLogic?: ProveLogic },
): NearMatch[] {
  const { isExcepted } = options;
  const byId = new Map(units.map((unit) => [unitIdOf(unit), unit]));
  const rule = RULE_IDS.nearDuplicate;
  const failed: SkippedPair[] = [];
  const identified = units.map((unit) => ({ ...unit, id: unitIdOf(unit), final: false }));
  const findings = findNearDuplicates(identified, { failed, proveLogic: options.proveLogic });
  warnOfSkipped(failed);
  return findings
    .map((finding) => ({ finding, pair: sides(finding, byId) }))
    .filter(({ finding, pair }) => !isLeftToCloneAnalyzer(finding, pair))
    .filter(({ finding, pair }) => !isTypeSpecialized(finding, pair))
    .filter(({ pair }) => !isPlatformVariant(pair))
    .filter(({ pair }) => !pair.some(({ file }) => isExcepted(rule, file)));
}

export function nearDuplicateFindings(
  units: readonly FactUnit[],
  { analyzerName, isExcepted }: RuleContext,
): Finding[] {
  return nearDuplicateMatches(units, { isExcepted }).map(({ finding, pair }) =>
    nearDuplicateFinding(finding, { pair, analyzerName }),
  );
}
