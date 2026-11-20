import { render } from '@testing-library/react';
import { renderPage } from 'support/render-helper';

test('queries from the render result', () => {
  const { getByText } = render(<h1>page</h1>);
  getByText('page');
  renderPage('<h1>page</h1>');
});
