import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { SUPPORTED_PRESETS } from '../configuration/validate.mjs';
import { PACKAGE_ROOT } from '../tooling/tool-resolution.mjs';

const skillsRoot = path.join(PACKAGE_ROOT, 'skills');
const skillNames = readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => existsSync(path.join(skillsRoot, name, 'SKILL.md')));
const PRESET_MENTIONS_ALLOWED = { java: ['kotlin'] };
const SHARED_PAGES = ['SKILL.md', 'beyond-the-gate.md', 'editing-existing-code.md'];
const OPTIONAL_PAGES = ['SOURCES.md'];
const FRAMEWORK_PAGES = {
  'spring.md': {
    skills: ['nitpicker-java', 'nitpicker-kotlin'],
    reason: 'only the JVM presets ship Spring rules',
  },
};

function readSkill(name) {
  const text = readFileSync(path.join(skillsRoot, name, 'SKILL.md'), 'utf8').replaceAll(
    '\r\n',
    '\n',
  );
  const yaml = /^---\n(?<yaml>[\s\S]*?)\n---\n/u.exec(text)?.groups?.yaml;
  if (yaml === undefined) throw new Error(`${name}/SKILL.md has no frontmatter`);
  return { text, frontmatter: parse(yaml, { strict: true, uniqueKeys: true }) };
}

function skillFiles(name) {
  return readdirSync(path.join(skillsRoot, name), { withFileTypes: true }).map((entry) =>
    entry.isFile() ? entry.name : `${entry.name}/`,
  );
}

function frameworkPagesOf(name) {
  return Object.keys(FRAMEWORK_PAGES).filter((page) => FRAMEWORK_PAGES[page].skills.includes(name));
}

function relativeLinks(text) {
  return [...text.matchAll(/\]\((?<target>[^)#\s]+)(?:#[^)]*)?\)/gu)]
    .map((match) => match.groups?.target ?? '')
    .filter((target) => !/^[a-z]+:/u.test(target));
}

function mentionsPreset(text, preset) {
  return new RegExp(`\\b${preset}\\b`, 'iu').test(text);
}

describe('agent skills', () => {
  it.each(SUPPORTED_PRESETS)('has a skill for the %s preset', (preset) => {
    expect(skillNames.includes(`nitpicker-${preset}`)).toBe(true);
  });

  it.each(skillNames)('%s has strict YAML frontmatter naming its folder', (name) => {
    const { frontmatter } = readSkill(name);
    expect(Object.keys(frontmatter).toSorted()).toEqual(['description', 'name']);
    expect(frontmatter.name).toBe(name);
    expect(/^[a-z0-9-]{1,64}$/u.test(frontmatter.name)).toBe(true);
    expect(frontmatter.description.length).toBeLessThanOrEqual(1024);
  });

  it.each(skillNames)('%s triggers on its own preset only', (name) => {
    const preset = name.replace(/^nitpicker-/u, '');
    const { description } = readSkill(name).frontmatter;
    const others = SUPPORTED_PRESETS.filter(
      (other) => other !== preset && !(PRESET_MENTIONS_ALLOWED[preset] ?? []).includes(other),
    );
    expect(mentionsPreset(description, preset)).toBe(true);
    expect(others.filter((other) => mentionsPreset(description, other))).toEqual([]);
  });

  it.each(skillNames)('%s links only to files inside its own folder', (name) => {
    const missing = relativeLinks(readSkill(name).text).filter(
      (target) => target.startsWith('..') || !existsSync(path.join(skillsRoot, name, target)),
    );
    expect(missing).toEqual([]);
  });

  it.each(skillNames)('%s links every page in its folder', (name) => {
    const links = relativeLinks(readSkill(name).text);
    const pages = readdirSync(path.join(skillsRoot, name)).filter(
      (file) => file.endsWith('.md') && file !== 'SKILL.md',
    );
    expect(pages.filter((page) => !links.includes(page))).toEqual([]);
  });

  it.each(skillNames)('%s ships every shared page', (name) => {
    const files = skillFiles(name);
    expect(SHARED_PAGES.filter((page) => !files.includes(page))).toEqual([]);
  });

  it.each(skillNames)(
    '%s ships no page beyond the shared, optional and registered framework pages',
    (name) => {
      const allowed = [...SHARED_PAGES, ...OPTIONAL_PAGES, ...frameworkPagesOf(name)];
      expect(skillFiles(name).filter((file) => !allowed.includes(file))).toEqual([]);
    },
  );

  it.each(Object.keys(FRAMEWORK_PAGES))('%s names existing skills and a reason', (page) => {
    const { skills, reason } = FRAMEWORK_PAGES[page];
    expect(skills.filter((name) => !skillNames.includes(name))).toEqual([]);
    expect(reason.length).toBeGreaterThan(0);
  });

  it.each(skillNames)('%s names other skills by their installable names', (name) => {
    const { text } = readSkill(name);
    expect(/skills\/nitpicker\/|\bthe nitpicker skill\b/iu.test(text)).toBe(false);
  });
});
