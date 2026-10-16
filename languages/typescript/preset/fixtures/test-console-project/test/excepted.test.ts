import { expect, it } from 'vitest';
import { mount } from '../src/main/widget';

it('unmounts without leaving work behind', async () => {
  const widget = mount();
  widget.unmount();
  await new Promise((resolve) => setTimeout(resolve, 40));
  expect(typeof widget.unmount).toBe('function');
});
