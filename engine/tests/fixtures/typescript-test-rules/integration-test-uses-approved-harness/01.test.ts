import { request } from './client';

it('calls the app directly', async () => {
  await request('/health');
});
