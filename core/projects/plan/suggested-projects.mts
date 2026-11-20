import path from 'node:path';
import type { WorkspaceMember } from '../project-types.mts';
import {
  detectedPreset,
  scriptProjectPreset,
} from '../../configuration/project-checks/preset-detection.mts';
import { undeclaredProjects } from '../discovery/detect.mts';
import { listRepositoryFiles } from '../discovery/repository-files.mts';
import { projectsSuggestion } from '../run/messages.mts';

function presetOf(absolute: string): string | undefined {
  return scriptProjectPreset({}, absolute) ?? detectedPreset(absolute)?.preset;
}

export function suggestedProjects(
  repositoryRoot: string,
): (WorkspaceMember & { readonly preset: string })[] {
  const files = listRepositoryFiles(repositoryRoot);
  return undeclaredProjects({ root: repositoryRoot, files, projects: [] }).flatMap((candidate) => {
    const preset = presetOf(path.join(repositoryRoot, candidate.path));
    return preset === undefined ? [] : [{ ...candidate, preset }];
  });
}

export function noProjectAdvice(repositoryRoot: string): string | undefined {
  const entries = suggestedProjects(repositoryRoot);
  return entries.length === 0 ? undefined : projectsSuggestion(entries);
}
