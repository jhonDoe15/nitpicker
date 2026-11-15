import { listNames as untypedListNames } from '../../../shared/messages/messages.mjs';
import { rejectMissingConfiguredBuild as untypedRejectMissingConfiguredBuild } from '../../../languages/java/builds/build-tool/build-tool-setting.mjs';
import { factRuleSettings as untypedFactRuleSettings } from '../../../shared/project-rules/fact-rules.mjs';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';

export const listNames: (names: readonly string[]) => string = untypedListNames;

export const rejectMissingConfiguredBuild: (config: NitpickerConfig, projectRoot: string) => void =
  untypedRejectMissingConfiguredBuild;

export { isPlainObject } from '../../../shared/values/readers.mts';

export const factRuleSettings: (preset: string) => string[] = untypedFactRuleSettings;
