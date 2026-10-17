import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { safeRequirements } from './requirements.mjs';

const roots = [];

function project(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-requirements-')));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('safeRequirements', () => {
  it('keeps the packages and drops what would build the project itself', () => {
    const root = project({
      'requirements.txt': [
        '# pinned',
        'requests==2.32.0  # http',
        'numpy>=1.26 \\',
        '  ; python_version >= "3.10"',
        '-e .',
        '--editable ./libs/core',
        '.',
        './vendor/pkg',
        '../outside',
        'pkg @ file:///tmp/pkg',
        'tool @ file:../tool',
        '--index-url https://pypi.example/simple',
        '--find-links ./wheels',
        '--no-binary :all:',
        'git+https://example.com/org/repo.git#egg=repo',
        '',
      ].join('\n'),
    });

    expect(safeRequirements(root, ['requirements.txt'])).toEqual({
      lines: [
        'requests==2.32.0',
        'numpy>=1.26    ; python_version >= "3.10"',
        '--index-url https://pypi.example/simple',
        'git+https://example.com/org/repo.git#egg=repo',
      ],
      constraints: [],
      dropped: [
        'requirements.txt: -e .',
        'requirements.txt: --editable ./libs/core',
        'requirements.txt: .',
        'requirements.txt: ./vendor/pkg',
        'requirements.txt: ../outside',
        'requirements.txt: pkg @ file:///tmp/pkg',
        'requirements.txt: tool @ file:../tool',
        'requirements.txt: --find-links ./wheels',
        'requirements.txt: --no-binary :all:',
      ],
    });
  });

  it('follows includes inside the project once and keeps constraints apart', () => {
    const root = project({
      'requirements.txt': '-r requirements/base.txt\n-r requirements/dev.txt\n-c constraints.txt\n',
      'requirements/base.txt': 'flask==3.0.0\n-r dev.txt\n',
      'requirements/dev.txt': 'pytest==9.1.1\n-r ../requirements.txt\n',
      'constraints.txt': 'flask<4\n',
    });

    expect(safeRequirements(root, ['requirements.txt'])).toEqual({
      lines: ['flask==3.0.0', 'pytest==9.1.1'],
      constraints: [path.join(root, 'constraints.txt')],
      dropped: [],
    });
  });

  it('drops an include that leaves the project or does not exist', () => {
    const root = project({
      'requirements.txt': '-r ../secrets.txt\n-r missing.txt\n-c ../limits.txt\nflask==3.0.0\n',
    });

    expect(safeRequirements(root, ['requirements.txt'])).toEqual({
      lines: ['flask==3.0.0'],
      constraints: [],
      dropped: [
        'requirements.txt: -r ../secrets.txt',
        'requirements.txt: -r missing.txt',
        'requirements.txt: -c ../limits.txt',
      ],
    });
  });
});
