import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-unchecked-url-sink.mts';

const tester = typescriptRuleTester({ ecmaFeatures: { jsx: true } });

function flagged(code: string) {
  return { code, errors: [{ messageId: 'unchecked' as const }] };
}

tester.run('no-unchecked-url-sink', rule, {
  valid: [
    'const a = <a href="https://example.test">x</a>;',
    'const a = <a href={`/items/${id}`}>x</a>;',
    'const a = <a href={"/items"}>x</a>;',
    'const a = <a href={`https://example.test/${id}`}>x</a>;',
    'const a = <a href={safeUrl}>x</a>;',
    'const safeUrl = getSafeHttpUrl(model.serverUrl); const a = <a href={safeUrl}>x</a>;',
    'const a = <a href={getSafeHttpUrl(model.serverUrl)}>x</a>;',
    'const a = <a href={sanitizeUrl(model.url)}>x</a>;',
    'function F({ model }) { return /^https?:/.test(model.url) ? <a href={model.url}>x</a> : null; }',
    'function F({ model }) { const parsed = URL.parse(model.url); return parsed?.protocol === "https:" ' +
      '&& <a href={model.url}>x</a>; }',
    'function F({ model }) { if (!isSafeUrl(model.url)) { return null; } return <a href={model.url}>x</a>; }',
    'function F(props) { return <a href={props.href}>x</a>; }',
    'function F({ href }) { return <a href={href}>x</a>; }',
    'function F({ record }) { return <a href={record.id}>x</a>; }',
    'const a = <a href={model.name}>x</a>;',
    'function F({ item }) { return <a href={item.href}>x</a>; }',
    'const a = <a href={model.url ? "/x" : "#"}>x</a>;',
    'const a = <div href={model.url}>x</div>;',
    'const a = <iframe src="https://example.test/embed" />;',
    'const a = <iframe src={`${origin}/embed`} />;',
    'window.open("https://example.test");',
    'window.open(buildUrl(model));',
    'location.assign("/login");',
    'location.href = `/items/${id}`;',
    'other.open(model.url);',
    'const a = <img src={model.imageUrl} />;',
    'const a = <Route path={model.url} />;',
    'const items = [{ docsUrl: "https://a.dev" }]; export const A = () => <>{items.map((i) => <a ' +
      'href={i.docsUrl}>x</a>)}</>;',
    'export const A = () => <>{[{ url: "/a" }].map((i) => <a href={i.url}>x</a>)}</>;',
    {
      code: 'export const A = ({ survey }) => <a href={survey.url}>x</a>;',
      filename: 'emails/survey.tsx',
    },
  ],
  invalid: [
    flagged('const a = <a href={model.serverUrl} target="_blank">{model.serverUrl}</a>;'),
    flagged('function F({ record }) { return <a href={record.url}>x</a>; }'),
    flagged('function F({ item }) { return <Link href={item.profileUrl}>x</Link>; }'),
    flagged('function F({ item }) { return <NextLink href={item.website}>x</NextLink>; }'),
    flagged('function F({ item }) { return <a href={item.url || "#"}>x</a>; }'),
    flagged('const a = <a href={model?.serverUrl}>x</a>;'),
    flagged('const A = ({ items }) => <>{items.map((i) => <a href={i.docsUrl}>x</a>)}</>;'),
    flagged('function F({ item }) { return <a href={item.url ?? undefined}>x</a>; }'),
    flagged('const a = <iframe src={resource.url} sandbox="allow-scripts allow-same-origin" />;'),
    flagged('const a = <embed src={doc.fileUrl} />;'),
    flagged('const a = <form action={model.actionUrl} />;'),
    flagged('function F({ record }) { const url = record.url; return <a href={url}>x</a>; }'),
    flagged('function F({ record }) { const { url } = record; return <a href={url}>x</a>; }'),
    flagged('function open(item) { window.open(item.url, "_blank"); }'),
    flagged('function go(item) { window.location.assign(item.redirectUrl); }'),
    flagged('function go(item) { location.href = item.url; }'),
    flagged('function go(item) { window.location.href = item.returnTo; }'),
    flagged('function go(item) { location.replace(item.url); }'),
  ],
});
