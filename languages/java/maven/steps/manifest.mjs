import { writeFileSync } from 'node:fs';
import path from 'node:path';

export function writeManifest(context) {
  const { module, reportRoot, relative, versions, spring } = context;
  writeFileSync(
    path.join(reportRoot, 'manifest.json'),
    JSON.stringify({
      versions,
      moduleKey: module.key,
      sourceRoots: module.sourceRoots.map((root) => relative(root)),
      testSourceRoots: module.testSourceRoots.map((root) => relative(root)),
      resourceRoots: module.resourceRoots.map((root) => relative(root)),
      spring,
    }),
  );
}
