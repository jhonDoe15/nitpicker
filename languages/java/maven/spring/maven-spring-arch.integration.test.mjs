import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSpringArch } from './maven-spring-arch.mjs';

const roots = [];
let savedCache;

const RECORDING_RULES = `import java.nio.file.Files;
import java.nio.file.Path;

public class ArchRules {
  public static void main(String[] args) throws Exception {
    String here = Path.of("").toAbsolutePath().toRealPath().toString();
    Files.writeString(Path.of(args[0]), String.join("|", args[1], args[2], here));
  }
}
`;

const FAILING_RULES = `public class ArchRules {
  public static void main(String[] args) {
    System.err.println("boom");
    System.exit(1);
  }
}
`;

function temporary() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-arch-unit-'));
  roots.push(root);
  return root;
}

function rulesWith(source) {
  const rules = temporary();
  writeFileSync(path.join(rules, 'ArchRules.java'), source);
  return rules;
}

function moduleIn(root) {
  const basedir = path.join(root, 'module');
  const outputDirectory = path.join(basedir, 'target', 'classes');
  const reportDir = path.join(basedir, 'target', 'nitpicker');
  mkdirSync(outputDirectory, { recursive: true });
  mkdirSync(reportDir, { recursive: true });
  const testOutputDirectory = path.join(basedir, 'target', 'test-classes');
  return { module: { basedir, outputDirectory, testOutputDirectory }, reportDir };
}

function run({ rules, archRules = true, scope = moduleIn(temporary()) }) {
  const { module, reportDir } = scope;
  const options = {
    module,
    reportDir,
    tools: { archunit: [] },
    classpaths: { mainCompile: [], testCompile: [] },
    pinned: { archunit: '1.0' },
    archRules,
    rules,
  };
  runSpringArch(options);
  return { module, reportDir };
}

function cached() {
  const root = path.join(process.env.XDG_CACHE_HOME, 'nitpicker', 'spring-arch');
  return { root, entries: readdirSync(root) };
}

beforeEach(() => {
  savedCache = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = temporary();
});

afterEach(() => {
  if (savedCache === undefined) {
    delete process.env.XDG_CACHE_HOME;
  } else {
    process.env.XDG_CACHE_HOME = savedCache;
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('runSpringArch', () => {
  it('does nothing for a module that runs no architecture rules', () => {
    const { reportDir } = run({ rules: rulesWith(RECORDING_RULES), archRules: false });

    expect([readdirSync(reportDir), readdirSync(process.env.XDG_CACHE_HOME)]).toEqual([[], []]);
  });

  it('compiles the rules into the cache and runs them over the module class directories', () => {
    const { module, reportDir } = run({ rules: rulesWith(RECORDING_RULES) });
    const { root, entries } = cached();

    expect(readFileSync(path.join(reportDir, 'spring-arch.json'), 'utf8')).toBe(
      [module.outputDirectory, module.testOutputDirectory, realpathSync(module.basedir)].join('|'),
    );
    expect(entries.map((name) => name.length)).toEqual([64]);
    expect(readdirSync(path.join(root, entries[0]))).toEqual(['ArchRules.class']);
  });

  it('reuses the compiled rules while their sources are unchanged and compiles again when they change', () => {
    const rules = rulesWith(RECORDING_RULES);
    run({ rules });
    const first = cached();
    const compiled = path.join(first.root, first.entries[0], 'ArchRules.class');
    const before = statSync(compiled);
    run({ rules });
    const after = statSync(compiled);
    writeFileSync(path.join(rules, 'ArchRules.java'), `${RECORDING_RULES}\n`);
    run({ rules });

    expect([after.ino, after.mtimeMs, cached().entries.length]).toEqual([
      before.ino,
      before.mtimeMs,
      2,
    ]);
  });

  it('removes the previous report and reports a failing run with its output', () => {
    const scope = moduleIn(temporary());
    writeFileSync(path.join(scope.reportDir, 'spring-arch.json'), 'stale');

    expect(() => {
      run({ rules: rulesWith(FAILING_RULES), scope });
    }).toThrow(new Error('Spring architecture rules failed with exit code 1: boom'));
    expect(readdirSync(scope.reportDir)).toEqual([]);
  });

  it('leaves no half-built rules in the cache when javac fails', () => {
    expect(() => run({ rules: rulesWith('class ArchRules {') })).toThrow(
      /^Spring architecture rules failed with exit code 1/u,
    );
    expect(cached().entries).toEqual([]);
  });
});
