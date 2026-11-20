import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-non-latin1-header-value.mts';

const tester = typescriptRuleTester();

function flagged(code: string, count = 1) {
  return { code, errors: Array.from({ length: count }, () => ({ messageId: 'encodeHeader' })) };
}

tester.run('no-non-latin1-header-value', rule, {
  valid: [
    { code: 'res.setHeader("x-file-path", encodeURI(file.relative));' },
    { code: 'res.setHeader("content-type", "text/html");' },
    { code: 'res.setHeader("x-count", String(items.length));' },
    { code: 'res.setHeader("x-token", token);' },
    { code: 'res.setHeader("x-count", data);' },
    { code: 'res.setHeader("x-data", btoa(data));' },
    { code: 'fetch(url, { headers: { "X-Data": encodeURIComponent(JSON.stringify(data)) } });' },
    {
      code: `fetch(url, { headers: { "X-Name": "static", Authorization: \`Bearer \${token}\` } });`,
    },
    { code: 'const config = { headers: { "x-path": file.relative } };' },
    { code: 'map.set("key", file.relative);' },
    { code: 'cache.set("x-path", file.path);' },
    { code: 'res.setHeader("x-url", req.url);' },
    { code: 'headers.set("x-name", name);' },
    { code: 'res.writeHead(200, { "content-length": body.length });' },
  ],
  invalid: [
    flagged(
      'const o = data ? { headers: { ...h, "X-Prerender-Data": data } } : { headers: h }; fetch(u, o ?? { headers: { ' +
        '"X-Prerender-Data": data } });',
    ),
    flagged('res.setHeader("x-file-path", file.relative);'),
    flagged('res.setHeader("x-file-path", ok ? file.relative : "a");'),
    flagged('fetch(url, { headers: { ...headers, "X-Prerender-Data": JSON.stringify(data) } });'),
    flagged('const r = new Request(url, { headers: { "x-spec": spec.relativePath } });'),
    flagged(`headers.set("x-user", \`user \${user.username}\`);`),
    flagged('response.header("x-route", routePath);'),
    flagged('reply.header("x-name", req.query.name);'),
    flagged('res.writeHead(200, { "x-path": filePath, "x-data": JSON.stringify(state) });', 2),
    flagged('const h = new Headers({ "x-path": pathname });'),
    flagged('res.setHeader("x-rel", path.relative(root, file));'),
    flagged('axios.get(url, { headers: { "x-file": "a" + filename } });'),
  ],
});
