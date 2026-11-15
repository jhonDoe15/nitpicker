import { fieldOf, fieldsOf, textOf, textsOf } from '../../shared/values/readers.mts';
import {
  resolveTestTimeouts,
  TEST_TIMEOUT_LANGUAGES,
  TIMEOUT_LIMIT_KEYS,
  validateTestTimeouts,
  withoutTroubleshooting,
} from './types/config-views.mts';
import type { TimeoutLimits } from './types/config-views.mts';
import type { ChangePart, Loosening, PolicyConfig, TimeoutProject } from './types/policy-types.mts';

type ProjectEntry = {
  readonly name: string;
  readonly project: TimeoutProject;
  readonly identity: string;
};

const TIMEOUT_KIND = 'test-timeout';

function settingsOf(config: PolicyConfig): unknown {
  return fieldOf(config.tools?.['tests'], 'timeouts');
}

function projectIdentity(project: TimeoutProject): string {
  return JSON.stringify([project.language, [...new Set(project.include)].toSorted()]);
}

function projectsOf(config: PolicyConfig): ProjectEntry[] {
  const projects = fieldsOf(fieldOf(settingsOf(config), 'projects'));
  return Object.entries(projects).map(([name, raw]) => {
    const project = {
      language: textOf(fieldOf(raw, 'language')),
      include: textsOf(fieldOf(raw, 'include')),
    };
    return { name, project, identity: projectIdentity(project) };
  });
}

function compareLimits(before: TimeoutLimits, after: TimeoutLimits, label: string): ChangePart {
  const result: { loosened: Loosening[]; changed: string[] } = { loosened: [], changed: [] };
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

function projectLimits(config: PolicyConfig, entry: ProjectEntry): TimeoutLimits {
  return resolveTestTimeouts(config, {
    language: entry.project.language,
    project: entry.name,
  });
}

function replacementOf(
  entry: ProjectEntry,
  projects: readonly ProjectEntry[],
): ProjectEntry | undefined {
  return (
    projects.find((head) => head.identity === entry.identity) ??
    projects.find(
      (head) => head.name === entry.name && head.project.language === entry.project.language,
    )
  );
}

type Comparison = {
  readonly baseConfig: PolicyConfig;
  readonly headConfig: PolicyConfig;
};

function removedProjectChanges(
  entry: ProjectEntry,
  { baseConfig, headConfig, headProjects }: Comparison & { readonly headProjects: ProjectEntry[] },
): ChangePart[] {
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

function addedProjectChanges(
  entry: ProjectEntry,
  { baseConfig, headConfig, baseProjects }: Comparison & { readonly baseProjects: ProjectEntry[] },
): ChangePart[] {
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

function validateProjectScopes(projects: readonly ProjectEntry[]): void {
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

function effectiveChanges(baseConfig: PolicyConfig, headConfig: PolicyConfig): ChangePart {
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

export function timeoutChanges(baseConfig: PolicyConfig, headConfig: PolicyConfig): ChangePart {
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
          text: `test timeout policy cannot be compared safely: ${withoutTroubleshooting(error instanceof Error ? error.message : String(error))}`,
          kind: 'test-timeout-invalid',
        },
      ],
      changed: [],
    };
  }
}
