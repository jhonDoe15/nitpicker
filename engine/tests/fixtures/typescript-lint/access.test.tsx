import rtl, { cleanup, render, screen, prettyDOM } from '@testing-library/react';

afterEach(cleanup);
afterEach(() => rtl.cleanup());

test('node access and debugging', () => {
  const { container, debug } = render(<div />);
  const first = container.firstChild;
  const rows = container.querySelectorAll('tr');
  screen.getByText('Save').closest('form');
  screen.getByText('Save').parentElement.children;
  screen.getByRole('button').click();
  screen.getByRole('form')['submit']();
  document.getElementById('root');
  const props = { children: [] };
  props.children;
  callback(() => {
    const inner = container.lastChild;
    return inner;
  });
  debug();
  screen.debug();
  screen.logTestingPlaygroundURL();
  prettyDOM(container);
  console.debug(first, rows);
});
