import path from 'node:path';
import { comparisonPolicy, snapshotPolicy } from '../resolve.mts';
import type {
  ComparedRequest as Request,
  ComparedResult as Result,
  ComparisonRun,
} from '../typed/convention-types.mts';

export function comparedConventions({ root, config, directory = '', resolvers }: Request): Result {
  const chunks: string[] = [];
  const projectRoot = path.join(root, directory);
  const policy = comparisonPolicy(
    {
      config,
      currentProjectRoot: projectRoot,
      headPolicy: resolvers.resolveHeadPolicy(config, projectRoot),
      stdout: { write: (chunk) => chunks.push(chunk) },
      repositoryRoot: root,
      base: { baseRef: 'main' },
    },
    resolvers.resolveComparison,
  );
  return { conventions: policy['conventions'], printed: chunks.join('') };
}

export function followedConventions(
  request: Omit<ComparisonRun, 'repositoryRoot' | 'base' | 'stdout'>,
): Result {
  const chunks: string[] = [];
  const policy = snapshotPolicy({ ...request, stdout: { write: (chunk) => chunks.push(chunk) } });
  return { conventions: policy['conventions'], printed: chunks.join('') };
}
