import { SECRET_VALUE_CASES } from '../../../../../shared/naming/test-support/secret-value-cases.mjs';

const MARKERS = {
  secret: ' // violation: HardcodedSecret',
  credential: ' // violation: CredentialLiteral',
  none: '',
};

function javaString(value) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

export function secretValueCasesSource() {
  const cases = SECRET_VALUE_CASES.map(([name, value, verdict], index) =>
    [
      `  static final class Case${String(index + 1)} {`,
      `    final String ${name} = ${javaString(value)};${MARKERS[verdict]}`,
      '  }',
    ].join('\n'),
  );
  return [
    'package shop.secrets;',
    '',
    'final class SecretValueCases {',
    cases.join('\n\n'),
    '}',
    '',
  ].join('\n');
}
