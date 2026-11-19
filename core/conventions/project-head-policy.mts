import { javaHeadFacts } from '../../languages/java/adapters/facts/head-facts.mts';
import { GRADLE_PRESETS } from '../../languages/java/adapters/gradle-presets.mts';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mts';
import type { HeadPolicyFile } from '../../languages/typescript/preset/typed/head-policy-types.mts';
import type { NitpickerConfig as Config } from '../../shared/values/config-types.mts';

export function resolveProjectHeadPolicy(
  config: Config = {},
  projectRoot?: string,
  host = {},
): HeadPolicyFile {
  const policy = resolveHeadPolicy(config, projectRoot);
  return projectRoot !== undefined && GRADLE_PRESETS.includes(config.preset ?? '')
    ? { ...policy, ...javaHeadFacts(projectRoot, config, host) }
    : policy;
}
