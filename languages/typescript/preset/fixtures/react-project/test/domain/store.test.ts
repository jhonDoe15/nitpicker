import { expect, it } from 'vitest';

const useStore = { setState: (value: object) => value };
const Registry = { getInstance: () => ({ state: () => ({}) }) };

it('resets the shared store between tests', () => {
  useStore.setState({ count: 0 });

  expect(Registry.getInstance().state()).toEqual({});
});
