import { CO_CHANGE_DEFAULTS } from '../../project-rules/hygiene-rules.mjs';

export function coChangeSettings(policy = {}) {
  const history = policy.history;
  return history?.coChange === true
    ? Object.fromEntries(
        Object.entries(CO_CHANGE_DEFAULTS).map(([key, fallback]) => [
          key,
          history[key] ?? fallback,
        ]),
      )
    : undefined;
}
