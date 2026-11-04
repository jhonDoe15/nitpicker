import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../shared/messages/troubleshooting.mjs';

export function fixerError(tool, error) {
  return {
    tool,
    snapshot: 'fix',
    message: withTroubleshooting(
      error instanceof Error ? error.message : String(error),
      TROUBLESHOOTING_ANCHORS.fixersFail,
    ),
  };
}
