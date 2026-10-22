import { Linter } from 'eslint';
import { appendSentence } from '../../../../../shared/messages/exception-sentence.mjs';
import { eslintRoute } from '../../../adapters/hints/eslint-hints.mjs';

const linter = new Linter();

export function lintFixture({ config, filename, code }) {
  return linter.verify(code, config, { filename });
}

export function failureMessagesFor({ config, filename, code }) {
  return lintFixture({ config, filename, code }).map((message) =>
    appendSentence(message.message, eslintRoute({ rule: message.ruleId, path: filename })),
  );
}

export function checkFailureMessageCase({ config, filename = 'src/fixture.ts', banned, allowed }) {
  const messages = failureMessagesFor({ config, filename, code: banned });
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
