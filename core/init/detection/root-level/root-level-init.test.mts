import { describe, expect, it } from 'vitest';
import { init, readText, useProjects } from '../../test-support/projects.mts';

const createProject = useProjects();

describe('nitpicker init on a package with its code at the root', () => {
  it('picks JavaScript and writes the project root for a package whose code sits there', () => {
    const root = createProject(
      {
        'package.json': JSON.stringify({ name: 'lib', main: 'index.js' }),
        'index.js': 'module.exports = 1;\n',
        'lib/x.js': 'module.exports = 2;\n',
        'test/x.test.js': 'module.exports = 3;\n',
      },
      { repository: true },
    );

    const result = init(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdoutText.split('\n').slice(0, 2)).toEqual([
      'nitpicker init: JavaScript, npm, Vitest (preset "javascript")',
      'Its code is at the project root, so init sets "layout.sourceRoots" to ["."]. ' +
        'node_modules, tests, build output and tool config files stay out of the checks.',
    ]);
    expect(JSON.parse(readText(root, 'nitpicker.config.json'))).toEqual({
      preset: 'javascript',
      layout: { sourceRoots: ['.'] },
    });
  });
});
