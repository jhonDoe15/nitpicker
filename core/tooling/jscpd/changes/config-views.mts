import { shownSetting as untypedShownSetting } from '../../../../shared/config.mjs';
import { JSCPD_MODES as UNTYPED_MODES, JSCPD_SIZE as UNTYPED_SIZE } from '../config.mjs';

import type { AppliedValues, FileChange } from '../../../policy-changes/types/policy-types.mts';

export type { AppliedValues, FileChange };
export type Setting = unknown;
export type Loosens = (base: Setting, head: Setting) => boolean;

export const JSCPD_MODES: readonly unknown[] = UNTYPED_MODES;
export const JSCPD_SIZE: RegExp = UNTYPED_SIZE;
export const shownSetting: (value: unknown) => string = untypedShownSetting;
