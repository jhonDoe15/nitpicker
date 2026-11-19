import { languageLevel, lintCompatible, lintCompiler } from '../../lint/javac-options.mts';
import { posix } from '../../lint/lint-staging.mts';
import { type LintCompiler, type LintPlan } from '../lint-plan.mts';

export const posixOf: (file: string) => string = posix;
export const languageLevelOf: (compiler: LintCompiler) => string[] = languageLevel;
export const lintCompatibleOf: (args: readonly string[]) => string[] = lintCompatible;
export const lintCompilerOf: (plan: LintPlan) => LintCompiler = lintCompiler;
