import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveLayout } from '../../typescript/preset/layout.mjs';
import {
  jsonTransform,
  layoutJscpdConfig,
  layoutKnipConfig,
  layoutTransformFor,
  layoutTsconfig,
} from '../../typescript/preset/tool-configs.mjs';

const defaults = path.join(import.meta.dirname, '../../typescript/preset/defaults');
const javascriptLayout = resolveLayout({}, [], { javascript: true });
const typescriptLayout = resolveLayout();
const temporaryRoots = [];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function defaultText(name) {
  return readFileSync(path.join(defaults, name), 'utf8');
}

function projectWith(...files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-js-config-'));
  temporaryRoots.push(root);
  for (const file of files) {
    writeFileSync(path.join(root, file), '{}\n');
  }
  return root;
}

function transformed(name, layout, root) {
  const transform = layoutTransformFor(name, layout);
  return JSON.parse(transform(defaultText(name), path.join(root, name)));
}

describe('generated tsconfig.quality.json', () => {
  it('type-checks JavaScript without emitting for the javascript preset', () => {
    const config = transformed('tsconfig.quality.json', javascriptLayout, projectWith());
    expect(config.compilerOptions).toMatchObject({
      allowJs: true,
      checkJs: true,
      noEmit: true,
      strict: true,
      noUncheckedIndexedAccess: true,
    });
    expect(config.include).toEqual(['src/**/*', 'test/**/*', 'tests/**/*', 'vitest*.ts']);
  });

  it('keeps the TypeScript preset free of checkJs', () => {
    const config = transformed('tsconfig.quality.json', typescriptLayout, projectWith());
    expect(config.compilerOptions).not.toHaveProperty('checkJs');
    expect(config.compilerOptions).not.toHaveProperty('noEmit');
  });

  it('uses the custom roots and exclusions together with the JavaScript options', () => {
    const layout = resolveLayout({ sourceRoots: ['lib'], testRoots: ['spec'] }, ['lib/old/**'], {
      javascript: true,
    });
    const config = layoutTsconfig(JSON.parse(defaultText('tsconfig.quality.json')), layout);
    expect(config.include).toEqual(['lib/**/*', 'spec/**/*', 'vitest*.ts']);
    expect(config.exclude.at(-1)).toBe('lib/old/**');
    expect(config.compilerOptions.checkJs).toBe(true);
  });

  it('extends the project tsconfig.json and keeps checkJs on', () => {
    const config = transformed(
      'tsconfig.quality.json',
      javascriptLayout,
      projectWith('tsconfig.json'),
    );
    expect(config.extends).toBe('./tsconfig.json');
    expect(config.compilerOptions).toMatchObject({
      allowJs: true,
      checkJs: true,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
    });
    expect(config.include).toEqual(['src/**/*', 'test/**/*', 'tests/**/*', 'vitest*.ts']);
  });

  it('extends a jsconfig.json when the project has no tsconfig.json', () => {
    const config = transformed(
      'tsconfig.quality.json',
      javascriptLayout,
      projectWith('jsconfig.json'),
    );
    expect(config.extends).toBe('./jsconfig.json');
    expect(config.compilerOptions.checkJs).toBe(true);
  });

  it('prefers tsconfig.json over jsconfig.json', () => {
    const config = transformed(
      'tsconfig.quality.json',
      javascriptLayout,
      projectWith('jsconfig.json', 'tsconfig.json'),
    );
    expect(config.extends).toBe('./tsconfig.json');
  });

  it('ignores a jsconfig.json for the TypeScript preset', () => {
    const config = transformed(
      'tsconfig.quality.json',
      typescriptLayout,
      projectWith('jsconfig.json'),
    );
    expect(config).not.toHaveProperty('extends');
  });

  it('extends the project tsconfig.json for the TypeScript preset without checkJs', () => {
    const config = transformed(
      'tsconfig.quality.json',
      typescriptLayout,
      projectWith('tsconfig.json'),
    );
    expect(config.extends).toBe('./tsconfig.json');
    expect(config.compilerOptions).not.toHaveProperty('checkJs');
  });
});

describe('generated tsconfig.stryker.json', () => {
  it('type-checks JavaScript mutants without forcing noEmit', () => {
    const config = transformed('tsconfig.stryker.json', javascriptLayout, projectWith());
    expect(config.compilerOptions).toMatchObject({ allowJs: true, checkJs: true, strict: true });
    expect(config.compilerOptions).not.toHaveProperty('noEmit');
  });

  it('layers the JavaScript options over the project config', () => {
    const javascript = transformed(
      'tsconfig.stryker.json',
      javascriptLayout,
      projectWith('jsconfig.json'),
    );
    expect(javascript.extends).toBe('./jsconfig.json');
    expect(javascript.compilerOptions).toMatchObject({
      skipLibCheck: true,
      allowJs: true,
      checkJs: true,
    });
    const typescript = transformed(
      'tsconfig.stryker.json',
      typescriptLayout,
      projectWith('tsconfig.json'),
    );
    expect(typescript.extends).toBe('./tsconfig.json');
    expect(typescript.compilerOptions).not.toHaveProperty('checkJs');
  });

  it('leaves the TypeScript stryker config untouched for the default layout', () => {
    expect(layoutTransformFor('tsconfig.stryker.json', typescriptLayout)).toBeTypeOf('function');
    expect(transformed('tsconfig.stryker.json', typescriptLayout, projectWith())).toEqual(
      JSON.parse(defaultText('tsconfig.stryker.json')),
    );
  });
});

describe('generated knip.json', () => {
  const base = JSON.parse(defaultText('knip.json'));

  it('adds the JavaScript entry files and config files', () => {
    const config = layoutKnipConfig(base, javascriptLayout);
    expect(config.entry).toEqual(
      expect.arrayContaining([
        ...base.entry,
        'src/main.{js,mjs,cjs}',
        'vitest.config.{js,mjs,cjs}',
        'tests/fixtures/*harness*.{js,mjs,cjs}',
      ]),
    );
    expect(config.project).toEqual([...base.project, '*.config.{js,mjs,cjs}']);
  });

  it('does not add them for TypeScript', () => {
    const config = layoutKnipConfig(base, typescriptLayout);
    expect(config.entry).toEqual(base.entry);
    expect(config.project).toEqual(base.project);
  });

  it('moves the JavaScript entries to the custom roots and appends declared entry points', () => {
    const layout = {
      ...resolveLayout({ sourceRoots: ['lib'] }, [], { javascript: true }),
      entryPoints: ['tools/run.js'],
    };
    const config = layoutKnipConfig(base, layout);
    expect(config.entry.filter((entry) => entry.includes('main.{js'))).toEqual([
      'lib/main.{js,mjs,cjs}',
      'lib/main/main.{js,mjs,cjs}',
    ]);
    expect(config.entry.at(-1)).toBe('tools/run.js');
    expect(config.project.filter((entry) => entry.endsWith('{js,mjs,cjs}'))).toEqual([
      '*.config.{js,mjs,cjs}',
    ]);
  });

  it('is rewritten for the default JavaScript layout', () => {
    const config = transformed('knip.json', javascriptLayout, projectWith());
    expect(config.entry.filter((entry) => entry.startsWith('vitest.config'))).toEqual([
      'vitest.config.ts',
      'vitest.config.{js,mjs,cjs}',
    ]);
  });
});

describe('generated jscpd.json', () => {
  const base = JSON.parse(defaultText('jscpd.json'));

  it('scans the JavaScript format next to the TypeScript one, so .ts files in a JavaScript project are scanned', () => {
    expect(layoutJscpdConfig(base, javascriptLayout).format).toEqual(['typescript', 'javascript']);
  });

  it('keeps the TypeScript format for the TypeScript preset', () => {
    expect(layoutJscpdConfig(base, typescriptLayout).format).toEqual(['typescript']);
  });

  it('is rewritten for the default JavaScript layout', () => {
    expect(transformed('jscpd.json', javascriptLayout, projectWith()).format).toEqual([
      'typescript',
      'javascript',
    ]);
  });
});

describe('jsonTransform', () => {
  it('rewrites a default layout only for JavaScript', () => {
    expect(jsonTransform(layoutTsconfig, typescriptLayout)).toBeUndefined();
    expect(jsonTransform(layoutTsconfig, javascriptLayout)).toBeTypeOf('function');
  });

  it('rewrites a custom layout for either preset', () => {
    const custom = resolveLayout({ sourceRoots: ['lib'] });
    expect(jsonTransform(layoutTsconfig, custom)).toBeTypeOf('function');
  });

  it('writes formatted JSON with a trailing newline', () => {
    const text = jsonTransform(
      layoutTsconfig,
      javascriptLayout,
    )(defaultText('tsconfig.quality.json'));
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.split('\n')[1]).toBe('  "compilerOptions": {');
  });
});
