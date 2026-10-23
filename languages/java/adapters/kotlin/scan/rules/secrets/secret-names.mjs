export const SECRET_MESSAGES = {
  HardcodedSecret:
    'Read it from the environment or a secrets manager and inject it: this value is a hardcoded secret.',
  CredentialLiteral:
    'Read it from the environment or a secrets manager: this string looks like a credential (access key, token, private key, or a password in a URL).',
  SecretInLog: 'Log that the secret is set, or a masked tail, instead of the secret itself.',
};
