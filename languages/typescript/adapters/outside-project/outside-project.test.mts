import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { typescriptApi } from '../typed/typescript-program.mts';
import { isReportedDiagnostic } from '../static-checks/typescript.mts';
import { projectFile } from '../static-checks/shared.mts';
import { normalizeArchitectureViolations } from '../static-checks-runner.mts';
import { layeredPrettierOptions } from '../typed/prettier-layers.mts';

const ts = typescriptApi();
const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-outside-project-')));
const member = path.join(workspace, 'packages/element');
const sibling = path.join(workspace, 'packages/common');

for (const [folder, file, text] of [
  [member, 'src/align.ts', 'export const align: number = "left";\n'],
  [sibling, 'debug.ts', 'export const debug: number = "on";\n'],
] as const) {
  mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
  writeFileSync(path.join(folder, file), text);
}

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function diagnosticsOf(
  files: readonly string[],
): readonly Parameters<typeof isReportedDiagnostic>[0][] {
  const program = ts.createProgram([...files], { noEmit: true, noLib: true, types: [] });
  return files.flatMap((file) => ts.getPreEmitDiagnostics(program, program.getSourceFile(file)));
}

describe('a type check diagnostic in a file outside the project', () => {
  const filter = {
    layout: { isExcluded: () => false, isTestFile: () => false },
    contextOnly: new Set<string>(),
    projectRoot: member,
  };

  it('is left out, and the diagnostics of the project files stay', () => {
    const diagnostics = diagnosticsOf([
      path.join(member, 'src/align.ts'),
      path.join(sibling, 'debug.ts'),
    ]);

    const reported = diagnostics.filter(
      (diagnostic) => diagnostic.file !== undefined && isReportedDiagnostic(diagnostic, filter),
    );

    expect(reported.map((diagnostic) => diagnostic.file?.fileName)).toEqual([
      path.join(member, 'src/align.ts'),
    ]);
  });

  it('names the project folder and the path from it when a path still leaves the project', () => {
    expect(() => projectFile(member, path.join(sibling, 'debug.ts'))).toThrow(
      `Analyzer path must stay within the project folder ${member}: ` +
        `${path.join(sibling, 'debug.ts')} is ../common/debug.ts from it`,
    );
  });
});

describe('a dependency-cruiser violation of a module outside the project', () => {
  const violation = (from: string, to: string) => ({
    type: 'dependency',
    from,
    to,
    rule: { name: 'no-orphans', severity: 'error' },
  });

  it('is left out, and the violations of the project modules stay', () => {
    const report = {
      summary: {
        violations: [
          violation('../common/src/index.ts', '../math/src/index.ts'),
          violation('src/align.ts', '../common/src/index.ts'),
        ],
      },
    };

    const findings = normalizeArchitectureViolations(report, 'dependency-architecture');

    expect(findings.map((finding) => finding.path)).toEqual(['src/align.ts']);
  });

  it('keeps a cycle that passes through the project, reported at its project module', () => {
    const report = {
      summary: {
        violations: [
          {
            ...violation('../common/src/index.ts', 'src/align.ts'),
            type: 'cycle',
            cycle: [{ name: 'src/align.ts' }, { name: '../common/src/index.ts' }],
          },
        ],
      },
    };

    const findings = normalizeArchitectureViolations(report, 'dependency-architecture');

    expect(findings.map((finding) => finding.path)).toEqual(['src/align.ts']);
  });
});

describe("the project's own Prettier config that cannot be loaded", () => {
  it('is reported to the caller and leaves the other layers in place', async () => {
    const errors: unknown[] = [];
    const prettier = {
      resolveConfig: () => Promise.reject(new Error("Cannot find package '@acme/prettier-config'")),
    };

    const options = await layeredPrettierOptions(prettier, {
      precedence: ['project', 'nitpicker'],
      policyIgnorePath: '',
      projectRoot: member,
      liveProjectRoot: member,
      relativePath: 'src/align.ts',
      policyOptions: { printWidth: 100 },
      onConfigError: (error) => errors.push(error),
    });

    expect(options['printWidth']).toBe(100);
    expect(errors).toHaveLength(1);
  });
});
