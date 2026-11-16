import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { reactorRootFor, reactorRootOf } from './reactor-root.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function layout(poms) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-reactor-root-')));
  roots.push(root);
  mkdirSync(path.join(root, '.git'));
  for (const [directory, modules] of Object.entries(poms)) {
    mkdirSync(path.join(root, directory), { recursive: true });
    const listed = modules.map((module) => `<module>${module}</module>`).join('');
    writeFileSync(
      path.join(root, directory, 'pom.xml'),
      `<project><modules>${listed}</modules></project>`,
    );
  }
  return root;
}

describe('reactorRootOf', () => {
  it('is the project folder itself when no parent lists it', () => {
    const root = layout({ '.': ['other'], app: [], other: [] });

    expect(reactorRootOf(path.join(root, 'app'))).toBe(path.join(root, 'app'));
  });

  it('is the parent that lists the project folder as a module', () => {
    const root = layout({ '.': ['core', 'app'], app: [], core: [] });

    expect(reactorRootOf(path.join(root, 'app'))).toBe(root);
  });

  it('goes up through nested aggregators to the top one', () => {
    const root = layout({ '.': ['services'], services: ['app'], 'services/app': [] });

    expect(reactorRootOf(path.join(root, 'services/app'))).toBe(root);
  });

  it('stops below an aggregator that does not list the next level', () => {
    const root = layout({ '.': ['elsewhere'], services: ['app'], 'services/app': [] });

    expect(reactorRootOf(path.join(root, 'services/app'))).toBe(path.join(root, 'services'));
  });

  it('does not count a module that only a profile lists', () => {
    const root = layout({ app: [] });
    writeFileSync(
      path.join(root, 'pom.xml'),
      '<project><profiles><profile><modules><module>app</module></modules></profile></profiles></project>',
    );

    expect(reactorRootOf(path.join(root, 'app'))).toBe(path.join(root, 'app'));
  });

  it('accepts a module that names its pom file and ignores a commented one', () => {
    const root = layout({ '.': ['app/pom.xml'], app: [] });
    writeFileSync(
      path.join(root, 'pom.xml'),
      '<project><modules><!-- <module>app</module> --><module>app/pom.xml</module></modules></project>',
    );

    expect(reactorRootOf(path.join(root, 'app'))).toBe(root);
  });
});

describe('reactorRootFor', () => {
  it('runs from the reactor only when the other snapshot lists the module too', () => {
    const listed = layout({ '.': ['app'], app: [] });
    const unlisted = layout({ '.': [], app: [] });
    const app = (root) => path.join(root, 'app');

    expect(reactorRootFor(app(listed), app(listed))).toBe(listed);
    expect(reactorRootFor(app(listed), app(unlisted))).toBe(app(listed));
    expect(reactorRootFor(app(unlisted), app(listed))).toBe(app(unlisted));
    expect(reactorRootFor(app(listed), undefined)).toBe(listed);
  });
});
