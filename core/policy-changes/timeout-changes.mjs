import {
  resolveTestTimeouts,
  TEST_TIMEOUT_LANGUAGES,
  TIMEOUT_LIMIT_KEYS,
  validateTestTimeouts,
} from '../../shared/test-timeouts/resolve.mjs';
import { withoutTroubleshooting } from '../../shared/messages/troubleshooting.mjs';

const TIMEOUT_KIND = 'test-timeout';

function settingsOf(config) {
  return config.tools?.tests?.timeouts;
}

function projectIdentity(project) {
  return JSON.stringify([project.language, [...new Set(project.include)].toSorted()]);
}

function projectsOf(config) {
  return Object.entries(settingsOf(config)?.projects ?? {}).map(([name, project]) => ({
    name,
    project,
    identity: projectIdentity(project),
  }));
}

function compareLimits(before, after, label) {
  const result = { loosened: [], changed: [] };
  for (const key of TIMEOUT_LIMIT_KEYS) {
    const from = before[key];
    const to = after[key];
    if (from === to) {
      continue;
    }
    const nativeChanged = from === undefined || to === undefined;
    const text = nativeChanged
      ? `test timeout ${label} ${key} changed from ${String(from ?? 'native')} to ${String(to ?? 'native')}`
      : `test timeout ${label} ${key} ${to > from ? 'raised' : 'lowered'} from ${String(from)} to ${String(to)}`;
    if (nativeChanged || to > from) {
      result.loosened.push({ text, kind: TIMEOUT_KIND });
    } else {
      result.changed.push(text);
    }
  }
  return result;
}

function projectLimits(config, entry) {
  return resolveTestTimeouts(config, {
    language: entry.project.language,
    project: entry.name,
  });
}

function replacementOf(entry, projects) {
  return (
    projects.find((head) => head.identity === entry.identity) ??
    projects.find(
      (head) => head.name === entry.name && head.project.language === entry.project.language,
    )
  );
}

function removedProjectChanges(entry, { baseConfig, headConfig, headProjects }) {
  const replacement = replacementOf(entry, headProjects);
  const fallback = resolveTestTimeouts(headConfig, { language: entry.project.language });
  const after = replacement === undefined ? fallback : projectLimits(headConfig, replacement);
  const parts = [compareLimits(projectLimits(baseConfig, entry), after, `project ${entry.name}`)];
  if (
    replacement !== undefined &&
    entry.project.include.some((glob) => !replacement.project.include.includes(glob))
  ) {
    parts.push(
      compareLimits(
        projectLimits(baseConfig, entry),
        fallback,
        `removed membership of project ${entry.name}`,
      ),
    );
  }
  return parts;
}

function addedProjectChanges(entry, { baseConfig, headConfig, baseProjects }) {
  if (baseProjects.some((base) => base.identity === entry.identity)) {
    return [];
  }
  const previous = baseProjects.find(
    (base) => base.name === entry.name && base.project.language === entry.project.language,
  );
  const added = entry.project.include.filter((glob) => !previous?.project.include.includes(glob));
  if (added.length === 0) {
    return [];
  }
  return [
    {
      loosened: [
        {
          text: [
            `test timeout project ${entry.name} membership added:`,
            `${JSON.stringify(added)} (${entry.project.language})`,
          ].join(' '),
          kind: TIMEOUT_KIND,
        },
      ],
      changed: [],
    },
    compareLimits(
      resolveTestTimeouts(baseConfig, { language: entry.project.language }),
      projectLimits(headConfig, entry),
      `project ${entry.name}`,
    ),
  ];
}

function validateProjectScopes(projects) {
  for (const [index, entry] of projects.entries()) {
    if (
      projects
        .slice(index + 1)
        .some((other) => entry.project.include.some((glob) => other.project.include.includes(glob)))
    ) {
      throw new Error(`timeout project ${entry.name} shares a selector with another project`);
    }
  }
}

function effectiveChanges(baseConfig, headConfig) {
  const baseProjects = projectsOf(baseConfig);
  const headProjects = projectsOf(headConfig);
  validateProjectScopes(headProjects);
  const parts = [
    ...TEST_TIMEOUT_LANGUAGES.map((language) =>
      compareLimits(
        resolveTestTimeouts(baseConfig, { language }),
        resolveTestTimeouts(headConfig, { language }),
        language,
      ),
    ),
    ...baseProjects.flatMap((entry) =>
      removedProjectChanges(entry, { baseConfig, headConfig, headProjects }),
    ),
    ...headProjects.flatMap((entry) =>
      addedProjectChanges(entry, { baseConfig, headConfig, baseProjects }),
    ),
  ];
  return {
    loosened: [
      ...new Map(
        parts.flatMap((part) => part.loosened).map((entry) => [entry.text, entry]),
      ).values(),
    ],
    changed: [...new Set(parts.flatMap((part) => part.changed))],
  };
}

export function timeoutChanges(baseConfig, headConfig) {
  if (JSON.stringify(settingsOf(baseConfig)) === JSON.stringify(settingsOf(headConfig))) {
    return { loosened: [], changed: [] };
  }
  try {
    for (const config of [baseConfig, headConfig]) {
      const settings = settingsOf(config);
      if (settings !== undefined) {
        validateTestTimeouts(settings);
      }
    }
    return effectiveChanges(baseConfig, headConfig);
  } catch (error) {
    return {
      loosened: [
        {
          text: `test timeout policy cannot be compared safely: ${withoutTroubleshooting(error.message)}`,
          kind: 'test-timeout-invalid',
        },
      ],
      changed: [],
    };
  }
}
