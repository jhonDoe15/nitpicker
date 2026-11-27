import { Pool } from 'pg'; for (const id of ids) { await Pool.query(id); }
export {};
