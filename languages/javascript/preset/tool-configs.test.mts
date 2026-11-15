import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fieldsOf, listOf, parseJson, textsOf } from '../../../shared/values/readers.mts';
import { rootsRemovedAfterAll } from '../../typescript/adapters/test-support/temporary-roots.mts';
import { resolveLayout as untypedResolveLayout } from '../../typescript/preset/layout.mjs';
import {
  jsonTransform as untypedJsonTransform,
  layoutJscpdConfig as untypedLayoutJscpdConfig,
  layoutKnipConfig as untypedLayoutKnipConfig,
  layoutTransformFor as untypedLayoutTransformFor,
  layoutTsconfig as untypedLayoutTsconfig,
} from '../../typescript/preset/tool-configs.mjs';

type Layout = ReturnType<typeof untypedResolveLayout>;
type Json = Readonly<Record<string, unknown>>;
type ConfigRewrite = (config: Json, layout: Layout) => Json;

const resolveLayout: (
  config?: object,
  roots?: string[],
  options?: { javascript: boolean },
) => Layout = untypedResolveLayout;
const layoutTsconfig: ConfigRewrite = untypedLayoutTsconfig;
const layoutKnipConfig: (base: Json, layout: Layout & { readonly entryPoints?: string[] }) => Json =
  untypedLayoutKnipConfig;
const layoutJscpdConfig: ConfigRewrite = untypedLayoutJscpdConfig;
const jsonTransform: (
  rewrite: ConfigRewrite,
  layout: Layout,
) => ((text: string) => string) | undefined = untypedJsonTransform;
const layoutTransformFor: (
  policyFileName: string,
  layout: Layout,
) => ((text: string, file: string) => string) | undefined = untypedLayoutTransformFor;

const defaults = path.join(import.meta.dirname, '../../typescript/preset/defaults');
const javascriptLayout = resolveLayout({}, [], { javascript: true });
const typescriptLayout = resolveLayout();
const temporaryRoots = rootsRemovedAfterAll();

function defaultText(name: string): string {
  return readFileSync(path.join(defaults, name), 'utf8');
}

function projectWith(...files: string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-js-config-'));
  temporaryRoots.push(root);
  for (const file of files) {
    writeFileSync(path.join(root, file), '{}\n');
  }
  return root;
}

function defaultJson(name: string): Json {
  return fieldsOf(parseJson(defaultText(name)));
}

function transformed(name: string, layout: Layout, root: string): Json {
  const transform = layoutTransformFor(name, layout);
  if (transform === undefined) {
    throw new Error(`No transform for ${name}`);
  }
  return fieldsOf(parseJson(transform(defaultText(name), path.join(root, name))));
}

function compilerOptions(config: Json): Json {
  return fieldsOf(config['compilerOptions']);
}

describe('generated tsconfig.quality.json', () => {
  it('type-checks JavaScript without emitting for the javascript preset', () => {
    const config = transformed('tsconfig.quality.json', javascriptLayout, projectWith());
    const { allowJs, checkJs, noEmit, strict, noUncheckedIndexedAccess } = compilerOptions(config);
    expect({ allowJs, checkJs, noEmit, strict, noUncheckedIndexedAccess }).toEqual({
      allowJs: true,
      checkJs: true,
      noEmit: true,
      strict: true,
      noUncheckedIndexedAccess: true,
    });
    expect(config['include']).toEqual([
      'src/**/*',
      'test/**/*',
      'tests/**/*',
      '__tests__/**/*',
      'e2e/**/*',
      'vitest*.ts',
    ]);
  });

  it('keeps the TypeScript preset free of checkJs and never emits', () => {
    const config = transformed('tsconfig.quality.json', typescriptLayout, projectWith());
    expect(compilerOptions(config)).not.toHaveProperty('checkJs');
    expect(compilerOptions(config)['noEmit']).toBe(true);
  });

  it('uses the custom roots and exclusions together with the JavaScript options', () => {
    const layout = resolveLayout({ sourceRoots: ['lib'], testRoots: ['spec'] }, ['lib/old/**'], {
      javascript: true,
    });
    const config = layoutTsconfig(defaultJson('tsconfig.quality.json'), layout);
    expect(config['include']).toEqual(['lib/**/*', 'spec/**/*', 'vitest*.ts']);
    expect(listOf(config['exclude']).at(-1)).toBe('lib/old/**');
    expect(compilerOptions(config)['checkJs']).toBe(true);
  });

  it('extends the project tsconfig.json and keeps checkJs on', () => {
    const config = transformed(
      'tsconfig.quality.json',
      javascriptLayout,
      projectWith('tsconfig.json'),
    );
    expect(config['extends']).toBe('./tsconfig.json');
    const { allowJs, checkJs, noEmit, skipLibCheck, strict } = compilerOptions(config);
    expect({ allowJs, checkJs, noEmit, skipLibCheck, strict }).toEqual({
      allowJs: true,
      checkJs: true,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
    });
    expect(config['include']).toEqual([
      'src/**/*',
      'test/**/*',
      'tests/**/*',
      '__tests__/**/*',
      'e2e/**/*',
      'vitest*.ts',
    ]);
  });

  it('extends a jsconfig.json when the project has no tsconfig.json', () => {
    const config = transformed(
      'tsconfig.quality.json',
      javascriptLayout,
      projectWith('jsconfig.json'),
    );
    expect(config['extends']).toBe('./jsconfig.json');
    expect(compilerOptions(config)['checkJs']).toBe(true);
  });

  it('prefers tsconfig.json over jsconfig.json', () => {
    const config = transformed(
      'tsconfig.quality.json',
      javascriptLayout,
      projectWith('jsconfig.json', 'tsconfig.json'),
    );
    expect(config['extends']).toBe('./tsconfig.json');
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
    expect(config['extends']).toBe('./tsconfig.json');
    expect(compilerOptions(config)).not.toHaveProperty('checkJs');
  });
});

describe('generated tsconfig.stryker.json', () => {
  it('type-checks JavaScript mutants without forcing noEmit', () => {
    const config = transformed('tsconfig.stryker.json', javascriptLayout, projectWith());
    const { allowJs, checkJs, strict } = compilerOptions(config);
    expect({ allowJs, checkJs, strict }).toEqual({ allowJs: true, checkJs: true, strict: true });
    expect(compilerOptions(config)).not.toHaveProperty('noEmit');
  });

  it('layers the JavaScript options over the project config', () => {
    const javascript = transformed(
      'tsconfig.stryker.json',
      javascriptLayout,
      projectWith('jsconfig.json'),
    );
    expect(javascript['extends']).toBe('./jsconfig.json');
    const { skipLibCheck, allowJs, checkJs } = compilerOptions(javascript);
    expect({ skipLibCheck, allowJs, checkJs }).toEqual({
      skipLibCheck: true,
      allowJs: true,
      checkJs: true,
    });
    const typescript = transformed(
      'tsconfig.stryker.json',
      typescriptLayout,
      projectWith('tsconfig.json'),
    );
    expect(typescript['extends']).toBe('./tsconfig.json');
    expect(compilerOptions(typescript)).not.toHaveProperty('checkJs');
  });

  it('leaves the TypeScript stryker config untouched for the default layout', () => {
    expect(layoutTransformFor('tsconfig.stryker.json', typescriptLayout)).toBeTypeOf('function');
    expect(transformed('tsconfig.stryker.json', typescriptLayout, projectWith())).toEqual(
      defaultJson('tsconfig.stryker.json'),
    );
  });
});

describe('generated knip.json', () => {
  const base = defaultJson('knip.json');

  it('adds the JavaScript entry files and config files', () => {
    const config = layoutKnipConfig(base, javascriptLayout);
    expect(textsOf(config['entry']).slice(0, textsOf(base['entry']).length)).toEqual(base['entry']);
    const added = [
      'src/main.{js,mjs,cjs}',
      'vitest.config.{js,mjs,cjs}',
      'tests/fixtures/*harness*.{js,mjs,cjs}',
    ];
    expect(added.filter((entry) => !textsOf(config['entry']).includes(entry))).toEqual([]);
    expect(config['project']).toEqual([...textsOf(base['project']), '*.config.{js,mjs,cjs}']);
  });

  it('does not add them for TypeScript', () => {
    const config = layoutKnipConfig(base, typescriptLayout);
    expect(config['entry']).toEqual(base['entry']);
    expect(config['project']).toEqual(base['project']);
  });

  it('moves the JavaScript entries to the custom roots and appends declared entry points', () => {
    const layout = {
      ...resolveLayout({ sourceRoots: ['lib'] }, [], { javascript: true }),
      entryPoints: ['tools/run.js'],
    };
    const config = layoutKnipConfig(base, layout);
    expect(textsOf(config['entry']).filter((entry) => entry.includes('main.{js'))).toEqual([
      'lib/main.{js,mjs,cjs}',
      'lib/main/main.{js,mjs,cjs}',
    ]);
    expect(textsOf(config['entry']).at(-1)).toBe('tools/run.js');
    expect(textsOf(config['project']).filter((entry) => entry.endsWith('{js,mjs,cjs}'))).toEqual([
      '*.config.{js,mjs,cjs}',
    ]);
  });

  it('is rewritten for the default JavaScript layout', () => {
    const config = transformed('knip.json', javascriptLayout, projectWith());
    expect(textsOf(config['entry']).filter((entry) => entry.startsWith('vitest.config'))).toEqual([
      'vitest.config.ts',
      'vitest.config.{js,mjs,cjs}',
    ]);
  });
});

describe('generated jscpd.json', () => {
  const base = defaultJson('jscpd.json');

  it('scans the JavaScript format next to the base formats, so .ts files in a JavaScript project are scanned', () => {
    const formats = [...textsOf(base['format']), 'javascript'];
    expect(layoutJscpdConfig(base, javascriptLayout)['format']).toEqual(formats);
    expect(transformed('jscpd.json', javascriptLayout, projectWith())['format']).toEqual(formats);
  });

  it('keeps the base formats for the TypeScript preset', () => {
    expect(layoutJscpdConfig(base, typescriptLayout)['format']).toEqual(base['format']);
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
    )?.(defaultText('tsconfig.quality.json'));
    expect(text?.endsWith('}\n')).toBe(true);
    expect(text?.split('\n')[1]).toBe('  "compilerOptions": {');
  });
});
