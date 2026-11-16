import { existsSync } from 'node:fs';
import { pathInside as untypedPathInside } from '../review-rules/java-sources.mjs';

const pathInside: (base: string, relative: string) => string = untypedPathInside;

export function completeProjects<Project extends { readonly reportRoot: string }>(
  projects: readonly Project[],
  reports: readonly string[],
): Project[] {
  const complete = projects.filter(({ reportRoot }) =>
    reports.every((name) => existsSync(pathInside(reportRoot, name))),
  );
  return complete.length === projects.length ? complete : [];
}
