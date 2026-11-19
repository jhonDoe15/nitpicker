import path from 'node:path';
import { lazy as untypedLazy } from '../../../../shared/rules/finding-helpers.mjs';
import {
  cycleText as untypedCycleText,
  memberCycles as untypedMemberCycles,
} from '../../../../shared/rules/generated-members/member-cycles.mjs';
import { offsetOf } from '../../adapters/review-rules/java-sources.mts';
import {
  fieldDeclaringClass,
  readJavaProject,
  resolveClass,
  typeReferences,
} from './java-project.mts';
import { MEMBERS, equalsWithoutSuper, generatedMember } from './lombok-members.mts';
import type {
  JavaClass,
  JavaField,
  JavaProject,
  JavaSource,
  LombokContext,
  MemberKind,
  ProjectClass,
} from './member-types.mts';

import { MEMBER_CYCLE_RULE, SKIPPED_SUPER_RULE } from './rule-names.mts';

type MemberEdge = {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  field: string;
  file: string;
  line: number;
  many: boolean;
};
type Cycle = readonly MemberEdge[];
type Generated = { klass: ProjectClass; included: (field: JavaField) => boolean };
type Closing = { text: string; kinds: MemberKind[] };
type Model = { project: () => JavaProject; closing: () => Map<string, Closing> };
type MemberFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly message: string;
  readonly location?: { readonly line: number; readonly column?: number } | undefined;
};
type Filter = <Finding extends MemberFinding>(finding: Finding, model: Model) => Finding[];

const lazy: <T>(read: () => T) => () => T = untypedLazy;
const memberCycles: (edges: MemberEdge[]) => { edge: MemberEdge; cycle: Cycle }[] =
  untypedMemberCycles;
const cycleText: (cycle: Cycle, edge: MemberEdge) => string = untypedCycleText;
const KINDS: readonly MemberKind[] = ['toString', 'equals'];

export { MEMBER_CYCLE_RULE, SKIPPED_SUPER_RULE };
export const GENERIC_CYCLE = 'a cycle of fields';
export const GENERIC_MEMBERS = 'The generated toString, equals and hashCode';
export const GENERIC_EXCLUDE = '@ToString.Exclude and @EqualsAndHashCode.Exclude';
export const GENERIC_SUPERCLASS = 'a project class';
const IDENTIFIER = /^[A-Za-z_$][\w$]*/u;

function contextOf(klass: ProjectClass): LombokContext {
  const { source } = klass;
  return { raw: source.raw, imported: source.imported, config: source.config };
}

function memberEdges(project: JavaProject, kind: MemberKind): MemberEdge[] {
  const generated = new Map(
    [...project.classes.values()].flatMap((klass): [string, Generated][] => {
      const included = generatedMember(klass, kind, contextOf(klass));
      return included === undefined ? [] : [[klass.qualified, { klass, included }]];
    }),
  );
  return [...generated.values()].flatMap(({ klass, included }) =>
    klass.fields.filter(included).flatMap((field) =>
      typeReferences(field.type).flatMap(({ name, many }) => {
        const target = resolveClass(name, { project, source: klass.source, klass });
        const to = target === undefined ? undefined : generated.get(target);
        return to === undefined
          ? []
          : [
              {
                from: klass.qualified,
                to: to.klass.qualified,
                fromName: klass.name,
                toName: to.klass.name,
                field: field.name,
                file: klass.source.file,
                line: field.line,
                many,
              },
            ];
      }),
    ),
  );
}

function fieldKey(file: string, line: number, name: string): string {
  return `${file}\0${String(line)}\0${name}`;
}

function closingFields(project: JavaProject): Map<string, Closing> {
  const closing = new Map<string, Closing>();
  for (const kind of KINDS) {
    for (const { edge, cycle } of memberCycles(memberEdges(project, kind))) {
      const key = fieldKey(edge.file, edge.line, edge.field);
      const found = closing.get(key) ?? { text: cycleText(cycle, edge), kinds: [] };
      closing.set(key, { ...found, kinds: [...found.kinds, kind] });
    }
  }
  return closing;
}

function nameAt(source: JavaSource, location: MemberFinding['location']): string | undefined {
  if (location?.column === undefined) {
    return undefined;
  }
  return IDENTIFIER.exec(source.raw.slice(offsetOf(source.raw, location)))?.[0];
}

function sourceOf(project: JavaProject, file: string): JavaSource | undefined {
  return project.sources.find((source) => source.file === file);
}

function cycleFinding<Finding extends MemberFinding>(finding: Finding, model: Model): Finding[] {
  const source = sourceOf(model.project(), finding.path);
  if (source === undefined) {
    return [];
  }
  const line = finding.location?.line;
  const named = nameAt(source, finding.location);
  const fields = source.classes
    .flatMap((klass) => klass.fields)
    .filter((field) => field.line === line && (named === undefined || field.name === named));
  const closing = fields
    .map((field) => model.closing().get(fieldKey(source.file, line ?? 0, field.name)))
    .find((found) => found !== undefined);
  if (closing === undefined) {
    return [];
  }
  const members = closing.kinds.map((kind) => MEMBERS[kind]);
  const message = finding.message
    .replace(GENERIC_MEMBERS, `The generated ${members.map(({ label }) => label).join(', ')}`)
    .replace(GENERIC_CYCLE, `the cycle ${closing.text}`)
    .replace(GENERIC_EXCLUDE, members.map(({ allowed }) => allowed).join(' and '));
  return [{ ...finding, message }];
}

function classAt(source: JavaSource, line: number): JavaClass | undefined {
  return source.classes
    .filter((klass) => klass.line <= line && klass.extendsName !== undefined)
    .toSorted((left, right) => right.line - left.line)[0];
}

function superFinding<Finding extends MemberFinding>(finding: Finding, model: Model): Finding[] {
  const project = model.project();
  const source = sourceOf(project, finding.path);
  const klass = source === undefined ? undefined : classAt(source, finding.location?.line ?? 0);
  if (source === undefined || klass === undefined) {
    return [];
  }
  const qualified = source.packageName === '' ? klass.name : `${source.packageName}.${klass.name}`;
  const known = project.classes.get(qualified);
  if (known === undefined || !equalsWithoutSuper(known, contextOf(known))) {
    return [];
  }
  const parent = resolveClass(klass.extendsName ?? '', { project, source, klass });
  const declaring = parent === undefined ? undefined : fieldDeclaringClass(parent, project);
  return declaring === undefined
    ? []
    : [{ ...finding, message: finding.message.replace(GENERIC_SUPERCLASS, declaring.name) }];
}

const FILTERS: Record<string, Filter> = {
  [MEMBER_CYCLE_RULE]: cycleFinding,
  [SKIPPED_SUPER_RULE]: superFinding,
};

function isGeneratedMemberRule(finding: MemberFinding): boolean {
  return finding.tool === 'pmd' && Object.hasOwn(FILTERS, finding.rule);
}

export function withGeneratedMembers<Finding extends MemberFinding>(
  findings: Finding[],
  { projectRoot }: { projectRoot: string | undefined },
): Finding[] {
  if (projectRoot === undefined || !findings.some(isGeneratedMemberRule)) {
    return findings;
  }
  const project = lazy(() => readJavaProject(path.resolve(projectRoot)));
  const model: Model = { project, closing: lazy(() => closingFields(project())) };
  return findings.flatMap((finding) =>
    isGeneratedMemberRule(finding) ? (FILTERS[finding.rule]?.(finding, model) ?? []) : [finding],
  );
}
