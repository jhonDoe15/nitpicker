import { mount, shallow as shallowly } from 'enzyme';
import * as React from 'react';
import renderer from 'react-test-renderer';
import sinon, { stub } from 'sinon';
import { vi } from 'vitest';

const Core = React;
const sandbox = sinon.createSandbox();

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return { ...actual, useState: vi.fn(), nested: { useEffect: vi.fn() } };
});
vi.mock('react-dom');
vi.mock('./panel');

it('reads what the user never sees', async () => {
  const wrapper = mount(<Panel />);
  const tree = await renderer.create(<Panel />);
  wrapper.setState({ open: true });
  shallowly(<Panel />).state();
  other.setState({ open: true });
  tree.root.findByType(Panel);
  wrapper.instance();
  wrapper['getInstance' as 'instance']();
  vi.spyOn(Core, 'useMemo');
  jest.spyOn(require('react'), 'useRef' as const);
  stub(React, 'useCallback');
  sandbox.replace((await import('react')).default, 'useId', fake);
  vi.spyOn(React, 'createElement');
  vi.spyOn(window, 'useThing');
  node._reactInternals.memoizedState;
  node['__reactFiber$abc'];
  node.stateNode;
});
