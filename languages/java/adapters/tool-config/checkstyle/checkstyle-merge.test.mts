import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeCheckstyleFiles as untypedMergeCheckstyleFiles } from './checkstyle-merge.mjs';
import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mts';

const { temporaryRoot } = useGitFixtures();

type MergeFiles = {
  readonly nitpicker: string;
  readonly project: string;
  readonly output: string;
  readonly projectWins?: boolean;
};

const mergeCheckstyleFiles: (files: MergeFiles) => void = untypedMergeCheckstyleFiles;
function filesWith(nitpicker: string, project: string) {
  const root = temporaryRoot('nitpicker-checkstyle-merge-');
  writeFileSync(path.join(root, 'nitpicker.xml'), nitpicker);
  writeFileSync(path.join(root, 'project.xml'), project);
  return {
    nitpicker: path.join(root, 'nitpicker.xml'),
    project: path.join(root, 'project.xml'),
    output: path.join(root, 'nested', 'out.xml'),
  };
}

const config = (max: number) =>
  `<module name="Checker"><module name="LineLength"><property name="max" value="${String(max)}"/></module></module>`;
const doctype = [
  '<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"',
  '"https://checkstyle.org/dtds/configuration_1_3.dtd">',
].join(' ');
const merged = (max: number) => `<?xml version="1.0" encoding="UTF-8"?>
${doctype}
<module name="Checker">
  <module name="LineLength">
    <property name="max" value="${String(max)}"/>
  </module>
</module>
`;

describe('mergeCheckstyleFiles', () => {
  it('writes the merged config with the project winning, creating the folder', () => {
    const files = filesWith(config(100), config(140));

    mergeCheckstyleFiles(files);

    expect(readFileSync(files.output, 'utf8')).toBe(merged(140));
  });

  it('lets nitpicker win when the project does not', () => {
    const files = filesWith(config(100), config(140));

    mergeCheckstyleFiles({ ...files, projectWins: false });

    expect(readFileSync(files.output, 'utf8')).toBe(merged(100));
  });

  it('throws for a config without a Checker root and for an unreadable file', () => {
    const files = filesWith(config(100), '<module name="TreeWalker"/>');

    const missing = { ...files, project: `${files.project}.missing` };

    expect(() => {
      mergeCheckstyleFiles(files);
    }).toThrow('The Checkstyle config must have a Checker module at its root, not TreeWalker');
    expect(() => {
      mergeCheckstyleFiles(missing);
    }).toThrow('ENOENT');
  });
});
