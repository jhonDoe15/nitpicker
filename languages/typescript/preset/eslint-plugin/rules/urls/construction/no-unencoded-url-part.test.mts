import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-unencoded-url-part.mts';

const tester = typescriptRuleTester();

function flagged(code: string, messageId: string) {
  return { code, errors: [{ messageId }] };
}

tester.run('no-unencoded-url-part', rule, {
  valid: [
    'const link = `${base}/items?page=${page}&limit=${limit}`;',
    'const link = `${apiUrl}/items?id=${item.id}`;',
    'const link = `${apiUrl}/items?q=${encodeURIComponent(query)}`;',
    'const link = `https://example.test/search?q=${encodeURIComponent(query)}`;',
    'const link = `${apiUrl}/${encodeURIComponent(branch)}/files`;',
    'const link = `${apiUrl}/refs/${key.split("/").map(encodeURIComponent).join("/")}`;',
    'const link = `${apiUrl}/refs/${params.toString()}`;',
    'const link = `${apiUrl}/users/${userId}`;',
    'const link = `${apiUrl}/repos/${owner}/${repo}`;',
    'const link = `${repositoryUrl}/blob/${branch}/${filePath}`;',
    'const link = `${apiUrl}/auth?client_id=${env.CLIENT_ID}&token=${inviteToken}`;',
    'const link = `${GOOGLE_URL}?access_token=${accessToken}`;',
    'const url = new URL(`${basePath}/integrations`, origin);',
    'const link = `${apiUrl}/users/${count}`;',
    'const link = `${apiUrl}/users/${url.pathname}`;',
    'const link = `${dir}/${name}.json`;',
    'const message = `Searching ?q=${query} for you`;',
    'const query = sql`select * from t where a = ${name}?x=${y}`;',
    'const link = `${baseUrl}?page=1`;',
    'const callbackUrl = "https://app.test/cb"; const link = `${callbackUrl}?error=1`;',
    'const link = `${request.url}?${search}`;',
    'const link = `${pathToFileURL(file).href}?stamp=${Date.now()}`;',
    'const url = new URL(`${authUrl.pathname}/.well-known/x`, base);',
    'const link = `${className}?class=${className}`;',
    'const link = `${apiUrl}?page=1`;',
    'const link = `?q=${encodeURIComponent(term)}`;',
    'const url = new URL(`${path}`);',
    'const url = new URL(`/${path}`, base);',
    'const url = new URL(`${origin}/x`, base);',
    'const db = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/db`;',
    'const db = `postgres://${host}:${port}/db`;',
    'const db = `postgres://user:${port}@${host}/db`;',
    'const line = `${key}=${value}`;',
    'const text = `a?b=${value} and more`;',
    'const link = `https://gitea.test/api/v1/repos/${o}/${r}/archive/${ref}.tar.gz`;',
    'const link = `https://gitea.test/${o}/${r}/src/branch/${defaultBranch}`;',
    'const link = `https://gitea.test/${o}/${r}/_edit/${ref}/${filePath}`;',
    'const link = `https://codeload.test/tar.gz/${repo.branch}`;',
    'const link = `https://example.test/releases/tag/${gitTag}`;',
    'const link = `${returnUrl}?checkout_success=1`;',
    {
      code: 'const link = `${apiUrl}/search?q=${query}`;',
      filename: 'survey.mock.ts',
    },
  ],
  invalid: [
    flagged('const link = `${callbackURL}?error=${message}`;', 'appendedQuery'),
    flagged('const link = `${redirectUrl}?next=1`;', 'appendedQuery'),
    flagged('const link = `${errorURL || callbackURL}?error=${message}`;', 'appendedQuery'),
    flagged(
      'const url = `${ctx.baseURL}/verify?token=${token}&callbackURL=${ctx.body.callbackURL || "/"}`;',
      'queryValue',
    ),
    flagged('url.search = `?ref=${branch}`;', 'queryValue'),
    flagged(
      'const callbackUrl = "https://app.test/cb?a=1"; const link = `${callbackUrl}?error=1`;',
      'appendedQuery',
    ),
    flagged(
      'const link = `https://example.test/verify?token=${token}&callback=${callbackUrl}`;',
      'queryValue',
    ),
    flagged('const link = `${apiUrl}/search?q=${query}`;', 'queryValue'),
    flagged('const link = `${apiUrl}/logout?redirectUrl=${redirect}`;', 'queryValue'),
    flagged('const link = `${gitlabUrl}/files?ref=${branch}`;', 'queryValue'),
    flagged(
      'const link = `https://api.test/repos/${owner}/${repo}/branches/${branch}`;',
      'pathSegment',
    ),
    flagged('const link = `${apiUrl}/files/${upload.fileName}`;', 'pathSegment'),
    flagged('const link = `${apiUrl}/branches/${branch}`;', 'pathSegment'),
    flagged('const link = `${apiUrl}/verify/${token}`;', 'pathSegment'),
    flagged('const link = `${apiUrl}/search?q=${options?.query}`;', 'queryValue'),
    flagged('const link = `${apiUrl}/labels/${request.body.label}`;', 'pathSegment'),
    flagged('const url = new URL(`${path}/x`, origin);', 'relativeStart'),
    flagged('const url = new URL(`${req.pathname}`, origin);', 'relativeStart'),
    flagged('const db = `postgres://${user}:${password}@${host}/db`;', 'credentials'),
    flagged(
      'const db = `redis://${config.user}:${encodeURIComponent(secret)}@${host}`;',
      'credentials',
    ),
    flagged('const db = `mongodb+srv://${dbUser}:${dbPassword}@${host}/db`;', 'credentials'),
  ],
});
