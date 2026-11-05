import { HYGIENE_RULE_IDS } from '../../project-rules/hygiene-rules.mjs';
import { exceptionHint } from '../rules.mjs';
import { compareVersions, migrationSets } from './migration-files.mjs';
import { revisionGraphs } from './revision-graph.mjs';

const RULE = HYGIENE_RULE_IDS.migrationOrder;
const ROOT = '\0root';

function orderFinding(tool, { file, key, text }) {
  return {
    tool,
    rule: RULE,
    path: file,
    identity: `${RULE}|${key}`,
    message: `${text} ${exceptionHint(RULE, file)}`,
    classification: 'enforceable',
  };
}

function newestKept(baseMembers, headMembers) {
  return [...baseMembers.values()]
    .filter(({ name }) => headMembers.has(name))
    .reduce(
      (newest, member) =>
        newest === undefined || compareVersions(member.version, newest.version) > 0
          ? member
          : newest,
      undefined,
    );
}

function staleText(added, newest) {
  const relation =
    compareVersions(added.version, newest.version) === 0
      ? 'has the same version as'
      : 'sorts before';
  return [
    `Migration ${added.path} (version ${added.label}) ${relation} ${newest.name},`,
    `the newest migration in ${added.set}/ on the base branch.`,
    'A database that already ran that one skips this one, refuses to start or runs it out of order.',
    `Give it a version after ${newest.label}: create it again with the migration tool,`,
    'or rename it with the next version or the current timestamp.',
  ].join(' ');
}

function orderedFindings(tool, headFiles, baseFiles) {
  const baseSets = migrationSets(baseFiles);
  return [...migrationSets(headFiles)].flatMap(([set, headMembers]) => {
    const baseMembers = baseSets.get(set);
    const newest = baseMembers === undefined ? undefined : newestKept(baseMembers, headMembers);
    if (newest === undefined) {
      return [];
    }
    return [...headMembers.values()]
      .filter((member) => !baseMembers.has(member.name))
      .filter((member) => compareVersions(member.version, newest.version) <= 0)
      .map((member) =>
        orderFinding(tool, {
          file: member.path,
          key: `${set}|${member.name}`,
          text: staleText(member, newest),
        }),
      );
  });
}

function parentKey(node) {
  return node.parents[0] ?? ROOT;
}

function childrenByParent(nodes) {
  const children = new Map();
  for (const node of nodes.values()) {
    for (const parent of node.parents.length === 0 ? [ROOT] : node.parents) {
      children.set(parent, [...(children.get(parent) ?? []), node]);
    }
  }
  return children;
}

function leaves(nodes) {
  const parents = new Set([...nodes.values()].flatMap((node) => node.parents));
  return [...nodes.values()].filter((node) => !parents.has(node.id));
}

function forkText(node, sibling, baseNodes) {
  const after = node.parents.length === 0 ? 'starts a new history' : `follows ${node.parents[0]}`;
  const tips = leaves(baseNodes);
  const target =
    tips.length === 1
      ? `the latest migration on the base branch, ${tips[0].id}`
      : 'the latest migration on the base branch';
  return [
    `Migration ${node.path} ${after}, but ${sibling.id} (${sibling.path}) already does on the base branch,`,
    'so the migration history splits into two heads and the migration command stops.',
    `Make it follow ${target}, or add a merge migration`,
    '(`alembic merge heads`, `manage.py makemigrations --merge`).',
  ].join(' ');
}

function forkFindings(tool, set, { headNodes, baseNodes }) {
  if (leaves(headNodes).length <= Math.max(1, leaves(baseNodes).length)) {
    return [];
  }
  const baseChildren = childrenByParent(baseNodes);
  return [...headNodes.values()]
    .filter((node) => !baseNodes.has(node.id) && !node.starts && node.parents.length <= 1)
    .flatMap((node) => {
      const sibling = (baseChildren.get(parentKey(node)) ?? []).find(
        (child) => child.id !== node.id && headNodes.has(child.id),
      );
      return sibling === undefined
        ? []
        : [
            orderFinding(tool, {
              file: node.path,
              key: `${set}|${node.id}`,
              text: forkText(node, sibling, baseNodes),
            }),
          ];
    });
}

function graphFindings(tool, head, base) {
  const baseGraphs = revisionGraphs(base.root, base.files);
  return [...revisionGraphs(head.root, head.files)].flatMap(([set, headNodes]) => {
    const baseNodes = baseGraphs.get(set);
    return baseNodes === undefined ? [] : forkFindings(tool, set, { headNodes, baseNodes });
  });
}

export function migrationOrderFindings(tool, { projectRoot, files, baselineRoot, baseFiles }) {
  if (baselineRoot === undefined || baseFiles === undefined) {
    return [];
  }
  return [
    ...orderedFindings(tool, files, baseFiles),
    ...graphFindings(tool, { root: projectRoot, files }, { root: baselineRoot, files: baseFiles }),
  ];
}
