import { unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkoutModuleUrl } from '../../../../../shared/paths/checkout-module.mjs';
import { trackTemporaryPath } from '../../typed/tooling.mts';
import {
  hasEncodedRegExp as untypedHasEncodedRegExp,
  revivedExpression as untypedRevivedExpression,
} from '../../../preset/project-tools/config-values.mjs';
import { projectToolLayer as untypedProjectToolLayer } from '../../../preset/project-tools/project-tool-policy.mjs';
import { KNIP_TOOL } from '../../../preset/project-tools/project-config-files.mjs';
import type { QualityAreaOptions } from '../typed/area-types.mts';
import { type KnipConfig, readHeadPolicy } from '../typed/policy.mts';
import { runNodeTool } from '../typed/tooling.mts';
import { type KnipLayer, layeredKnipConfig, writtenKnipConfig } from './knip-layers.mts';

const hasEncodedRegExp: (value: KnipConfig) => boolean = untypedHasEncodedRegExp;
const revivedExpression: (value: KnipConfig) => string = untypedRevivedExpression;
const projectToolLayer: (tool: string, settings: unknown) => KnipLayer | undefined =
  untypedProjectToolLayer;

const MANIFEST_GUARD = checkoutModuleUrl(new URL('manifest-guard.mjs', import.meta.url)).href;

function manifestGuard(manifestPath: string): string {
  const source = [
    `import { guardKnipManifest } from ${JSON.stringify(MANIFEST_GUARD)};`,
    `guardKnipManifest(${JSON.stringify(manifestPath)});`,
  ].join('\n');
  return `data:text/javascript,${encodeURIComponent(source)}`;
}
const CONFIG_BASENAME = '.nitpicker-diff-knip';

export function withProjectKnipConfig(config: KnipConfig): KnipConfig {
  return layeredKnipConfig(config, projectToolLayer(KNIP_TOOL, readHeadPolicy().tools.knip));
}

function configFile(projectRoot: string, config: KnipConfig): { path: string; text: string } {
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

export function knipReport(options: QualityAreaOptions, config: KnipConfig): unknown {
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
