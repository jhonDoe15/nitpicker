import path from 'node:path';
import type { Linter } from 'eslint';
import type { CaseOutcome, FailureMessageCase, Fixture } from './case-types.mts';
import { appendSentence, linter } from './harness-views.mts';
import { eslintRoute } from '../../../adapters/hints/eslint-routes.mts';

export function projectRelative(filename: string): string {
  return path.isAbsolute(filename) ? path.relative(process.cwd(), filename) : filename;
}

export function lintFixture({ config, filename, code }: Fixture): Linter.LintMessage[] {
  return linter.verify(code, config, { filename });
}

export function failureMessagesFor({ config, filename, code }: Fixture): string[] {
  return lintFixture({ config, filename, code }).map((message) => message.message);
}

function routedMessagesFor({ config, filename, code }: Fixture): string[] {
  return lintFixture({ config, filename, code }).map((message) =>
    message.ruleId === null
      ? message.message
      : appendSentence(
          message.message,
          eslintRoute({ rule: message.ruleId, path: projectRelative(filename) }),
        ),
  );
}

export function checkFailureMessageCase({
  config,
  filename = 'src/fixture.ts',
  banned,
  allowed,
}: Pick<FailureMessageCase, 'banned' | 'allowed'> &
  Partial<Pick<FailureMessageCase, 'config' | 'filename'>>): CaseOutcome {
  const messages = routedMessagesFor({ config, filename, code: banned });
  if (messages.length === 0) {
    return { ok: false, reason: 'banned fixture produced no lint failure', messages };
  }
  const named = messages.some((message) => message.toLowerCase().includes(allowed.toLowerCase()));
  if (!named) {
    return {
      ok: false,
      reason: `no failure message names the allowed form "${allowed}"`,
      messages,
    };
  }
  return { ok: true, messages };
}
