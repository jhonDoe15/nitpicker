import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { copyGitTemplate, createGitTemplate } from '../../diff/git/test-support/git-repository.mjs';
import { linkSentence } from '../../../shared/messages/test-support/link-sentence.mjs';
import { resolveProjectRoot } from './project-root.mjs';

const temporaryRoots = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('project root resolution', () => {
  let gitTemplateRoot;

  beforeAll(() => {
    gitTemplateRoot = createGitTemplate();
  });

  it('finds a uv workspace declared in either form of its pyproject.toml', () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-project-')));
    temporaryRoots.push(root);
    copyGitTemplate(gitTemplateRoot, root);
    writeFileSync(path.join(root, 'package.json'), '{}');
    const declarations = {
      table: '[tool.uv.workspace]\nmembers = ["libs/*"]\n',
      inline: '[tool.uv]\nworkspace = { members = ["libs/*"] }\n',
      none: '[tool.uv]\npackage = false\n',
    };
    for (const [form, text] of Object.entries(declarations)) {
      mkdirSync(path.join(root, form, 'libs/a/src'), { recursive: true });
      writeFileSync(path.join(root, form, 'pyproject.toml'), text);
    }
    expect(
      Object.keys(declarations).map((form) =>
        resolveProjectRoot(path.join(root, form, 'libs/a/src')),
      ),
    ).toEqual([path.join(root, 'table'), path.join(root, 'inline'), root]);
  });

  it('finds the nearest package or nitpicker config bounded by the git repository', () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-project-')));
    temporaryRoots.push(root);
    copyGitTemplate(gitTemplateRoot, root);
    writeFileSync(path.join(root, 'package.json'), '{}');
    mkdirSync(path.join(root, 'packages/leaf'), { recursive: true });
    writeFileSync(path.join(root, 'packages/package.json'), '{}');
    expect(resolveProjectRoot(path.join(root, 'packages/leaf'))).toBe(path.join(root, 'packages'));
    mkdirSync(path.join(root, 'service/src'), { recursive: true });
    writeFileSync(path.join(root, 'service/nitpicker.config.json'), '{"preset":"java"}');
    expect(resolveProjectRoot(path.join(root, 'service/src'))).toBe(path.join(root, 'service'));
    const emptyRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-empty-project-')));
    temporaryRoots.push(emptyRoot);
    copyGitTemplate(gitTemplateRoot, emptyRoot);
    expect(() => resolveProjectRoot(emptyRoot)).toThrow(
      new Error(
        `No package.json or nitpicker.config.json found in the repository root ${emptyRoot}. ` +
          'For a Java, Kotlin, Python or Go project, create nitpicker.config.json with its preset, for example {"preset": "java"}. ' +
          linkSentence('noProjectFound'),
      ),
    );
  });

  it.each([
    ['build.gradle', 'java'],
    ['pom.xml', 'java'],
    ['pyproject.toml', 'python'],
    ['go.mod', 'go'],
  ])('names the preset of a %s folder that has no config', (marker, preset) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-unconfigured-')));
    temporaryRoots.push(root);
    copyGitTemplate(gitTemplateRoot, root);
    mkdirSync(path.join(root, 'service'));
    writeFileSync(path.join(root, 'service', marker), '');
    const advice =
      `The current folder has ${marker}: create nitpicker.config.json with {"preset": "${preset}"} ` +
      '(or run nitpicker init).';
    expect(() => resolveProjectRoot(path.join(root, 'service'))).toThrow(
      new Error(
        `No package.json or nitpicker.config.json found between ${path.join(root, 'service')} ` +
          `and repository root ${root}. ${advice} ${linkSentence('noProjectFound')}`,
      ),
    );
    writeFileSync(path.join(root, marker), '');
    expect(() => resolveProjectRoot(root)).toThrow(
      new Error(
        `No package.json or nitpicker.config.json found in the repository root ${root}. ${advice} ` +
          linkSentence('noProjectFound'),
      ),
    );
  });
});
