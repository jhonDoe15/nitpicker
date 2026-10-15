import { MESSAGES } from '../../../../../shared/policy.mjs';

const COMPOSITION_ROOT_FILE = /(?:^|\/)(?:main|server|composition-root)\.[cm]?[jt]sx?$/u;

export function crapUnknownMessage(sourcePath) {
  return COMPOSITION_ROOT_FILE.test(sourcePath)
    ? MESSAGES.crapCoverageUnknown
    : MESSAGES.crapCoverageUnknownPlain;
}
