import { MESSAGES, RULE_IDS } from '../../policy.mts';
import type { Finding } from '../../values/findings.mts';
import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';
import { exceptionText } from '../exceptions.mts';
import { messageParts } from '../facts/typed/message-parts.mts';
import type { CopyFindingContext, ReuseFindingDetails } from './typed/reuse-types.mts';

const MAX_LISTED = 3;

const RULE_IDS_BY_KEY: Readonly<Record<string, string>> = RULE_IDS;
const MESSAGES_BY_KEY: Readonly<Record<string, string>> = MESSAGES;

export function reuseFinding(
  analyzerName: string,
  { key, path: findingPath, identity, symbol, line, values }: ReuseFindingDetails,
): Finding {
  const rule = RULE_IDS_BY_KEY[key];
  const template = MESSAGES_BY_KEY[key];
  if (rule === undefined || template === undefined) {
    throw new TypeError(`"${key}" is not a reuse finding key`);
  }
  return {
    tool: analyzerName,
    rule,
    path: findingPath,
    identity,
    ...messageParts(template, {
      ...values,
      exception: exceptionText(rule, findingPath),
    }),
    classification: 'enforceable',
    ...(symbol === undefined ? {} : { symbol }),
    ...(line === undefined ? {} : { location: { line } }),
  };
}

export function listPaths(paths: readonly string[]): string {
  const listed = paths.slice(0, MAX_LISTED).join(', ');
  const rest = paths.length - MAX_LISTED;
  return rest > 0 ? `${listed} and ${String(rest)} more` : listed;
}

export function uniqueFindings(findings: readonly Finding[]): Finding[] {
  const unique = new Map(
    findings
      .toReversed()
      .map((finding) => [`${finding.rule}\0${finding.path}\0${finding.identity}`, finding]),
  );
  return [...unique.values()].toSorted(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.rule.localeCompare(right.rule) ||
      left.identity.localeCompare(right.identity),
  );
}

type TreeUnit = { readonly file: string; readonly tree?: TreeNode | undefined };

export function functionUnitRule<Unit extends TreeUnit>(
  rule: string,
  findingsOf: (unit: Unit, analyzerName: string) => Finding[],
): (units: readonly Unit[], context: CopyFindingContext) => Finding[] {
  return (units, { analyzerName, isExcepted }) =>
    units
      .filter((unit) => unit.tree?.kind === 'function' && !isExcepted(rule, unit.file))
      .flatMap((unit) => findingsOf(unit, analyzerName));
}

export function identityCounter(): (base: string) => string {
  const seen = new Map<string, number>();
  return function numbered(base: string): string {
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return `${base}#${String(count)}`;
  };
}
