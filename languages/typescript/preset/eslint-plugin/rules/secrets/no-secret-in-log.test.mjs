import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-secret-in-log.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/billing/adapters/billing-client.ts';

const logged = (name) => ({ messageId: 'secretInLog', data: { name: `\`${name}\`` } });

tester.run('no-secret-in-log', rule, {
  valid: [
    'logger.info("token refreshed");',
    'logger.info({ hasToken: true });',
    'logger.info({ token: true });',
    `logger.info(\`has token: \${hasToken}\`);`,
    'logger.info({ tokenCount: 3 });',
    'logger.info(token.length);',
    'logger.info(mask(token));',
    'logger.info(typeof token);',
    'console.log(tokenizer.token);',
    'console.log(API_TOKEN);',
    'logger.info(isToken);',
    'cache.info(token);',
    'cache.log(password);',
    'register(token);',
    'throw new Error("token expired");',
    'process.stdout.write("done");',
    'logger.info({ token: mask(token) });',
    'logger.info({ token: token.slice(-4) });',
    'logger.info({ token: undefined });',
    'logger.info(maskedToken);',
    'logger.info(redactedPassword);',
    'logger.info(nextToken, pageToken, continuationToken, cancellationToken);',
    'console.log(await load());',
  ].map((code) => ({ filename, code })),
  invalid: [
    { code: 'logger.info(csrfToken);', errors: [logged('csrfToken')] },
    { code: 'logger.info(refreshToken);', errors: [logged('refreshToken')] },
    { code: 'logger.child({ token });', errors: [logged('token')] },
    { code: 'logger.info("x", [token]);', errors: [logged('token')] },
    { code: 'logger.info(await token);', errors: [logged('token')] },
    { code: 'logger.info(token);', errors: [logged('token')] },
    { code: 'console.log("login", password);', errors: [logged('password')] },
    { code: `this.logger.debug(\`key \${config.apiKey}\`);`, errors: [logged('config.apiKey')] },
    { code: 'log.warn("auth " + accessToken);', errors: [logged('accessToken')] },
    { code: 'logger.info({ token });', errors: [logged('token')] },
    { code: 'logger.info({ user, password: pw });', errors: [logged('password')] },
    { code: 'logger.error(String(secret));', errors: [logged('secret')] },
    { code: 'logger.error(JSON.stringify(credentials));', errors: [logged('credentials')] },
    { code: 'logger.error(token.toString());', errors: [logged('token')] },
    { code: 'console.error(process.env.API_TOKEN);', errors: [logged('process.env.API_TOKEN')] },
    { code: `throw new Error(\`bad \${password}\`);`, errors: [logged('password')] },
    { code: 'process.stderr.write(token);', errors: [logged('token')] },
    { code: 'req.log.info(sessionToken ?? "none");', errors: [logged('sessionToken')] },
  ].map((test) => ({ filename, ...test })),
});
