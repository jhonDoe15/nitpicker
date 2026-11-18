import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { typedRegexProject } from '../../regex/test-support/typed-project.mts';
import { rule } from './no-unescaped-html-interpolation.mts';

const tester = typescriptRuleTester();

function flagged(code: string, ...values: string[]) {
  return {
    code,
    errors: values.map((value) => ({ messageId: 'unescapedValue', data: { value } })),
  };
}

tester.run('no-unescaped-html-interpolation', rule, {
  valid: [
    'export const a = (p: string) => `did you mean to visit <a href="${escapeHtml(p)}">${escapeHtml(p)}</a>?`;',
    'export const a = (t: string) => `<img alt="${escapeAttribute(t)}">`;',
    'export const a = (t: string) => `<p>${_.escape(t)}</p>`;',
    'export const a = (t: string) => `<p>${he.encode(t)}</p>`;',
    'export const a = (t: string) => `<p>${DOMPurify.sanitize(t)}</p>`;',
    'export const a = (u: string) => `<a href="${encodeURI(u)}">x</a>`;',
    'export const a = (items: string[]) => `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;',
    'export const a = (name: string) => { const inner = `<b>${escapeHtml(name)}</b>`; return `<p>${inner}</p>`; };',
    'export const a = (bodyHtml: string) => `<main>${bodyHtml}</main>`;',
    'export const a = (n: number) => `<td>${n.toFixed(2)}</td>`;',
    'export const a = (list: string[]) => `<td>${list.length}</td>`;',
    'export const a = (a: number, b: number) => `<td>${a * b}</td>`;',
    'export const a = (a: boolean) => `<td>${a ? "yes" : "no"}</td>`;',
    'const TITLE = "Report";\nexport const a = () => `<title>${TITLE}</title>`;',
    'export const a = (name: string) => `hello ${name}`;',
    'export const a = (t: string) => `if x<b then ${t}`;',
    'export const a = (c: { classNames: { box: string } }) => `<div class="${c.classNames.box}">x</div>`;',
    'export const a = (c: unknown) => `<div>${renderToStaticMarkup(c)}</div>`;',
    'export const a = (name: string) => html`<p>${name}</p>`;',
    'export const a = (name: string) => sql`select ${name}`;',
    'export const a = () => "<p>" + "static" + "</p>";',
    'export const a = (name: string) => "name: " + name;',
    'export const a = (name: string) => "<p>" + escapeHtml(name) + "</p>";',
    'export const a = (t: string, safeLabel: string) => `<p>${safeLabel}</p>`;',
    'export const a = (name: string) => { el.textContent = name; return el; };',
    'export const a = (name: string) => `<p>${name ? escapeHtml(name) : ""}</p>`;',
    'export const a = (id: string) => `Paste <script> below:\n  var id = "${id}";\n  </script>`;',
    "export const a = (c: string) => `--icon: url('data:image/svg+xml,<svg></svg>');\n--color: ${c};`;",
    'export const a = (t: string) => { let x = escapeHtml(t); x = `<b>${x}</b>`; return x; };',
    'export const a = (e: string) => `<p>${e.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;',
    'export const a = (t: string) => `<p>${escapeHtml(t).replaceAll("\\n", "<br>")}</p>`;',
    'export const a = (to: string) => { throw new Error(`Expected <Link to="${to}"> to be set`); };',
    'export const a = (to: string) => console.warn(`<div> inside ${to} is invalid`);',
    'export const a = (to: string) => invariant(to, `<div id="${to}"> missing`);',
    'export const a = (n: string) => `<li><Link to="${n}">${n}</Link></li>`;',
    'export const a = (to: string) => `<Link to="${to}">go</Link>`;',
    'export const a = (nonce: string) => `<script nonce="${nonce}">x</script>`;',
  ],
  invalid: [
    flagged(
      'export const a = (p: string) => `did you mean to visit <a href="${p}">${p}</a>?`;',
      'p',
      'p',
    ),
    flagged(
      'export const a = (t: string, u: string) => `<img alt="${t}" title="${u}">`;',
      't',
      'u',
    ),
    flagged('export const a = (title: string) => `<title>${title}</title>`;', 'title'),
    flagged('export const a = (u: { name: string }) => `<td>${u.name}</td>`;', 'u.name'),
    flagged('export const a = (p: string) => "<a href=\\"" + p + "\\">go</a>";', 'p'),
    flagged('export const a = (t: string) => "<p>" + t.trim() + "</p>";', 't.trim()'),
    flagged('export const a = (t?: string) => `<p>${t ?? ""}</p>`;', 't ?? ""'),
    flagged(
      'export const a = (items: string[]) => `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;',
      'item',
    ),
    flagged('export const a = (m: string) => `<div class="msg">${m}</div>`;', 'm'),
    flagged('export const a = (m: string) => `<span${m}>x</span>`;', 'm'),
    flagged('export const a = (m: string) => `${m}</span>`;', 'm'),
    flagged('export const a = (t: string) => { let x = t; x = `<b>${x}</b>`; return x; };', 'x'),
    flagged(
      'export const a = (e: string) => `<p>${e.replace(/a/g, "b")}</p>`;',
      'e.replace(/a/g, "b")',
    ),
  ],
});

const { tester: typedTester, typed } = typedRegexProject('nitpicker-html-');

typedTester.run('no-unescaped-html-interpolation with types', rule, {
  valid: [
    typed('export const a = (n: number) => `<td>${n}</td>`;'),
    typed('export const a = (n: boolean) => `<td>${n}</td>`;'),
    typed("export const a = (kind: 'a' | 'b') => `<td class=\"${kind}\">x</td>`;"),
    typed('enum Kind { A = 1, B = 2 }\nexport const a = (kind: Kind) => `<td>${kind}</td>`;'),
  ],
  invalid: [
    typed('export const a = (n: string) => `<td>${n}</td>`;', [
      { messageId: 'unescapedValue', data: { value: 'n' } },
    ]),
    typed('export const a = (kind: \'a"b\') => `<td class="${kind}">x</td>`;', [
      { messageId: 'unescapedValue', data: { value: 'kind' } },
    ]),
  ],
});
