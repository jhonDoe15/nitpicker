import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { layerCheckstyle } from './checkstyle-layers.mjs';

type MergeRequest = {
  readonly nitpicker: string;
  readonly project: string;
  readonly output: string;
  readonly projectWins: boolean;
};

export function mergeCheckstyleFiles({
  nitpicker,
  project,
  output,
  projectWins,
}: MergeRequest): void {
  const merged: unknown = layerCheckstyle({
    nitpickerText: readFileSync(nitpicker, 'utf8'),
    projectText: readFileSync(project, 'utf8'),
    projectWins,
  });
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, String(merged));
}
