import base from './dependency-cruiser.fixture.config.mjs';
import { strictBoundaryRules } from '../strict-boundary-rules.mts';

export default {
  ...base,
  forbidden: [
    ...base.forbidden.filter(({ name }) => name !== 'features-do-not-import-bootstrap'),
    ...strictBoundaryRules,
  ],
};
