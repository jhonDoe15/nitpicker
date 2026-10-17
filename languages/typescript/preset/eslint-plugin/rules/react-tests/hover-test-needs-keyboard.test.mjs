import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './hover-test-needs-keyboard.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/test/ui/tooltip.test.tsx';
const imports =
  "import { render, screen, fireEvent } from '@testing-library/react';\nimport userEvent from '@testing-library/user-event';\n";

function spec(...tests) {
  return `${imports}${tests.map((body) => `it('works', async () => { ${body} });`).join('\n')}`;
}

const error = { messageId: 'hoverWithoutKeyboard' };

tester.run('hover-test-needs-keyboard', rule, {
  valid: [
    spec('await userEvent.click(screen.getByRole("button"));'),
    spec('const user = userEvent.setup(); await user.hover(a); await user.tab();'),
    spec('await userEvent.hover(a);', 'await userEvent.tab();'),
    spec('await user.hover(a);', 'await user.keyboard("{Tab}");'),
    spec('await user.hover(a);', 'screen.getByRole("button").focus();'),
    spec('await user.hover(a);', 'await user.type(input, "{ArrowDown}{Enter}");'),
    spec('await user.hover(a);', 'await user.type(input, `{Enter}${text}`);'),
    spec('fireEvent.mouseEnter(a);', 'fireEvent.focus(a);'),
    spec('fireEvent.mouseEnter(a);', 'fireEvent.focusIn(a);'),
    spec('fireEvent.mouseEnter(a);', 'fireEvent.keyDown(a, { key: "Enter" });'),
    spec('fireEvent.mouseEnter(a);', 'fireEvent.keyUp(a, { key: "Enter" });'),
    spec('fireEvent.mouseEnter(a);', 'fireEvent.keyPress(a, { key: "Enter" });'),
    spec('fireEvent.mouseOver(a);', 'await user.tab({ shift: true });'),
    spec('await user.pointer({ target: a });', 'await user.tab();'),
    spec('await page.hover("a");', 'await page.keyboard.press("Tab");'),
    spec('await page.hover("a");', 'await page.getByRole("button").press("Enter");'),
    spec('await page.hover("a");', 'await page.keyboard.down("Shift");'),
    spec('await page.hover("a");', 'await page.keyboard.insertText("x");'),
    spec('await user.hover(a);', 'await keyboard.sendKeys("Tab");'),
    spec('fireEvent.mouseDown(a);'),
    spec('other.mouseEnter(a);'),
    spec('hover(a);'),
    spec('fireEvent["mouseEnter"](a);'),
    spec('await user.pointer("[MouseLeft]");'),
    spec('await user.pointer({ keys: "[MouseLeft]", target: a });'),
    spec('await user.pointer([{ keys: "[MouseLeft>]", target: a }, { keys: "[/MouseLeft]" }]);'),
    spec('await user.pointer(action);'),
    spec('await user.type(input, "hello");'),
    spec('await user.type(input, `hello ${name}`);'),
    spec('await user.hover(a);', 'await user.keyboard(keys);'),
    "import { page } from '@playwright/test';\nit('x', async () => { await page.hover('a'); });",
  ].map((code) => ({ filename, code })),
  invalid: [
    { code: spec('await userEvent.hover(a);'), errors: [error] },
    { code: spec('const user = userEvent.setup(); await user.hover(a);'), errors: [error] },
    { code: spec('fireEvent.mouseEnter(a);'), errors: [error] },
    { code: spec('fireEvent.mouseOver(a);'), errors: [error] },
    { code: spec('await user.pointer({ target: a });'), errors: [error] },
    { code: spec('await user.pointer([{ target: a }]);'), errors: [error] },
    {
      code: spec('await user.pointer({ target: a }); await user.type(input, "hello");'),
      errors: [error],
    },
    { code: spec('await page.hover("a");', 'await page.mouse.move(0, 0);'), errors: [error] },
    { code: spec('fireEvent.mouseEnter(a);', 'fireEvent.mouseDown(a);'), errors: [error] },
    {
      code: spec('await user.hover(a);', 'await user.hover(b);'),
      errors: [{ ...error, line: 3 }],
    },
    {
      code: "import { render } from './test-utils';\nit('x', async () => { await user.hover(a); });",
      errors: [{ ...error, line: 2 }],
    },
  ].map((testCase) => ({ filename, ...testCase })),
});
