import { rule as reactControlledInput } from './react-controlled-input.mjs';
import { rule as reactFieldHasLabel } from './react-field-has-label.mjs';
import { createReactRuleTester, filename } from '../tester.mjs';

const tester = createReactRuleTester();

function valid(code) {
  return { filename, code };
}

function invalid(code, ...messageIds) {
  return { filename, code, errors: messageIds.map((messageId) => ({ messageId })) };
}

tester.run('react-field-has-label', reactFieldHasLabel, {
  valid: [
    '<input aria-label="Name" />',
    '<input aria-labelledby="heading" />',
    '<><label htmlFor="name">Name</label><input id="name" /></>',
    '<><textarea id="bio" /><label htmlFor="bio">Bio</label></>',
    '<><label htmlFor={"kind"}>Kind</label><select id="kind"><option>a</option></select></>',
    '<input id={fieldId} />',
    '<><label htmlFor={fieldId}>Name</label><input id="name" /></>',
    '<label>Name <input type="text" /></label>',
    '<label><span>Name</span><div><input /></div></label>',
    '<input {...props} />',
    '<input type="hidden" name="token" />',
    '<input type="submit" value="Send" />',
    '<input type="reset" />',
    '<input type="button" value="Go" />',
    '<input type="image" alt="Go" src="go.png" />',
    '<input type={"hidden"} />',
    '<TextField />',
    '<Input name="x" />',
    '<div />',
    '<ns:input />',
  ].map(valid),
  invalid: [
    invalid('<input />', 'unlabelled'),
    invalid('<input type="text" placeholder="Name" />', 'unlabelled'),
    invalid('<input type="checkbox" />', 'unlabelled'),
    invalid('<input type={kind} />', 'unlabelled'),
    invalid('<input type="hiddenish" />', 'unlabelled'),
    invalid('<textarea />', 'unlabelled'),
    invalid('<select><option>a</option></select>', 'unlabelled'),
    invalid('<div><input /></div>', 'unlabelled'),
    invalid('<Label><input /></Label>', 'unlabelled'),
    invalid('<form><label>Name</label><input name="n" /></form>', 'unlabelled'),
    invalid('<><input /><input /></>', 'unlabelled', 'unlabelled'),
    invalid('<input id="name" />', 'unlabelled'),
    invalid('<><label htmlFor="email">Email</label><input id="name" /></>', 'unlabelled'),
  ],
});

tester.run('react-controlled-input', reactControlledInput, {
  valid: [
    '<input value={v} onChange={set} />',
    '<input value={v} readOnly />',
    '<input value={v} disabled />',
    '<input defaultValue="x" />',
    '<input />',
    '<input type="text" />',
    '<input checked={on} onChange={set} />',
    '<input type="checkbox" value="a" />',
    '<input type="radio" value="a" name="g" />',
    '<input type="hidden" value="token" />',
    '<input type="submit" value="Send" />',
    '<input type="button" value="Go" />',
    '<input type="image" value="Go" />',
    '<input type="reset" value="Go" />',
    '<input {...props} value="x" />',
    '<input value={v} {...rest} />',
    '<textarea value={v} onChange={set} />',
    '<select value={v} onChange={set}><option>a</option></select>',
    '<select defaultValue="a"><option>a</option></select>',
    '<select><option value="a">a</option></select>',
    '<Input value="x" />',
    '<option value="a">a</option>',
    '<textarea checked />',
    '<div value="x" />',
  ].map(valid),
  invalid: [
    invalid('<input value="fixed" />', 'noHandler'),
    invalid('<input value={v} />', 'noHandler'),
    invalid('<input type="text" value={v} />', 'noHandler'),
    invalid('<input checked={on} />', 'noHandler'),
    invalid('<input type="checkbox" checked />', 'noHandler'),
    invalid('<input type="radio" checked={on} />', 'noHandler'),
    invalid('<textarea value={v} />', 'noHandler'),
    invalid('<select value={v}><option>a</option></select>', 'noHandler'),
    invalid('<input value={v} defaultValue="x" onChange={set} />', 'bothValues'),
    invalid('<textarea defaultValue="x" value={v} />', 'bothValues'),
    invalid('<input value={v} defaultValue="x" />', 'bothValues'),
    invalid('<input type={kind} value={v} />', 'noHandler'),
    invalid('<input type="hidden" checked />', 'noHandler'),
  ],
});
