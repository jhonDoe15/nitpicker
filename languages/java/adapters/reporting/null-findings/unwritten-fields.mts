import { classAt, lastCode, type JavaClass } from '../source-facts/java-model.mts';
import { sourceIndex, type IndexRoots, type SourceIndex } from '../source-facts/source-index.mts';
import { viewOf, type Finding } from '../source-facts/finding-view.mts';
import { boundTypes, classesByName } from './bound-types.mts';

const SPOTBUGS_RULES = new Set([
  'NP_UNWRITTEN_FIELD',
  'NP_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD',
  'UWF_UNWRITTEN_FIELD',
  'UWF_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD',
]);
const NULLAWAY_FIELD = /field '[^']*' not initialized/u;

function isUnwrittenField(finding: Finding): boolean {
  if (finding.tool === 'spotbugs') {
    return SPOTBUGS_RULES.has(String(finding.rule)) && finding.field !== undefined;
  }
  return (
    finding.tool === 'errorprone' &&
    finding.rule === 'NullAway' &&
    NULLAWAY_FIELD.test(String(finding.message))
  );
}

function enclosingOf(finding: Finding, index: SourceIndex): JavaClass | undefined {
  const source = typeof finding.path === 'string' ? index.source(finding.path) : undefined;
  const line = finding.location?.line;
  return source === undefined || typeof line !== 'number'
    ? undefined
    : classAt(source, lastCode(source.clean, line));
}

function declaring(name: string, byName: ReadonlyMap<string, JavaClass[]>): JavaClass[] {
  return [...byName.values()]
    .flat()
    .filter((found) =>
      found.members.some((member) => member.kind === 'field' && member.name === name),
    );
}

function ownersOf(finding: Finding, facts: Facts): string[] {
  const enclosing = enclosingOf(finding, facts.index);
  if (finding.tool !== 'spotbugs') {
    return enclosing === undefined ? [] : [enclosing.name];
  }
  if (finding.owner !== undefined && finding.owner !== '') {
    return [finding.owner];
  }
  return finding.field === undefined
    ? []
    : declaring(finding.field, facts.byName).map((candidate) => candidate.name);
}

type Facts = {
  readonly index: SourceIndex;
  readonly byName: ReadonlyMap<string, JavaClass[]>;
  readonly bound: ReadonlySet<string>;
};

function isBound(finding: Finding, facts: Facts): boolean {
  const owners = ownersOf(finding, facts);
  return owners.length > 0 && owners.every((owner) => facts.bound.has(owner));
}

export function withoutBoundFields(findings: readonly unknown[], roots: IndexRoots): unknown[] {
  if (!findings.some((finding) => isUnwrittenField(viewOf(finding)))) {
    return [...findings];
  }
  const index = sourceIndex(roots);
  const byName = classesByName(index);
  const facts = { index, byName, bound: boundTypes(index, byName) };
  return findings.filter((finding) => {
    const view = viewOf(finding);
    return !(isUnwrittenField(view) && isBound(view, facts));
  });
}
