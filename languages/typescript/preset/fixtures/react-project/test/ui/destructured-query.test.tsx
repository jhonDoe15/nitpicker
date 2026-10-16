import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Counter } from '../../src/main/ui/allowed';

it('destructures a query from the render result', () => {
  const { getByRole } = render(<Counter items={[]} />);

  expect(getByRole('list')).toBeDefined();
});
