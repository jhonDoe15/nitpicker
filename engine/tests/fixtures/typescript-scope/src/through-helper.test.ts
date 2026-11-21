import { renderPage, screen } from 'support/render-helper';

test('shows the title', () => {
  renderPage('<h1>page</h1>');
  screen.debug();
  screen.getByTestId('title');
});
