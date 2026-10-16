import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { lintFixture } from '../../../failure-messages/test-support/harness.mjs';
import { resolveLayout } from '../../../layout.mjs';
import { GENERAL_HINT } from '../../rule-hints.mjs';
import { reactSyntaxConfigFor } from '../react-scope.mjs';

const config = [
  { languageOptions: { parser: tseslint.parser } },
  ...(await reactSyntaxConfigFor(resolveLayout())),
];

function ruleIdsFor(markup) {
  return lintFixture({
    config,
    filename: 'src/main/ui/form.tsx',
    code: `export const Form = () => <form>${markup}</form>;`,
  }).map(({ ruleId }) => ruleId);
}

describe('accessibility rules beyond the plugin recommendation', () => {
  it.each([
    [
      'an icon-only button',
      '<button type="button"><svg /></button>',
      'jsx-a11y/control-has-associated-label',
    ],
    ['ambiguous link text', '<a href="/x">click here</a>', 'jsx-a11y/anchor-ambiguous-text'],
    [
      'aria-hidden on a button',
      '<button type="button" aria-hidden="true">x</button>',
      'jsx-a11y/no-aria-hidden-on-focusable',
    ],
    ['a role that has a tag', '<div role="navigation" />', 'jsx-a11y/prefer-tag-over-role'],
  ])('reports %s', (_name, markup, ruleId) => {
    expect(ruleIdsFor(markup)).toEqual([ruleId]);
  });

  it.each([
    ['a button with text', '<button type="button">Save</button>'],
    ['a button with aria-label', '<button type="button" aria-label="Save"><svg /></button>'],
    ['a button with dynamic text', '<button type="button">{label}</button>'],
    [
      'a select, which the field rule covers',
      '<select aria-label="Kind"><option>a</option></select>',
    ],
    ['an input with a paired label', '<label htmlFor="q">Q</label><input id="q" />'],
    ['a submit input', '<input type="submit" value="go" />'],
    ['a wrapping label with a custom control', '<label>Name <TextField /></label>'],
    ['a wrapping label with an input', '<label>Name <input type="text" /></label>'],
  ])('lets %s through', (_name, markup) => {
    expect(ruleIdsFor(markup)).toEqual([]);
  });

  it('reports a link with no text as an unlabelled control and an empty anchor', () => {
    expect(ruleIdsFor('<a href="/x" />')).toEqual([
      'jsx-a11y/control-has-associated-label',
      'jsx-a11y/anchor-has-content',
    ]);
  });

  it('reports a label that wraps only an icon', () => {
    expect(ruleIdsFor('<label><Icon /></label>')).toEqual([
      'jsx-a11y/label-has-associated-control',
    ]);
  });

  it('reports a label with no control and no htmlFor', () => {
    expect(ruleIdsFor('<label>Name</label>')).toEqual(['jsx-a11y/label-has-associated-control']);
  });

  it('reports a field with no label through the field rule, not the plugin', () => {
    expect(ruleIdsFor('<input type="text" />')).toEqual(['nitpicker/react-field-has-label']);
  });

  it('requires focus and blur handlers next to hover-only enter and leave handlers', async () => {
    const [, entry] = config;
    const flagged = (attributes) =>
      lintFixture({
        config,
        filename: 'src/main/ui/card.tsx',
        code: `export const Card = () => <div ${attributes} />;`,
      })
        .filter(({ ruleId }) => ruleId === 'jsx-a11y/mouse-events-have-key-events')
        .map(({ message }) => message);

    expect(entry.rules['jsx-a11y/mouse-events-have-key-events']).toEqual([
      'error',
      {
        hoverInHandlers: ['onMouseOver', 'onMouseEnter'],
        hoverOutHandlers: ['onMouseOut', 'onMouseLeave'],
      },
    ]);
    expect(flagged('onMouseEnter={show} onMouseLeave={hide}')).toEqual([
      `onMouseEnter must be accompanied by onFocus for accessibility.${GENERAL_HINT}`,
      `onMouseLeave must be accompanied by onBlur for accessibility.${GENERAL_HINT}`,
    ]);
    expect(flagged('onMouseOver={show}')).toEqual([
      `onMouseOver must be accompanied by onFocus for accessibility.${GENERAL_HINT}`,
    ]);
    expect(flagged('onMouseEnter={show} onFocus={show} onMouseLeave={hide} onBlur={hide}')).toEqual(
      [],
    );
  });
});
