import path from 'node:path';
import { comparisonPolicy } from '../resolve.mjs';

export function comparedConventions({ root, config, directory = '', resolvers }) {
  const chunks = [];
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
  return { conventions: policy.conventions, printed: chunks.join('') };
}
