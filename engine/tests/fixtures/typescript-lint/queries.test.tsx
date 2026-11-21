import { render, screen, within } from '@testing-library/react';

const renderPanel = () => render(<section />);

test('queries', () => {
  const { getByText, queryByRole, container } = render(<section />);
  getByText('Title');
  const view = render(<section />);
  view.getByRole('heading');
  render(<section />).getByText('inline');
  renderPanel().getByText('wrapped');
  const scoped = within(screen.getByRole('list'));
  scoped.getByText('item');
  const { getByLabelText } = within(container);
  getByLabelText('Name');
  const based = render(<section />, { baseElement: document.body });
  based.getByText('ok');

  screen.getByTestId('panel');
  screen.queryAllByTestId('row');
  view.findByTestId('late');

  expect(screen.queryByText('Title')).toBeInTheDocument();
  expect(screen.queryByText('Title')).not.toBeNull();
  expect(screen.getByText('Gone')).not.toBeInTheDocument();
  expect(screen.getByText('Gone')).toBeNull();
  expect(within(screen.getByRole('list')).queryByText('item')).toBeNull();
  expect(screen.getByText('Title')).toBeInTheDocument();
  expect(screen.queryByText('Gone')).not.toBeInTheDocument();
  expect(queryByRole('alert')).toBeTruthy();
});
