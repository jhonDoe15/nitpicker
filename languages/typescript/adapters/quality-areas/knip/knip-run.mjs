import { unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { trackTemporaryPath } from '../../../../../core/tooling/temporary-files.mjs';
import { readHeadPolicy } from '../../../preset/head-policy.mjs';
import {
  hasEncodedRegExp,
  revivedExpression,
} from '../../../preset/project-tools/config-values.mjs';
import { projectToolLayer } from '../../../preset/project-tools/project-tool-policy.mjs';
import { KNIP_TOOL } from '../../../preset/project-tools/project-config-files.mjs';
import { runNodeTool } from '../runners/tooling.mjs';
import { layeredKnipConfig, writtenKnipConfig } from './knip-layers.mjs';

const MANIFEST_GUARD = pathToFileURL(path.join(import.meta.dirname, 'manifest-guard.mjs')).href;

function manifestGuard(manifestPath) {
  const source = [
    `import { guardKnipManifest } from ${JSON.stringify(MANIFEST_GUARD)};`,
    `guardKnipManifest(${JSON.stringify(manifestPath)});`,
  ].join('\n');
  return `data:text/javascript,${encodeURIComponent(source)}`;
}
const CONFIG_BASENAME = '.nitpicker-diff-knip';

export function withProjectKnipConfig(config) {
  return layeredKnipConfig(config, projectToolLayer(KNIP_TOOL, readHeadPolicy().tools.knip));
}

function configFile(projectRoot, config) {
  const written = writtenKnipConfig(config);
  return hasEncodedRegExp(written)
    ? {
        path: path.join(projectRoot, `${CONFIG_BASENAME}.mjs`),
        text: `export default ${revivedExpression(written)};\n`,
      }
    : {
        path: path.join(projectRoot, `${CONFIG_BASENAME}.json`),
        text: `${JSON.stringify(written, null, 2)}\n`,
      };
}

export function knipReport(options, config) {
  const file = configFile(options.projectRoot, config);
  trackTemporaryPath(file.path);
  writeFileSync(file.path, file.text);
  try {
    const result = runNodeTool({
      options,
      relativeToolPath: 'knip/bin/knip.js',
      nodeArguments: ['--import', manifestGuard(path.join(options.projectRoot, 'package.json'))],
      arguments_: ['--config', file.path, '--reporter', 'json'],
      acceptedStatuses: [0, 1],
    });
    return JSON.parse(result.stdout);
  } finally {
    unlinkSync(file.path);
  }
}
