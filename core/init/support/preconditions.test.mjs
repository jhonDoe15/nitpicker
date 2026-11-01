import { describe, expect, it } from 'vitest';
import { useProjects } from '../test-support/projects.mjs';
import { assertSupportedNode, requiredNodeRange, requireRepository } from './preconditions.mjs';

const project = useProjects();

describe('the Node.js version init runs on', () => {
  it('is the engines range of the nitpicker package', () => {
    expect(requiredNodeRange()).toBe('>=22.14');
  });

  it.each(['22.14.0', 'v22.14.0', '22.20.1', '24.0.0'])('accepts %s', (version) => {
    expect(() => {
      assertSupportedNode(version, '>=22.14');
    }).not.toThrow();
  });

  it.each(['22.13.1', '20.19.0', 'v18.0.0'])('refuses %s and says what it needs', (version) => {
    expect(() => {
      assertSupportedNode(version, '>=22.14');
    }).toThrow(
      `nitpicker needs Node.js 22.14 or newer (engines ">=22.14" in its package.json), and this is Node.js ${version}. Install a newer Node.js and run nitpicker init again.`,
    );
  });

  it('does not judge a range it cannot read', () => {
    expect(() => {
      assertSupportedNode('18.0.0', '^22.14 || >=24');
    }).not.toThrow();
  });
});

describe('the repository init needs', () => {
  it('is the Git work tree that holds the project', () => {
    const root = project({ 'web/package.json': '{}' }, { repository: true });

    expect(requireRepository(`${root}/web`)).toBe(root);
  });

  it('is required', () => {
    const root = project({});

    expect(() => requireRepository(root)).toThrow(
      `${root} is not in a Git repository. nitpicker compares your changes with their merge base, so it needs one: run git init in the project folder or one above it, and run nitpicker init again.`,
    );
  });
});
