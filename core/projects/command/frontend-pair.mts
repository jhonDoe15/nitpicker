import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  detectedPreset,
  scriptProjectPreset,
} from '../../configuration/project-checks/preset-detection.mjs';
import { existingConfig } from '../../init/files/config-file.mts';
import { WEB_SOURCE_FOLDERS } from '../plan/project-entry.mts';
import type { MonorepoLayout, ProjectEntry } from '../../init/monorepo/monorepo-types.mts';

type Marker = {
  readonly preset: string;
  readonly javaSources?: unknown;
  readonly kotlinSources?: unknown;
};

const JVM_PRESETS = new Set(['java', 'kotlin']);

const markerOf: (root: string) => Marker | undefined = detectedPreset;
const scriptPresetOf: (config: object, root: string) => string | undefined = scriptProjectPreset;

function setsNoProject(root: string): boolean {
  const existing = existingConfig(root);
  return (
    existing.kind === 'missing' ||
    (existing.kind === 'parsed' &&
      existing.config['preset'] === undefined &&
      existing.config['projects'] === undefined)
  );
}

function frontendEntry(root: string): ProjectEntry | undefined {
  for (const folder of WEB_SOURCE_FOLDERS) {
    const config = { layout: { sourceRoots: [folder] } };
    const preset = existsSync(path.join(root, folder)) ? scriptPresetOf(config, root) : undefined;
    if (preset !== undefined) {
      return { path: '.', preset };
    }
  }
  return undefined;
}

export function frontendPairLayout(root: string): MonorepoLayout | undefined {
  const marker = markerOf(root);
  if (
    marker === undefined ||
    !JVM_PRESETS.has(marker.preset) ||
    (marker.javaSources !== true && marker.kotlinSources !== true) ||
    !existsSync(path.join(root, 'package.json')) ||
    !setsNoProject(root)
  ) {
    return undefined;
  }
  const frontend = frontendEntry(root);
  if (frontend === undefined) {
    return undefined;
  }
  const entries = [{ path: '.', preset: marker.preset }, frontend];
  const members = entries.map(({ preset }) => ({
    path: `.@${preset}`,
    folder: '.',
    absolute: root,
    preset,
    declared: true,
  }));
  return { source: 'paired', members, entries };
}
