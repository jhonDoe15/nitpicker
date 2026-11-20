const { render, screen, cleanup, fireEvent } = require('../test-utils');

afterEach(() => cleanup());

test('a module whose name ends with test-utils counts', () => {
  const { getByRole } = render();
  getByRole('button').click();
  screen.getByTestId('panel').firstChild;
  fireEvent.mouseOver(screen.getByText('Title'));
});
