import { javaHeadFacts } from '../../languages/java/adapters/facts/head-facts.mjs';
import { GRADLE_PRESETS } from '../../languages/java/adapters/gradle-presets.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import type { NitpickerConfig as Config } from '../../shared/values/config-types.mts';

const headPolicyOf: (config: Config, root?: string) => Record<string, unknown> = resolveHeadPolicy;

export function resolveProjectHeadPolicy(
  config: Config = {},
  projectRoot?: string,
  host = {},
): object {
  const policy = headPolicyOf(config, projectRoot);
  return projectRoot !== undefined && GRADLE_PRESETS.includes(config.preset ?? '')
    ? { ...policy, ...javaHeadFacts(projectRoot, config, host) }
    : policy;
}
