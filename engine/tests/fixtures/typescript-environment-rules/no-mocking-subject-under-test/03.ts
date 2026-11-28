import { mock } from 'node:test';
import proxyquire from 'proxyquire';
import './src/setup';
import { ship } from './src/shipping';
mock.module('./src/setup');
const loaded = proxyquire('./src/app', { './src/shipping': { ship } });
