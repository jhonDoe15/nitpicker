import { temporaryRepositories } from '../../../../../scripts/test-support/temporary-repositories.mts';
import { planCodeFixes } from '../plan-code-fixes.mts';

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    target: 'es2022',
    module: 'nodenext',
    moduleResolution: 'nodenext',
    noImplicitOverride: true,
    noEmit: true,
  },
  include: ['src'],
};

type FixOptions = {
  readonly target?: string;
  readonly javascript?: true;
  readonly selectedRules?: readonly string[];
};

export function useCodeFixProjects() {
  const repository = temporaryRepositories('nitpicker-code-fix-');
  return function fixes(
    files: Readonly<Record<string, string>>,
    { target = 'src/a.ts', ...options }: FixOptions = {},
  ): ReturnType<typeof planCodeFixes> {
    const root = repository({
      'tsconfig.json': JSON.stringify(TSCONFIG),
      'package.json': '{"type":"module"}',
      ...files,
    });
    return planCodeFixes({
      projectRoot: root,
      javascript: false,
      files: [{ name: target, text: files[target] ?? '' }],
      ...options,
    });
  };
}
