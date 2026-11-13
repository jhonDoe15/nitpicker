import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applySkillSection, applySnippetSections } from '../core/skills/fix-loop.mts';
import { SLOTS } from '../core/skills/fix-loop-slots.mts';
import { applyGeneratedBlock, applyJscpdMode } from '../shared/checks-catalog.mjs';
import { applyActionReference } from './action-inputs.mts';
import { applySupportMatrix } from './platforms/support-matrix.mts';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
export const GENERATED_FILES = [
  { file: path.join(repositoryRoot, 'spec/checks.md'), generate: applyGeneratedBlock },
  {
    file: path.join(repositoryRoot, 'languages/typescript/preset/defaults/jscpd.json'),
    generate: applyJscpdMode,
  },
  { file: path.join(repositoryRoot, 'docs/ci.md'), generate: applyActionReference },
  { file: path.join(repositoryRoot, 'docs/compatibility.md'), generate: applySupportMatrix },
  { file: path.join(repositoryRoot, 'docs/agents-snippet.md'), generate: applySnippetSections },
  ...SLOTS.map(({ preset }) => ({
    file: path.join(repositoryRoot, `skills/nitpicker-${preset}/SKILL.md`),
    generate: applySkillSection(preset),
  })),
];

export function staleFiles(): string[] {
  return GENERATED_FILES.filter(
    ({ file, generate }) => generate(readFileSync(file, 'utf8')) !== readFileSync(file, 'utf8'),
  ).map(({ file }) => file);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (process.argv.includes('--check')) {
    const stale = staleFiles();
    if (stale.length > 0) {
      console.error(`Stale (run npm run gen:checks): ${stale.join(', ')}`);
      process.exitCode = 1;
    }
  } else {
    for (const { file, generate } of GENERATED_FILES) {
      writeFileSync(file, String(generate(readFileSync(file, 'utf8'))));
    }
  }
}
