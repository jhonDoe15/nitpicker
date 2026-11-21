import { HYGIENE_RULE_IDS } from '../../project-rules/hygiene-rules.mts';
import { exceptionHint } from '../rules.mts';
import { compareVersions, migrationSets } from './migration-files.mts';
import { revisionGraphs } from './revision-graph.mts';
import type { Migration, RevisionNode } from './migration-types.mts';
import type { RepositoryContext } from '../check-types.mts';
import type { Finding } from '../../values/findings.mts';

const RULE = HYGIENE_RULE_IDS.migrationOrder;
const ROOT = '\0root';

function orderFinding(
  tool: string,
  { file, key, text }: { readonly file: string; readonly key: string; readonly text: string },
): Finding {
  return {
    tool,
    rule: RULE,
    path: file,
    identity: `${RULE}|${key}`,
    message: `${text} ${exceptionHint(RULE, file)}`,
    classification: 'enforceable',
  };
}

function newestKept(
  baseMembers: ReadonlyMap<string, Migration>,
  headMembers: ReadonlyMap<string, Migration>,
): Migration | undefined {
  return [...baseMembers.values()]
    .filter(({ name }) => headMembers.has(name))
    .reduce<Migration | undefined>(
      (newest, member) =>
        newest === undefined || compareVersions(member.version, newest.version) > 0
          ? member
          : newest,
      undefined,
    );
}

function staleText(added: Migration, newest: Migration): string {
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

function orderedFindings(
  tool: string,
  headFiles: readonly string[],
  baseFiles: readonly string[],
): Finding[] {
  const baseSets = migrationSets(baseFiles);
  return [...migrationSets(headFiles)].flatMap(([set, headMembers]) => {
    const baseMembers = baseSets.get(set);
    if (baseMembers === undefined) {
      return [];
    }
    const newest = newestKept(baseMembers, headMembers);
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

function parentKey(node: RevisionNode): string {
  return node.parents[0] ?? ROOT;
}

function childrenByParent(nodes: ReadonlyMap<string, RevisionNode>): Map<string, RevisionNode[]> {
  const children = new Map<string, RevisionNode[]>();
  for (const node of nodes.values()) {
    for (const parent of node.parents.length === 0 ? [ROOT] : node.parents) {
      children.set(parent, [...(children.get(parent) ?? []), node]);
    }
  }
  return children;
}

function leaves(nodes: ReadonlyMap<string, RevisionNode>): RevisionNode[] {
  const parents = new Set([...nodes.values()].flatMap((node) => node.parents));
  return [...nodes.values()].filter((node) => !parents.has(node.id));
}

function forkText(
  node: RevisionNode,
  sibling: RevisionNode,
  baseNodes: ReadonlyMap<string, RevisionNode>,
): string {
  const after =
    node.parents.length === 0 ? 'starts a new history' : `follows ${node.parents[0] ?? ''}`;
  const tips = leaves(baseNodes);
  const [tip] = tips;
  const target =
    tips.length === 1 && tip !== undefined
      ? `the latest migration on the base branch, ${tip.id}`
      : 'the latest migration on the base branch';
  return [
    `Migration ${node.path} ${after}, but ${sibling.id} (${sibling.path}) already does on the base branch,`,
    'so the migration history splits into two heads and the migration command stops.',
    `Make it follow ${target}, or add a merge migration`,
    '(`alembic merge heads`, `manage.py makemigrations --merge`).',
  ].join(' ');
}

function forkFindings(
  tool: string,
  set: string,
  {
    headNodes,
    baseNodes,
  }: {
    readonly headNodes: ReadonlyMap<string, RevisionNode>;
    readonly baseNodes: ReadonlyMap<string, RevisionNode>;
  },
): Finding[] {
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

function graphFindings(
  tool: string,
  head: { readonly root: string; readonly files: readonly string[] },
  base: { readonly root: string; readonly files: readonly string[] },
): Finding[] {
  const baseGraphs = revisionGraphs(base.root, base.files);
  return [...revisionGraphs(head.root, head.files)].flatMap(([set, headNodes]) => {
    const baseNodes = baseGraphs.get(set);
    return baseNodes === undefined ? [] : forkFindings(tool, set, { headNodes, baseNodes });
  });
}

export function migrationOrderFindings(
  tool: string,
  {
    projectRoot,
    files,
    baselineRoot,
    baseFiles,
  }: Pick<RepositoryContext, 'projectRoot' | 'files' | 'baselineRoot' | 'baseFiles'>,
): Finding[] {
  if (baselineRoot === undefined || baseFiles === undefined) {
    return [];
  }
  return [
    ...orderedFindings(tool, files, baseFiles),
    ...graphFindings(tool, { root: projectRoot, files }, { root: baselineRoot, files: baseFiles }),
  ];
}
