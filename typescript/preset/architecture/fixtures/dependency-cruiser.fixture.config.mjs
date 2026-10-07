import path from 'node:path';
import defaults from '../../defaults/dependency-cruiser.config.mjs';

export default {
  ...defaults,
  forbidden: [
    ...defaults.forbidden,
    {
      name: 'features-do-not-import-bootstrap',
      severity: 'error',
      from: { path: '(?:^|/)src/main/[^/]+/' },
      to: { path: '(?:^|/)src/main/server\\.ts$' },
    },
  ],
  options: {
    ...defaults.options,
    tsConfig: { fileName: path.join(import.meta.dirname, 'tsconfig.fixture.json') },
  },
};
