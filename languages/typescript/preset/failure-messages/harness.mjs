import { Linter } from 'eslint';

const linter = new Linter();

export function lintFixture({ config, filename, code }) {
  return linter.verify(code, config, { filename });
}

export function failureMessagesFor({ config, filename, code }) {
  return lintFixture({ config, filename, code }).map((message) => message.message);
}

// One case per banned form: `banned` is the fixture snippet that must fail, `allowed` is the
// wording (a substring, case-insensitive) the failure message must contain to name the allowed form.
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
