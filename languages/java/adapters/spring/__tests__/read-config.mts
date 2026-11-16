import { project, readSpringConfigFindings, sourceRoots } from './spring-config-projects.mts';
import type { SpringFinding } from './spring-config-projects.mts';

export function read(
  files: Readonly<Record<string, string>>,
  options?: { readonly jpa?: false },
): SpringFinding[] {
  return readSpringConfigFindings(project(files, options), { sourceRoots });
}
