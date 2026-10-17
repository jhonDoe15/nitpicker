export const componentTestCases = [
  ['test id query names the accessible role', "screen.getByTestId('save');", 'screen.getByRole'],
  [
    'test id query names the config exception',
    "screen.getByTestId('save');",
    'nitpicker.config.json',
  ],
  [
    'container query names the accessible role',
    "const { container } = render(<Panel />); container.querySelector('.save');",
    'screen.getByRole',
  ],
  [
    'container query names the config exception',
    "const { container } = render(<Panel />); container.querySelector('.save');",
    'nitpicker.config.json',
  ],
  ['fireEvent names userEvent', "fireEvent.click(screen.getByRole('button'));", 'await user.click'],
  [
    'fireEvent names the config exception',
    "fireEvent.click(screen.getByRole('button'));",
    'nitpicker.config.json',
  ],
  [
    'unawaited userEvent names await',
    "userEvent.click(screen.getByRole('button'));",
    'await user.<event>',
  ],
  [
    'unawaited userEvent names the user-event v13 exception',
    "userEvent.click(screen.getByRole('button'));",
    'user-event v13',
  ],
  [
    'unawaited findBy query names await',
    "const button = screen.findByRole('button');",
    'await screen.findByRole',
  ],
  ['unawaited waitFor names await', 'waitFor(() => expect(ok()).toBe(true));', 'await waitFor'],
  [
    'node access names toHaveFocus',
    'expect(document.activeElement).toBe(button);',
    '`toHaveFocus()`',
  ],
  [
    'component state names what the user sees',
    "import { mount } from 'enzyme'; const wrapper = mount(Panel); expect(wrapper.state()).toEqual({});",
    'what the user sees',
  ],
  [
    'component state names the config exception',
    "import { mount } from 'enzyme'; const wrapper = mount(Panel); expect(wrapper.state()).toEqual({});",
    'nitpicker.config.json',
  ],
  [
    'hover test names tabbing to the element',
    "await userEvent.hover(screen.getByRole('button'));",
    'await user.tab()',
  ],
  [
    'hover test names the config exception',
    "await userEvent.hover(screen.getByRole('button'));",
    'nitpicker.config.json',
  ],
  ['hook spy names renderHook', "vi.spyOn(React, 'useState');", '`renderHook`'],
  ['hook spy names what the user sees', "vi.spyOn(React, 'useState');", 'what the user sees'],
  ['hook spy names the config exception', "vi.spyOn(React, 'useState');", 'nitpicker.config.json'],
  [
    'hook spy on a namespace import names renderHook',
    "import * as R from 'react'; jest.spyOn(R, 'useEffect');",
    '`renderHook`',
  ],
  [
    'destructured query names screen',
    "const { getByRole } = render(<Panel />); getByRole('button');",
    'screen.getByRole',
  ],
  [
    'destructured query names within',
    "const { getByRole } = render(<Panel />); getByRole('button');",
    'within(element)',
  ],
  [
    'destructured query names the config exception',
    "const { getByRole } = render(<Panel />); getByRole('button');",
    'nitpicker.config.json',
  ],
  [
    'react module mock names renderHook',
    "vi.mock('react', () => ({ useState: vi.fn() }));",
    '`renderHook`',
  ],
  [
    'act around render names a direct call',
    'act(() => { render(<Panel />); });',
    'Call them directly',
  ],
  ['debug output names an assertion', 'screen.debug();', 'assert what you were looking for'],
  [
    'manual cleanup names the removal',
    "import { cleanup } from '@testing-library/react'; afterEach(cleanup);",
    'remove the call',
  ],
  [
    'queryBy for presence names getBy',
    "expect(screen.queryByText('Saved')).toBeInTheDocument();",
    "expect(screen.getByText('Saved')).toBeInTheDocument()",
  ],
  [
    'getBy for absence names queryBy',
    "expect(screen.getByText('Error')).not.toBeInTheDocument();",
    "expect(screen.queryByText('Error')).not.toBeInTheDocument()",
  ],
  [
    'userEvent without setup names the named import',
    "await userEvent.click(screen.getByRole('button'));",
    "import { userEvent } from '@testing-library/user-event'",
  ],
];
