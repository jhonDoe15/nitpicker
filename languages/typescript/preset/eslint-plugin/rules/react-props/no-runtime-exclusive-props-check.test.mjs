import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-runtime-exclusive-props-check.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/ui/panel.tsx';

function component(parameter, body) {
  return `function Panel(${parameter}) { ${body} return <div />; }`;
}

function exclusive(...props) {
  return {
    messageId: 'exclusiveProps',
    data: { props: props.map((prop) => `\`${prop}\``).join(', ') },
  };
}

tester.run('no-runtime-exclusive-props-check', rule, {
  valid: [
    component('{ a, b }', 'if (a && b) { return <span />; }'),
    component('{ a, b }', 'if (a) { throw new Error("x"); }'),
    component('{ a, b }', 'if (a && other) { throw new Error("x"); }'),
    component('{ a, b }', 'if (a && !b) { throw new Error("x"); }'),
    component('{ a, b }', 'if (a || b) { throw new Error("x"); }'),
    component('{ a, b, mode }', 'if (a && b && mode === "x") { throw new Error("x"); }'),
    component('{ a, b }', 'if (a && b) { setValue(1); }'),
    component('{ a, b }', 'if (a && b) { logger.warn("x"); }'),
    component('{ a, b }', 'if (a && b) { console.log("x"); }'),
    component('{ a, b }', 'if (a && b) { console.info("x"); }'),
    component('{ a, b }', 'if (a && b) { console["error"]("x"); }'),
    component('{ a, b }', 'if (a && b) { return undefined; }'),
    component('{ a, b }', 'if (!a && !b) { return null; }'),
    component('{ a, b }', 'if (a && b) return null;'),
    component('{ a, b }', 'if (a && b) { return <Fallback />; }'),
    component('{ a, b }', 'if (a !== undefined && b === undefined) { throw new Error("x"); }'),
    component('{ a, b }', 'if (a !== 1 && b !== 1) { throw new Error("x"); }'),
    component('{ a, b }', 'useEffect(() => { if (a && b) { throw new Error("x"); } }, []);'),
    component('{ a, b }', 'const check = () => { if (a && b) { throw new Error("x"); } };'),
    component('props', 'if (props.a && other.b) { throw new Error("x"); }'),
    component('props', 'if (props[a] && props[b]) { throw new Error("x"); }'),
    component('props', 'if (props.a && props.a) { throw new Error("x"); }'),
    component('{ a, ...rest }', 'if (a && rest) { throw new Error("x"); }'),
    component('[a, b]', 'if (a && b) { throw new Error("x"); }'),
    component('', 'if (a && b) { throw new Error("x"); }'),
    component('{ [key]: a, b }', 'if (a && b) { throw new Error("x"); }'),
    'function check({ a, b }) { if (a && b) { throw new Error("x"); } return 1; }',
    'function panel({ a, b }) { if (a && b) { throw new Error("x"); } return <div />; }',
    'function Panel({ a, b }) { if (a && b) { throw new Error("x"); } return null; }',
  ].map((code) => ({ filename, code })),
  invalid: [
    {
      code: component('{ a, b }', 'if (a && b) { throw new Error("x"); }'),
      errors: [exclusive('a', 'b')],
    },
    {
      code: component('{ a, b }', 'if (a !== undefined && b !== undefined) throw new Error("x");'),
      errors: [exclusive('a', 'b')],
    },
    {
      code: component('{ a, b }', 'if (!a && !b) { throw new Error("x"); }'),
      errors: [exclusive('a', 'b')],
    },
    {
      code: component(
        '{ a, b }',
        'if (a === undefined && b === undefined) { console.error("x"); return <i />; }',
      ),
      errors: [exclusive('a', 'b')],
    },
    {
      code: component('{ a, b }', 'if (a && b) { console.warn("x"); }'),
      errors: [exclusive('a', 'b')],
    },
    {
      code: component('props', 'if (props.a && props.b) { throw new Error("x"); }'),
      errors: [exclusive('a', 'b')],
    },
    {
      code: component('{ a, b }', 'if (a != null && null != b) { throw new Error("x"); }'),
      errors: [exclusive('a', 'b')],
    },
    {
      code: component('{ a, b }', 'if (a !== null && b !== null) { throw new Error("x"); }'),
      errors: [exclusive('a', 'b')],
    },
    {
      code: component('{ a, b, c }', 'if (a && b && c) { throw new Error("x"); }'),
      errors: [exclusive('a', 'b', 'c')],
    },
    {
      code: component(
        '{ icon: Icon, image = undefined }',
        'if (Icon && image) { throw new Error("x"); }',
      ),
      errors: [exclusive('icon', 'image')],
    },
    {
      code: 'const Panel = ({ a, b }) => { if (a && b) { throw new Error("x"); } return <div />; };',
      errors: [exclusive('a', 'b')],
    },
    {
      code: 'const Panel = memo(({ a, b }) => { if (!a && !b) throw new Error("x"); return <div />; });',
      errors: [exclusive('a', 'b')],
    },
  ].map((testCase) => ({ filename, ...testCase })),
});
