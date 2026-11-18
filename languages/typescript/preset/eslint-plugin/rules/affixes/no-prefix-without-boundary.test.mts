import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-prefix-without-boundary.mts';

const ruleTester = typescriptRuleTester();

function failing(messageId: 'prefix' | 'suffix' | 'origin', codes: readonly string[]) {
  return codes.map((code) => ({ code, errors: [{ messageId }] }));
}

ruleTester.run('no-prefix-without-boundary', rule, {
  valid: cases([
    'if (pathname === base || pathname.startsWith(`${base}/`)) {}',
    "if (pathname === base || pathname.startsWith(base + '/')) {}",
    'if (pathname.startsWith(base + path.sep)) {}',
    "const prefix = base + '/'; if (pathname.startsWith(prefix)) {}",
    'if (pathname.startsWith(withTrailingSlash(base))) {}',
    "if (pathname.startsWith('/api/')) {}",
    "if (pathname.startsWith('/maintenance')) {}",
    "if (id.includes('dist')) {}",
    "if (cookieDomain.startsWith('.') && host.endsWith(cookieDomain)) {}",
    "if (filePath.startsWith('../')) {}",
    "if (filePath.startsWith('.')) {}",
    "if (model.startsWith('gpt-')) {}",
    'if (model.startsWith(modelPrefix)) {}',
    "if (name.startsWith('use')) {}",
    'if (line.startsWith(prefix)) {}',
    "if (hostname === domain || hostname.endsWith('.' + domain)) {}",
    'if (host === domain || host.endsWith(`.${domain}`)) {}',
    "if (hostname.endsWith('.example.com')) {}",
    "if (email.endsWith('@example.com')) {}",
    "if (file.endsWith('.ts')) {}",
    "if (id.includes('/node_modules/')) {}",
    "if (text.includes('node_modules')) {}",
    'if (/(?:^|[\\\\/])node_modules(?:[\\\\/]|$)/.test(id)) {}',
    "if (new URL(redirectUri).hostname === 'localhost') {}",
    'if (pathname.startsWith(base, 2)) {}',
    "if (pathname.startsWith('http://localhost/')) {}",
    'if (pathname.startsWith(...parts)) {}',
    'if (key.startsWith(token)) {}',
    'if (host.endsWith(pattern.slice(1))) {}',
    "if (id.includes('node_modules')) {}",
    "if (filePath.includes('.git')) {}",
    'if (modelId.startsWith(prefix)) {}',
    'if (item.id.startsWith(prefix)) {}',
    "if (hostname.startsWith('[') && hostname.endsWith(']')) {}",
    'const prefix = dir.endsWith(sep) ? dir : dir + sep; if (filePath.startsWith(prefix)) {}',
    "const base = d.endsWith('/') ? d : `${d}/`; if (pathname.startsWith(base)) {}",
    "let b = d; if (!b.endsWith('/')) b += '/'; if (pathname.startsWith(b)) {}",
    "if (pathname.startsWith(base) && pathname[base.length] === '/') {}",
    'if (route.startsWith(basePath) && route.length === basePath.length) {}',
    "if (pathname.startsWith(base) && pathname.charAt(base.length) === '/') {}",
  ]),
  invalid: [
    ...failing('prefix', [
      'if (pathname.startsWith(base)) {}',
      'const inside = filePath.startsWith(rootDir);',
      'if (pathname.startsWith(this.base)) {}',
      'if (url.pathname.startsWith(`/repos/${owner}/${name}`)) {}',
      "if (pathname.startsWith('/repos/' + owner)) {}",
      'if (imp.startsWith(packageName)) {}',
      'if (pathname.startsWith(config.basePath)) {}',
      'if (filePath.startsWith(prefix)) {}',
      'if (pathname.startsWith(base) || other) {}',
      'if (pathname === other || pathname.startsWith(base)) {}',
      'return normPath.startsWith(userDir);',
    ]),
    ...failing('suffix', [
      'if (hostname.endsWith(domain)) {}',
      "if (host.endsWith('example.com')) {}",
      'if (url.hostname.endsWith(cookie.domain)) {}',
    ]),
    ...failing('origin', [
      "if (redirectUri.startsWith('http://localhost')) {}",
      "const ok = value.startsWith('https://example.com');",
    ]),
  ],
});
