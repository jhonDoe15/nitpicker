import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-single-shape-manifest-field.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'singleShape' }] };
}

tester.run('no-single-shape-manifest-field', rule, {
  valid: [
    'function f(manifest, name) { const b = manifest.bundleDependencies; return Array.isArray(b) && b.includes(name); }',
    'function f(manifest) { return Array.isArray(manifest.workspaces) ? manifest.workspaces.map(String) : []; }',
    "function f(pkg) { return typeof pkg.bundleDependencies === 'boolean' ? [] : pkg.bundleDependencies.map(String); }",
    'function f(manifest) { return manifest.dependencies.length; }',
    'function f(config) { return config.workspaces.map(String); }',
    'function f(manifest) { return manifest.workspaces; }',
    'function f(manifest) { return manifest.bin.startsWith("x"); }',
    'function f(pkg) { const list = pkg.keywords; return list.map(String); }',
    "const data = JSON.parse(readFileSync('data.json', 'utf8')); data.workspaces.map(String);",
    'function f(manifest, name) { const bundled = manifest.bundleDependencies; if (!Array.isArray(bundled)) { return false; } return bundled.includes(name); }',
    'function f(pkg, n) { return pkg.bundleDependencies === true ? [] : pkg.bundleDependencies.includes(n); }',
    'function f(pkg, n) { if (pkg.bundleDependencies === false) { return false; } return pkg.bundleDependencies.includes(n); }',
    "function f(pkg) { return 'packages' in pkg.workspaces ? pkg.workspaces.packages : pkg.workspaces; }",
    'function f(pkg) { return pkg.workspaces instanceof Array ? pkg.workspaces.map(String) : []; }',
    'function f(manifest) { return isStringArray(manifest.workspaces) ? manifest.workspaces.map(String) : []; }',
    'function f(pkg) { pkg.workspaces ||= []; return pkg.workspaces.map(String); }',
    'function f(pkg) { pkg.workspaces = []; return pkg.workspaces.map(String); }',
    'function f(pkg) { return pkg.workspaces?.packages ?? pkg.workspaces; }',
    'function f(manifest: { workspaces: string[] }) { return manifest.workspaces.map(String); }',
    'function f(pkg) { const { name } = pkg; return name.length; }',
    'function f(pkg) { const { bundleDependencies } = pkg; return Array.isArray(bundleDependencies) && bundleDependencies.includes("a"); }',
    'function f() { const data = load(); return data.workspaces.map(String); }',
    'function f() { return data.workspaces.map(String); }',
    'function f() { let data; return data.workspaces.map(String); }',
    'function f(pkg) { const { workspaces: [first] } = pkg; return first.map(String); }',
    'function f(pkg) { const { [key]: bundleDependencies } = pkg; return bundleDependencies.map(String); }',
  ],
  invalid: [
    invalid('function f(pkg, n) { pkg.version = "1"; return pkg.bundleDependencies.includes(n); }'),
    invalid(
      'function f(pkg, n) { const { bundleDependencies } = pkg; return bundleDependencies.includes(n); }',
    ),
    invalid(
      'function f(pkg, n) { const { bundleDependencies: bundled } = pkg; return bundled.includes(n); }',
    ),
    invalid(
      'function f(manifest: { workspaces: string }) { return manifest.workspaces.map(String); }',
    ),
    invalid('function f(manifest, name) { return manifest.bundleDependencies.includes(name); }'),
    invalid('function f(pkg) { return pkg.workspaces.map(String); }'),
    invalid('function f(packageJson) { return packageJson.workspaces?.forEach(run); }'),
    invalid('function f(packageJson) { return packageJson.workspaces.packages; }'),
    invalid('function f(manifest) { return manifest.man.map(String); }'),
    invalid('function f(manifest) { return (manifest.bundleDependencies ?? []).includes("a"); }'),
    invalid(
      'function isBundled(name, manifest) { const bundled = manifest.bundledDependencies || manifest.bundleDependencies; return bundled ? bundled.includes(name) : false; }',
    ),
    invalid(
      "function f() { const pkg2 = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); return pkg2.bundleDependencies.includes('a'); }",
    ),
    invalid('function f(input: PackageJson) { return input.workspaces.map(String); }'),
    invalid('function f(ctx) { return ctx.manifest.bundledDependencies.includes("a"); }'),
    invalid('pkg.workspaces.map(String);'),
    invalid('function f(pkg) { pkg[key] = 1; return pkg.workspaces.map(String); }'),
    invalid(
      'function f(pkg, n) { const { bundleDependencies = [] } = pkg; return bundleDependencies.includes(n); }',
    ),
    invalid('function f(pkg) { return (pkg?.workspaces).map(String); }'),
    invalid("function f(pkg) { return pkg['workspaces'].map(String); }"),
  ],
});
