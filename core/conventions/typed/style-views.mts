import { jscpdIgnoredNotices as untypedJscpdIgnoredNotices } from '../../../shared/conventions/tool-precedence.mjs';
import {
  strykerIgnoredNotices as untypedStrykerIgnoredNotices,
  typescriptIgnoredNotices as untypedTypescriptIgnoredNotices,
} from '../../../languages/typescript/preset/project-configs/ignored-notices.mjs';
import { testsIgnoredNotices as untypedTestsIgnoredNotices } from '../../../languages/typescript/preset/project-configs/test-runner/test-runner-notices.mjs';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import type { StyleContext } from './convention-types.mts';

export type Notices = (context: StyleContext) => string[];

export const jscpdIgnoredNotices: (config: NitpickerConfig, projectRoot: string) => string[] =
  untypedJscpdIgnoredNotices;
export const strykerIgnoredNotices: Notices = untypedStrykerIgnoredNotices;
export const typescriptIgnoredNotices: Notices = untypedTypescriptIgnoredNotices;
export const testsIgnoredNotices: Notices = untypedTestsIgnoredNotices;
