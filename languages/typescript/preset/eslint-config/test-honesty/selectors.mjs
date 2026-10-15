const STRYKER_NAME = '/^(?:__stryker|STRYKER_)/';
const STRYKER_TEXT = '/__stryker|STRYKER_/';

const strykerMessage =
  'A test must not look at the mutation harness (`__stryker__`, `STRYKER_*`): a test that behaves differently under mutation hides every mutant. Test the behaviour only.';

export const testHonestySelectors = [
  {
    selector: "CallExpression[callee.name='expect'][arguments.0.type='Literal']",
    message:
      'A literal passed to `expect` can never fail. Pass the value the code under test returns.',
  },
  {
    selector:
      "CallExpression[callee.object.name='expect'][callee.property.name='soft'][arguments.0.type='Literal']",
    message:
      'A literal passed to `expect.soft` can never fail. Pass the value the code under test returns.',
  },
  { selector: `Identifier[name=${STRYKER_NAME}]`, message: strykerMessage },
  { selector: `Literal[value=${STRYKER_TEXT}]`, message: strykerMessage },
  { selector: `TemplateElement[value.raw=${STRYKER_TEXT}]`, message: strykerMessage },
];
