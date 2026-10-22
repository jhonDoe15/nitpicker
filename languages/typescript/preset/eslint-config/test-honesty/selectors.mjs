const STRYKER_NAME = '/^(?:__stryker|STRYKER_|activeMutant$)/';
const STRYKER_TEXT = '/__stryker|STRYKER_|activeMutant/';
const GLOBAL_OBJECT = '/^(?:globalThis|global|window|self)$/';

const strykerMessage =
  'A test must not look at the mutation harness (`__stryker__`, `STRYKER_*`, `activeMutant`): a test that behaves differently under mutation hides every mutant. Test the behaviour only.';
const globalByKeyMessage =
  'Read a global by its name (`globalThis.name`) so the test shows which global it depends on. A justified exception for no-restricted-syntax goes in nitpicker.config.json.';

export const testHonestySelectors = [
  {
    selector: "CallExpression[callee.name='expect'][arguments.0.type='Literal']",
    message:
      'A literal passed to `expect` can never fail. Pass the value the code under test returns. A justified exception for no-restricted-syntax goes in nitpicker.config.json.',
  },
  {
    selector:
      "CallExpression[callee.object.name='expect'][callee.property.name='soft'][arguments.0.type='Literal']",
    message:
      'A literal passed to `expect.soft` can never fail. Pass the value the code under test returns. A justified exception for no-restricted-syntax goes in nitpicker.config.json.',
  },
  { selector: `Identifier[name=${STRYKER_NAME}]`, message: strykerMessage },
  { selector: `Literal[value=${STRYKER_TEXT}]`, message: strykerMessage },
  { selector: `TemplateElement[value.raw=${STRYKER_TEXT}]`, message: strykerMessage },
  {
    selector: `CallExpression[callee.object.name='Reflect'][arguments.0.name=${GLOBAL_OBJECT}]`,
    message: globalByKeyMessage,
  },
  {
    selector: `MemberExpression[computed=true][object.name=${GLOBAL_OBJECT}][property.type!='Literal']`,
    message: globalByKeyMessage,
  },
];
