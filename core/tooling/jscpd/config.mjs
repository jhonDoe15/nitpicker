import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isPlainObject } from '../../../shared/config.mjs';
import { readHeadPolicyFile } from '../../../shared/head-policy.mjs';

export function resolveJscpdPolicy(settings, projectRoot) {
  if (!settings?.precedence?.includes('project')) return settings;
  const file = path.join(projectRoot, '.jscpd.json');
  const relative = path.relative(realpathSync(projectRoot), realpathSync(file));
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('.jscpd.json must stay inside the project');
  }
  const text = readFileSync(file, 'utf8');
  const projectConfig = JSON.parse(text);
  if (!isPlainObject(projectConfig)) throw new Error('.jscpd.json must contain a JSON object');
  return {
    ...settings,
    projectConfig,
    projectConfigDigest: createHash('sha256').update(text).digest('hex'),
  };
}

export function layeredJscpdConfig(base, settings = readHeadPolicyFile().tools?.jscpd) {
  const layers = settings?.precedence ?? ['nitpicker'];
  if (layers.includes('project') && !isPlainObject(settings.projectConfig)) {
    throw new Error('Missing head .jscpd.json configuration in the policy');
  }
  return layers.toReversed().reduce(
    (config, layer) => ({
      ...config,
      ...(layer === 'nitpicker' ? base : settings.projectConfig),
    }),
    {},
  );
}

export function jscpdCompleted(result) {
  return (
    result.status === 0 ||
    (result.status === 1 &&
      /jscpd found too many duplicates .* over threshold/u.test(result.stderr))
  );
}
