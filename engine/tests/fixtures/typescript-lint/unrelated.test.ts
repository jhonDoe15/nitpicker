import { getByText, render, screen } from './helpers';

test('no testing library module was imported', () => {
  const view = render();
  view.getByTestId('panel');
  getByText('Title');
  screen.findByText('late');
  expect(screen.queryByText('Title')).toBeInTheDocument();
});
