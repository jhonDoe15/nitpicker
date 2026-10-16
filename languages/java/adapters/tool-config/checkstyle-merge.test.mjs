import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mergeCheckstyleFiles } from './checkstyle-merge.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function filesWith(nitpicker, project) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-checkstyle-merge-'));
  roots.push(root);
  writeFileSync(path.join(root, 'nitpicker.xml'), nitpicker);
  writeFileSync(path.join(root, 'project.xml'), project);
  return [
    path.join(root, 'nitpicker.xml'),
    path.join(root, 'project.xml'),
    path.join(root, 'out.xml'),
  ];
}

const config = (max) =>
  `<module name="Checker"><module name="LineLength"><property name="max" value="${max}"/></module></module>`;
const doctype = [
  '<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"',
  '"https://checkstyle.org/dtds/configuration_1_3.dtd">',
].join(' ');
const merged = (max) => `<?xml version="1.0" encoding="UTF-8"?>
${doctype}
<module name="Checker">
  <module name="LineLength">
    <property name="max" value="${max}"/>
  </module>
</module>
`;

describe('mergeCheckstyleFiles', () => {
  it('writes the merged config with the project winning', () => {
    const [nitpicker, project, output] = filesWith(config(100), config(140));

    expect(mergeCheckstyleFiles([nitpicker, project, output])).toEqual({ code: 0, message: '' });
    expect(readFileSync(output, 'utf8')).toBe(merged(140));
  });

  it('lets nitpicker win with nitpicker-first', () => {
    const [nitpicker, project, output] = filesWith(config(100), config(140));

    expect(mergeCheckstyleFiles([nitpicker, project, output, 'nitpicker-first']).code).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe(merged(100));
  });

  it('reports a config without a Checker root and an unreadable file', () => {
    const [nitpicker, project, output] = filesWith(config(100), '<module name="TreeWalker"/>');

    expect(mergeCheckstyleFiles([nitpicker, project, output])).toEqual({
      code: 1,
      message: 'The Checkstyle config must have a Checker module at its root, not TreeWalker',
    });
    expect(mergeCheckstyleFiles([nitpicker, `${project}.missing`, output]).code).toBe(1);
  });
});
