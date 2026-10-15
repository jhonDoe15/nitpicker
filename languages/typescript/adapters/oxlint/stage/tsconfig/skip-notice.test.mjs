import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { typeAwareSkipNotice } from './skip-notice.mjs';

const ROOT = path.resolve('/work/app');
const OPT_OUT =
  'To lint with ESLint instead, set {"tools":{"eslint":{"engine":"eslint"}}} in nitpicker.config.json.';

function configError(help) {
  return { message: 'Invalid tsconfig', code: 'typescript(tsconfig-error)', help, labels: [] };
}

const sources = [
  {
    file: path.join(ROOT, 'node_modules/@fixture/base/tsconfig.json'),
    options: { futureOption: 1 },
  },
  { file: path.join(ROOT, 'tsconfig.json'), options: { types: ['absent-types'], oldOption: true } },
  { file: path.join(ROOT, '.nitpicker-diff-policy-0.json'), options: { strict: true } },
];

describe('the type-aware skip notice', () => {
  it('names each option, the file that sets it, and the engine opt-out, on the project tsconfig', () => {
    const configErrors = [
      configError(
        "Option 'futureOption' has been removed. Please remove it from your configuration.\nSee the issue.",
      ),
      configError("Option 'oldOption' is deprecated and will stop functioning in TypeScript 8."),
      configError("Cannot find type definition file for 'absent-types'."),
      configError("Cannot find type definition file for 'absent-types'."),
    ];

    expect(typeAwareSkipNotice({ configErrors, sources, projectRoot: ROOT })).toEqual({
      filePath: 'tsconfig.json',
      messages: [
        {
          ruleId: 'nitpicker/type-aware-rules-skipped',
          severity: 2,
          line: 1,
          column: 1,
          message:
            "Type-aware rules did not run: TypeScript 7 removed tsconfig option 'futureOption' (set in " +
            'node_modules/@fixture/base/tsconfig.json); remove or replace it. ' +
            "TypeScript 7 deprecates tsconfig option 'oldOption' (set in tsconfig.json); remove or " +
            "replace it. No type definitions found for 'absent-types' (set in tsconfig.json); install " +
            `them or remove the entry. ${OPT_OUT}`,
        },
      ],
    });
  });

  it('fails the run when no project tsconfig can carry the notice', () => {
    const configErrors = [configError("Option 'outFile' has been removed.")];

    expect(() =>
      typeAwareSkipNotice({ configErrors, sources: sources.slice(2), projectRoot: ROOT }),
    ).toThrow(
      `Type-aware rules did not run: TypeScript 7 removed tsconfig option 'outFile'; remove or replace it. ${OPT_OUT}`,
    );
  });
});
