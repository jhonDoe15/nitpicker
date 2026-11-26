import type { Pool } from 'pg';
export const o = { '{{type}}': (p: Pool) => 1, '{{ member }}{{package}}': (p: Pool) => 2 };
