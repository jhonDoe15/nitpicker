import path from 'node:path';
import type { Finding } from '../../../adapters/static-checks/shared.mts';
import { isExplainedCycle } from '../../../../../shared/graph/explained-cycles.mts';
import { stronglyConnected } from '../../../../../shared/graph/strongly-connected.mts';
import { featureCycleAnalysis } from '../../../../../shared/rules/features/feature-cycles.mts';
import {
  PUBLIC_FACES,
  featureRoleContract,
  isFeatureSide,
} from '../../../../../shared/rules/features/feature-roles.mts';
import { listed } from '../../../../../shared/rules/features/feature-boundaries.mts';
import { exceptionHint } from '../../../../../shared/rules/exceptions.mts';
import type { FeatureView, FolderEdge, ImportEdge } from './cycle-views.mts';

const RULE = 'package-cycle';

type Options = {
  readonly analyzerName: string;
  readonly isExcepted: (rule: string, ...candidates: string[]) => boolean;
  readonly layout: unknown;
  readonly files: readonly string[];
};

function folderOf(file: string): string {
  return path.posix.dirname(file);
}

function isNested(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function featureView(edges: readonly ImportEdge[], options: Options): FeatureView {
  const roleOf = featureRoleContract(options.layout, PUBLIC_FACES.typescript);
  const { cycles } = featureCycleAnalysis(
    { imports: edges.map((edge) => ({ ...edge, role: 'production' })) },
    { analyzerName: options.analyzerName, isExcepted: options.isExcepted, roleOf },
  );
  return {
    explainedCycles: cycles,
    featureOf: (file) => {
      const role = file === undefined ? undefined : roleOf(file);
      return role !== undefined && isFeatureSide(role) ? role.directory : undefined;
    },
  };
}

function anchorsOf(files: readonly string[]): Map<string, string> {
  const anchors = new Map<string, string>();
  for (const file of [...new Set(files)].sort((left, right) => left.localeCompare(right))) {
    if (!anchors.has(folderOf(file))) {
      anchors.set(folderOf(file), file);
    }
  }
  return anchors;
}

function folderFinding(
  { folder, others, anchor }: { folder: string; others: readonly string[]; anchor: string },
  analyzerName: string,
): Finding {
  return {
    tool: analyzerName,
    rule: RULE,
    path: anchor,
    identity: `cycle:${folder}`,
    message:
      `Folder ${folder} is in a dependency cycle with ${listed(others)}. ` +
      'Move the shared types down into one of them, or invert one dependency behind an interface. ' +
      exceptionHint(RULE, anchor),
    classification: 'enforceable',
  };
}

export function folderCycleFindings(imports: readonly ImportEdge[], options: Options): Finding[] {
  const runtime = imports.filter(({ from, to, typeOnly }) => !typeOnly && from !== to);
  const anchors = anchorsOf([...options.files, ...runtime.flatMap(({ from, to }) => [from, to])]);
  const packaged: FolderEdge[] = runtime
    .map(({ from, to }) => ({
      source: folderOf(from),
      target: folderOf(to),
      files: `${from}\0${to}`,
    }))
    .filter(({ source, target }) => !isNested(source, target));
  const components = stronglyConnected([...anchors.keys()], packaged);
  if (components.length === 0) {
    return [];
  }
  const features = featureView(runtime, options);
  return components
    .filter(
      (members) =>
        !isExplainedCycle(members, {
          packaged,
          anchor: new Map(members.map((member) => [member, anchors.get(member) ?? member])),
          features,
        }),
    )
    .flatMap((members) =>
      members.map((folder) => ({
        folder,
        others: members.filter((other) => other !== folder),
        anchor: anchors.get(folder) ?? folder,
      })),
    )
    .filter(({ anchor }) => !options.isExcepted(RULE, anchor))
    .map((entry) => folderFinding(entry, options.analyzerName));
}
