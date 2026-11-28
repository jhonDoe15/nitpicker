import { jest } from '@jest/globals';
import type { Order } from './src/orders';
import { type Clock } from './src/clock';
import { build } from './src/fixtures/build';
jest.mock('./src/orders');
jest.mock('./src/clock');
jest.mock('./src/fixtures/build');
