import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const LOOKED_UP = /^(\S+) \(looked up as (\S+)\)$/u;

function specDescription(subject = ''): string {
  return subject.startsWith('patch of ')
    ? `The ${subject} has no \`autospec\`, so the replacement accepts any call and keeps passing when the signature changes`
    : `\`${subject}\` has no spec, so it answers any attribute and any call and keeps passing when the class changes`;
}

function lookupDescription(subject = ''): string {
  const match = LOOKED_UP.exec(subject);
  if (match === null) {
    return `\`${subject}\` is patched where it is defined, not where the code looks it up`;
  }
  const [, defined = '', looked = ''] = match;
  return `The patch replaces \`${defined}\` where it is defined, but the code under test looks it up as \`${looked}\`, which still holds the original`;
}

export const MOCK_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['mock-without-spec'],
    describe: specDescription,
    allowed:
      'Give the stand-in the shape of what it replaces: `Mock(spec=Mailer)` or `create_autospec(Mailer, instance=True)` for a mock, `patch("shop.checkout.send", autospec=True)` or `new=` with a fake for a patch, or pass a hand-written fake.',
  },
  {
    tool: RULES_TOOL,
    rules: ['patch-misses-lookup'],
    describe: lookupDescription,
    allowed:
      'Patch the name in the module that looks it up (`patch("shop.checkout.send")` after `from shop.mailer import send` in `shop.checkout`), or have that module import the module (`from shop import mailer`, then `mailer.send(...)`).',
  },
];
