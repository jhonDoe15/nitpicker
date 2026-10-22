import { javaHeadFacts } from '../../languages/java/adapters/facts/head-facts.mjs';
import { GRADLE_PRESETS } from '../../languages/java/adapters/gradle-presets.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';

export function resolveProjectHeadPolicy(config = {}, projectRoot = undefined) {
  const policy = resolveHeadPolicy(config, projectRoot);
  return projectRoot !== undefined && GRADLE_PRESETS.includes(config.preset)
    ? { ...policy, ...javaHeadFacts(projectRoot, config) }
    : policy;
}
