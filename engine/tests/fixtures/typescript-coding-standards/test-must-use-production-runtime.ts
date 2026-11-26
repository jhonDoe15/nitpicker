import { describe, expect, it } from 'vitest';
import type { Widget } from '../src/widget';
import { type Gadget } from '../src/gadget';
import fixtures from './fixtures/data.json';
import * as helpers from './support';

const lazy = () => import('./lazy');
const legacy = require('./legacy');
const dynamic = () => import(`./${name}`);

describe('widget', () => {
  it('works', () => {
    expect(helpers.make()).toBeDefined();
  });
});
