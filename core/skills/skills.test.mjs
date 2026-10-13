import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { SUPPORTED_PRESETS } from '../config.mjs';
import { PACKAGE_ROOT } from '../tooling/tool-resolution.mjs';

const skillsRoot = path.join(PACKAGE_ROOT, 'skills');
const skillNames = readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function readSkill(name) {
  const text = readFileSync(path.join(skillsRoot, name, 'SKILL.md'), 'utf8');
  const frontmatter = /^---\n(?<yaml>[\s\S]*?)\n---\n/u.exec(text)?.groups?.yaml ?? '';
  return { text, frontmatter: parse(frontmatter, { strict: true, uniqueKeys: true }) };
}

function relativeLinks(text) {
  return [...text.matchAll(/\]\((?<target>[^)#\s]+)(?:#[^)]*)?\)/gu)]
    .map((match) => match.groups?.target ?? '')
    .filter((target) => !/^[a-z]+:/u.test(target));
}

describe('agent skills', () => {
  it('has one skill per preset', () => {
    expect(skillNames.toSorted()).toEqual(
      SUPPORTED_PRESETS.map((preset) => `nitpicker-${preset}`).toSorted(),
    );
  });

  it.each(skillNames)('%s has strict YAML frontmatter naming its folder', (name) => {
    const { frontmatter } = readSkill(name);
    expect(Object.keys(frontmatter).toSorted()).toEqual(['description', 'name']);
    expect(frontmatter.name).toBe(name);
    expect(frontmatter.description.startsWith('Use before writing or changing ')).toBe(true);
  });

  it.each(skillNames)('%s links only to files inside its own folder', (name) => {
    const missing = relativeLinks(readSkill(name).text).filter(
      (target) => !existsSync(path.join(skillsRoot, name, target)) || target.startsWith('..'),
    );
    expect(missing).toEqual([]);
  });
});
