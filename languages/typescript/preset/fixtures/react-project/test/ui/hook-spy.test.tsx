import { render } from '@testing-library/react';
import * as React from 'react';
import { expect, it, vi } from 'vitest';
import { Counter } from '../../src/main/ui/allowed';

it('spies on a React hook', () => {
  const spy = vi.spyOn(React, 'useState');

  render(<Counter items={[]} />);

  expect(spy).toHaveBeenCalled();
});
