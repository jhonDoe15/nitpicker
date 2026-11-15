import path from 'node:path';
import { withLineEndingOf } from '../../../../../../shared/fix/recipes/extract/text.mjs';
import { outcomeOf } from '../../../../../../shared/fix/recipes/extract/outcomes.mjs';
import { indentUnit } from '../java-extract.mjs';
import { nameCollisions, suppressions } from '../syntax.mjs';
import { crossExtraction } from './cross-extract.mjs';
import { codeOf, headerOf, importsFor, meaningProblem, packageOf } from './names/imports.mjs';
import { inheritedProblem } from './names/inherited.mjs';
import { importEditing } from './names/qualified.mjs';
import {
  classNameFor,
  classText,
  diskProblem,
  folderTypes,
  packageFolders,
} from './shared-class.mjs';

const WORD = /[\p{L}_$][\p{L}\p{N}_$]*/gu;
const NO_NAME = 'the class names of the copies share no word to name a shared class after';
const INTERFACES = 'the copies need two different interfaces of the same name';
const SUPPRESSIONS = 'the copies carry different @SuppressWarnings annotations';
const PACKAGES = 'the copies are in different packages';
const CLASSES = 'the pairs of the two files are in different classes';

function ownerName(method) {
  return method.parent.parent.childForFieldName('name').text;
}

function differ(nodes) {
  return new Set(nodes.map((node) => suppressions(node).join('\n'))).size > 1;
}

function suppressionProblem({ pairs }) {
  return differ(pairs[0].map((method) => method.parent.parent)) || pairs.some(differ);
}

function inOneClassEach({ pairs }) {
  return pairs[0].every(
    (_method, side) => new Set(pairs.map((pair) => pair[side].parent.parent.startIndex)).size === 1,
  );
}

function nameProblem(group, scan, name) {
  const [first, second] = group.sources;
  const folder = path.posix.dirname(first.file) === '.' ? '' : path.posix.dirname(first.file);
  const pack = packageOf(first.rootNode);
  const used = [first, second].some(({ rootNode }) => nameCollisions(rootNode).has(name));
  const disk = used
    ? `the name ${name} is used in a copy`
    : diskProblem({ scan, folders: scan.everySet(folder, pack), name });
  return disk === undefined ? { name, folder, folders: packageFolders(folder, pack) } : disk;
}

function groupProblem(group, scan) {
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
  const name = classNameFor(group.methods.map(ownerName));
  return name === undefined ? NO_NAME : nameProblem(group, scan, name);
}

function mergedInterfaces(extractions) {
  const entries = extractions.flatMap(({ interfaces }) =>
    interfaces.map(({ name, text }) => [name, text]),
  );
  const found = new Map(entries);
  const consistent = entries.every(([name, text]) => found.get(name) === text);
  return consistent ? [...found.values()] : undefined;
}

function assembled(group, found, extractions) {
  const { sources, methods } = group;
  const members = [...extractions.map(({ member }) => member), ...mergedInterfaces(extractions)];
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
    annotations: suppressions(methods[0].parent.parent),
  });
  const file = path.posix.join(found.folder, `${found.name}.java`);
  return { type: 'write', path: file, text: withLineEndingOf(sources[0].text, text) };
}

function plainEdit(edit) {
  return Object.fromEntries(Object.entries(edit).filter(([key]) => key !== 'owner'));
}

function sourceEdits({ sources }, bodies) {
  const results = sources.map(({ file, rootNode, text }) => {
    const own = bodies.filter(({ path: edited }) => edited === file);
    const done = importEditing(rootNode, text, own);
    function withFile(edit) {
      return { type: 'replace', path: file, ...edit };
    }
    return {
      declined: done.declined,
      bodies: (done.edits ?? []).slice(0, own.length).map((edit, index) => ({
        ...withFile(edit),
        owner: own[index].owner,
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

function declinedAll(group, declined) {
  return group.candidates.map((candidate) => outcomeOf(candidate, { declined }));
}

function extractedAll(group, found, typeSources) {
  const claimed = new Set([found.name]);
  const results = group.candidates.map((candidate, index) =>
    crossExtraction({
      methods: group.pairs[index],
      sources: group.sources,
      label: candidate.first.name,
      engineHoles: candidate.finding.parameters.length,
      claimed,
      typeSources,
      names: { className: found.name },
    }),
  );
  const done = results.filter(({ edits }) => edits !== undefined);
  const conflict = done.length > 0 && mergedInterfaces(done) === undefined;
  return { results, kept: conflict ? [] : done, conflict };
}

function declinedNotes(group, { results, kept, conflict }) {
  return results.flatMap((result, index) =>
    kept.includes(result)
      ? []
      : [
          outcomeOf(group.candidates[index], {
            declined: result.declined ?? (conflict ? INTERFACES : NO_NAME),
          }),
        ],
  );
}

function fixesOf(group, found, { results, kept }) {
  const tagged = kept.flatMap((result, owner) => result.edits.map((edit) => ({ ...edit, owner })));
  const rewritten = sourceEdits(group, tagged);
  if (rewritten.declined !== undefined) {
    return { declined: rewritten.declined };
  }
  const reported = kept.map((result) => group.candidates[results.indexOf(result)].reported);
  const edits = [
    ...rewritten.bodies.map(plainEdit),
    ...rewritten.extras,
    assembled(group, found, kept),
  ];
  return { outcomes: [{ fix: { finding: reported[0], edits, alsoFixes: reported.slice(1) } }] };
}

function groupOutcomes(group, context) {
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

export function crossOutcomes(pending, context) {
  const groups = new Map();
  for (const { candidate, methods, sources } of pending) {
    const key = `${candidate.first.file}\u0000${candidate.second.file}`;
    const group = groups.get(key) ?? { sources, candidates: [], pairs: [], methods };
    group.candidates.push(candidate);
    group.pairs.push(methods);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) => groupOutcomes(group, context));
}
