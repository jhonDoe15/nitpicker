import { cruise } from 'dependency-cruiser';
it('cruises in-process', async () => { expect(await cruise([fixture])).toBeDefined(); });