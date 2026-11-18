import path from 'node:path';
import type { Node } from 'web-tree-sitter';
import type {
  Attempt,
  CrossContext,
  CrossGroup,
  CrossPending,
  Edit,
  Extracted,
  NameFound,
  Outcome,
  OwnedEdit,
  PathEdit,
  ReplaceEdit,
  Scan,
  TypeSources,
  WriteEdit,
} from '../../extract-types.mts';
import { outcomeOf, withLineEndingOf } from '../../jvm-views.mts';
import { indentUnit } from '../java-extract.mts';
import { nameCollisions, pairOf, parentOf, present, required, suppressions } from '../syntax.mts';
import { crossExtraction } from './cross-extract.mts';
import { codeOf, headerOf, importsFor, meaningProblem, packageOf } from './names/imports.mts';
import { inheritedProblem } from './names/inherited.mts';
import { importEditing } from './names/qualified.mts';
import {
  classNameFor,
  classText,
  diskProblem,
  folderTypes,
  packageFolders,
} from './shared-class.mts';

const WORD = /[\p{L}_$][\p{L}\p{N}_$]*/gu;
const NO_NAME = 'the class names of the copies share no word to name a shared class after';
const INTERFACES = 'the copies need two different interfaces of the same name';
const SUPPRESSIONS = 'the copies carry different @SuppressWarnings annotations';
const PACKAGES = 'the copies are in different packages';
const CLASSES = 'the pairs of the two files are in different classes';

function ownerName(method: Node): string {
  return required(parentOf(parentOf(method)), 'name').text;
}

function differ(nodes: readonly Node[]): boolean {
  return new Set(nodes.map((node) => suppressions(node).join('\n'))).size > 1;
}

function suppressionProblem({ pairs }: CrossGroup): boolean {
  return (
    differ(present(pairs[0]).map((method) => parentOf(parentOf(method)))) || pairs.some(differ)
  );
}

function inOneClassEach({ pairs }: CrossGroup): boolean {
  return present(pairs[0]).every(
    (_method, side) =>
      new Set(pairs.map((pair) => parentOf(parentOf(present(pair[side]))).startIndex)).size === 1,
  );
}

function nameProblem(group: CrossGroup, scan: Scan, name: string): NameFound | string {
  const [first, second] = group.sources;
  const folder = path.posix.dirname(first.file) === '.' ? '' : path.posix.dirname(first.file);
  const pack = packageOf(first.rootNode);
  const used = [first, second].some(({ rootNode }) => nameCollisions(rootNode).has(name));
  const disk = used
    ? `the name ${name} is used in a copy`
    : diskProblem({ scan, folders: scan.everySet(folder, pack), name });
  return disk === undefined ? { name, folder, folders: packageFolders(folder, pack) } : disk;
}

function groupProblem(group: CrossGroup, scan: Scan): NameFound | string {
  const [first, second] = group.sources;
  if (packageOf(first.rootNode) !== packageOf(second.rootNode)) {
    return PACKAGES;
  }
  if (!inOneClassEach(group)) {
    return CLASSES;
  }
  if (suppressionProblem(group)) {
    return SUPPRESSIONS;
  }
  const name = classNameFor(pairOf(group.methods.map(ownerName)));
  return name === undefined ? NO_NAME : nameProblem(group, scan, name);
}

function mergedInterfaces(extractions: readonly Extracted[]): string[] | undefined {
  const entries = extractions.flatMap(({ interfaces }) =>
    interfaces.map(({ name, text }): [string, string] => [name, text]),
  );
  const found = new Map(entries);
  const consistent = entries.every(([name, text]) => found.get(name) === text);
  return consistent ? [...found.values()] : undefined;
}

function assembled(
  group: CrossGroup,
  found: NameFound,
  extractions: readonly Extracted[],
): WriteEdit {
  const { sources, methods } = group;
  const members = [
    ...extractions.map(({ member }) => member),
    ...present(mergedInterfaces(extractions)),
  ];
  const text = classText({
    header: headerOf(sources[0].rootNode),
    packageLine: packageOf(sources[0].rootNode),
    imports: importsFor(
      sources[0].rootNode,
      new Set(members.flatMap((member) => codeOf(member).match(WORD) ?? [])),
    ),
    name: found.name,
    members,
    unit: indentUnit(methods[0], sources[0].text),
    annotations: suppressions(parentOf(parentOf(methods[0]))),
  });
  const file = path.posix.join(found.folder, `${found.name}.java`);
  return { type: 'write', path: file, text: withLineEndingOf(sources[0].text, text) };
}

function plainEdit(edit: OwnedEdit): ReplaceEdit {
  return { type: edit.type, path: edit.path, start: edit.start, end: edit.end, text: edit.text };
}

function sourceEdits(
  { sources }: CrossGroup,
  bodies: readonly OwnedEdit[],
): { declined: string | undefined; bodies: OwnedEdit[]; extras: ReplaceEdit[] } {
  const results = sources.map(({ file, rootNode, text }) => {
    const own = bodies.filter(({ path: edited }) => edited === file);
    const done = importEditing(rootNode, text, own);
    function withFile(edit: Edit): ReplaceEdit {
      return { type: 'replace', path: file, ...edit };
    }
    return {
      declined: done.declined,
      bodies: (done.edits ?? []).slice(0, own.length).map((edit, index) => ({
        ...withFile(edit),
        owner: present(own[index]).owner,
      })),
      extras: (done.edits ?? []).slice(own.length).map(withFile),
    };
  });
  return {
    declined: results.find((result) => result.declined !== undefined)?.declined,
    bodies: results.flatMap((result) => result.bodies),
    extras: results.flatMap((result) => result.extras),
  };
}

function declinedAll(group: CrossGroup, declined: string): Outcome[] {
  return group.candidates.map((candidate) => outcomeOf(candidate, { declined }));
}

function isExtracted(result: Attempt<Extracted>): result is Extracted {
  return result.edits !== undefined;
}

function extractedAll(
  group: CrossGroup,
  found: NameFound,
  typeSources: TypeSources,
): { results: Attempt<Extracted>[]; kept: Extracted[]; conflict: boolean } {
  const claimed = new Set([found.name]);
  const results = group.candidates.map((candidate, index) =>
    crossExtraction({
      methods: present(group.pairs[index]),
      sources: group.sources,
      label: candidate.first.name,
      engineHoles: candidate.finding.parameters.length,
      claimed,
      typeSources,
      names: { className: found.name },
    }),
  );
  const done = results.filter(isExtracted);
  const conflict = done.length > 0 && mergedInterfaces(done) === undefined;
  return { results, kept: conflict ? [] : done, conflict };
}

function declinedNotes(
  group: CrossGroup,
  {
    results,
    kept,
    conflict,
  }: { results: Attempt<Extracted>[]; kept: readonly Attempt<Extracted>[]; conflict: boolean },
): Outcome[] {
  return results.flatMap((result, index) =>
    kept.includes(result)
      ? []
      : [
          outcomeOf(present(group.candidates[index]), {
            declined: result.declined ?? (conflict ? INTERFACES : NO_NAME),
          }),
        ],
  );
}

function fixesOf(
  group: CrossGroup,
  found: NameFound,
  { results, kept }: { results: Attempt<Extracted>[]; kept: Extracted[] },
): Attempt<{ outcomes: Outcome[] }> {
  const tagged = kept.flatMap((result, owner) => result.edits.map((edit) => ({ ...edit, owner })));
  const rewritten = sourceEdits(group, tagged);
  if (rewritten.declined !== undefined) {
    return { declined: rewritten.declined };
  }
  const reported = kept.map(
    (result) => present(group.candidates[results.indexOf(result)]).reported,
  );
  const edits: PathEdit[] = [
    ...rewritten.bodies.map(plainEdit),
    ...rewritten.extras,
    assembled(group, found, kept),
  ];
  return {
    outcomes: [{ fix: { finding: present(reported[0]), edits, alsoFixes: reported.slice(1) } }],
  };
}

function groupOutcomes(group: CrossGroup, context: CrossContext): Outcome[] {
  const { scan, typeSources } = context;
  const found = groupProblem(group, context.scan);
  if (typeof found === 'string') {
    return declinedAll(group, found);
  }
  const extracted = extractedAll(group, found, typeSources);
  const notes = declinedNotes(group, extracted);
  if (extracted.kept.length === 0) {
    return notes;
  }
  const texts = extracted.kept.flatMap(({ member, interfaces }) => [
    member,
    ...interfaces.map(({ text }) => text),
  ]);
  const meaning =
    meaningProblem({ sources: group.sources, texts, siblings: folderTypes(scan, found.folders) }) ??
    inheritedProblem({ methods: group.pairs.flat(), texts, typeSources });
  const done = meaning === undefined ? fixesOf(group, found, extracted) : { declined: meaning };
  return done.declined === undefined
    ? [...done.outcomes, ...notes]
    : declinedAll(group, done.declined);
}

export function crossOutcomes(pending: readonly CrossPending[], context: CrossContext): Outcome[] {
  const groups = new Map<string, CrossGroup>();
  for (const { candidate, methods, sources } of pending) {
    const key = `${candidate.first.file}\u0000${candidate.second.file}`;
    const group = groups.get(key) ?? { sources, candidates: [], pairs: [], methods };
    group.candidates.push(candidate);
    group.pairs.push(methods);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) => groupOutcomes(group, context));
}
