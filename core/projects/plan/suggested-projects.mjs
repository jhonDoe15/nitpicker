import path from 'node:path';
import {
  detectedPreset,
  scriptProjectPreset,
} from '../../configuration/project-checks/preset-detection.mjs';
import { undeclaredProjects } from '../discovery/detect.mjs';
import { listRepositoryFiles } from '../discovery/repository-files.mjs';
import { projectsSuggestion } from '../run/messages.mjs';

function presetOf(absolute) {
  return scriptProjectPreset({}, absolute) ?? detectedPreset(absolute)?.preset;
}

export function suggestedProjects(repositoryRoot) {
  const files = listRepositoryFiles(repositoryRoot);
  return undeclaredProjects({ root: repositoryRoot, files, projects: [] }).flatMap((candidate) => {
    const preset = presetOf(path.join(repositoryRoot, candidate.path));
    return preset === undefined ? [] : [{ ...candidate, preset }];
  });
}

export function noProjectAdvice(repositoryRoot) {
  const entries = suggestedProjects(repositoryRoot);
  return entries.length === 0 ? undefined : projectsSuggestion(entries);
}
