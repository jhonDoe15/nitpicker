import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-unescaped-css-selector.mts';

const tester = typescriptRuleTester();

function flagged(code: string, messageId = 'escapeValue') {
  return { code, errors: [{ messageId }] };
}

tester.run('no-unescaped-css-selector', rule, {
  valid: [
    { code: 'el.closest(`.${baseClass}`);' },
    { code: 'el.querySelector(`.${props.className}__tab`);' },
    { code: 'document.querySelector(`#${CSS.escape(id)}`);' },
    { code: 'el.querySelector(`[data-name="${CSS.escape(name)}"]`);' },
    { code: 'document.querySelector("#" + CSS.escape(id));' },
    { code: 'document.querySelector("#main");' },
    { code: 'const id = "main"; document.querySelector(`#${id}`);' },
    { code: 'document.querySelectorAll(`li:nth-child(${index})`);' },
    { code: 'document.querySelector(`[data-index="${items.length}"]`);' },
    { code: 'document.querySelector(`${rootSelector} > li`);' },
    { code: 'document.querySelector(`#${Number(id)}`);' },
    { code: 'export function f(n: number) { return document.querySelector(`#row-${n}`); }' },
    { code: 'map.get(`#${id}`);' },
    { code: 'document.querySelector(`[data-id=${cssEscape(id)}]`);' },
    { code: 'el.closest(selector);' },
    { code: 'export function f(x: unknown) { return toString.call(x) === "[object Response]"; }' },
    {
      code: 'const hasOwn = 1; hasOwnProperty.call(a, "k"); valueOf.call(a); constructor.call(a);',
    },
    { code: 'root.querySelector(`.${CLS.banner}`);' },
    { code: 'root.querySelector(`#${id.replace(/[\\\\.]/g, "\\\\$&")}`);' },
    { code: 'root.querySelector(`[data-month="${month}"]`);' },
  ],
  invalid: [
    flagged('document.querySelector(`#${id}`);'),
    flagged('document.querySelectorAll(`.${group}`);'),
    flagged('el.querySelector(`[data-name="${name}"]`);'),
    flagged('el.closest("[data-id=\'" + node.id + "\']");'),
    flagged('el.matches(`#${props.id}`);'),
    flagged('cy.get(`[data-cy="${name}"]`);'),
    flagged('await page.$(`#${id}`);'),
    flagged('el.querySelector(`[data-name="${name.replace(/"/g, "\\\\\\"")}"]`);', 'handEscaped'),
    flagged('document.querySelector(`a[name=${anchor}]`);'),
  ],
});
