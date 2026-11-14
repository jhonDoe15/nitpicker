import path from 'node:path';
import { withLineEndingOf } from '../../../../../../shared/fix/recipes/extract/text.mjs';
import { outcomeOf } from '../../../../../../shared/fix/recipes/extract/outcomes.mjs';
import { indentUnit } from '../java-extract.mjs';
import { nameCollisions, suppressions } from '../syntax.mjs';
import { crossExtraction } from './cross-extract.mjs';
import { droppedImports, headerOf, importsFor, packageOf } from './imports.mjs';
import { classNameFor, classText, diskProblem } from './shared-class.mjs';

const WORD = /[\p{L}_$][\p{L}\p{N}_$]*/gu;
const NO_NAME = 'the class names of the copies share no word to name a shared class after';
const PACKAGES = 'the copies are in different packages';

function ownerName(method) {
  return method.parent.parent.childForFieldName('name').text;
}

function groupProblem(group, root) {
  const [first, second] = group.sources;
  if (packageOf(first.rootNode) !== packageOf(second.rootNode)) {
    return PACKAGES;
  }
  const name = classNameFor(group.methods.map(ownerName));
  if (name === undefined) {
    return NO_NAME;
  }
  const folder = path.posix.dirname(first.file) === '.' ? '' : path.posix.dirname(first.file);
  const used = [first, second].some(({ rootNode }) => nameCollisions(rootNode).has(name));
  const disk = used ? `the name ${name} is used in a copy` : diskProblem({ root, folder, name });
  return disk === undefined ? { name, folder } : disk;
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
      new Set(members.flatMap((member) => member.match(WORD) ?? [])),
    ),
    name: found.name,
    members,
    unit: indentUnit(methods[0], sources[0].text),
    annotations: suppressions(methods[0].parent.parent),
  });
  const file = path.posix.join(found.folder, `${found.name}.java`);
  return { type: 'write', path: file, text: withLineEndingOf(sources[0].text, text) };
}

function importEdits({ sources }, bodies) {
  return sources.flatMap(({ file, rootNode, text }) =>
    droppedImports(
      rootNode,
      text,
      bodies.filter(({ path: edited }) => edited === file),
    ).map((edit) => ({ type: 'replace', path: file, ...edit })),
  );
}

function groupOutcomes(group, root) {
  const found = groupProblem(group, root);
  if (typeof found === 'string') {
    return group.candidates.map((candidate) => outcomeOf(candidate, { declined: found }));
  }
  const claimed = new Set([found.name]);
  const results = group.candidates.map((candidate, index) =>
    crossExtraction({
      methods: group.pairs[index],
      sources: group.sources,
      label: candidate.first.name,
      engineHoles: candidate.finding.parameters.length,
      claimed,
      names: { className: found.name },
    }),
  );
  const done = results.filter(({ edits }) => edits !== undefined);
  const conflict = done.length > 0 && mergedInterfaces(done) === undefined;
  const kept = conflict ? [] : done;
  const notes = results.flatMap((result, index) =>
    kept.includes(result)
      ? []
      : [outcomeOf(group.candidates[index], { declined: result.declined ?? NO_NAME })],
  );
  if (kept.length === 0) {
    return notes;
  }
  const first = group.candidates[results.indexOf(kept[0])];
  const bodies = kept.flatMap((result) => result.edits);
  const edits = [...bodies, ...importEdits(group, bodies), assembled(group, found, kept)];
  return [outcomeOf(first, { edits }), ...notes];
}

export function crossOutcomes(pending, root) {
  const groups = new Map();
  for (const { candidate, methods, sources } of pending) {
    const key = `${candidate.first.file}\u0000${candidate.second.file}`;
    const group = groups.get(key) ?? { sources, candidates: [], pairs: [], methods };
    group.candidates.push(candidate);
    group.pairs.push(methods);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) => groupOutcomes(group, root));
}
