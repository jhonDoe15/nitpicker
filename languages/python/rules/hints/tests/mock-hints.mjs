import { RULES_TOOL } from '../tool.mjs';

const LOOKED_UP = /^(\S+) \(looked up as (\S+)\)$/u;

function specDescription(subject = '') {
  return subject.startsWith('patch of ')
    ? `The ${subject} has no \`autospec\`, so the replacement accepts any call and keeps passing when the signature changes`
    : `\`${subject}\` has no spec, so it answers any attribute and any call and keeps passing when the class changes`;
}

function lookupDescription(subject = '') {
  const match = LOOKED_UP.exec(subject);
  if (match === null) {
    return `\`${subject}\` is patched where it is defined, not where the code looks it up`;
  }
  return `The patch replaces \`${match[1]}\` where it is defined, but the code under test looks it up as \`${match[2]}\`, which still holds the original`;
}

export const MOCK_HINTS = [
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
