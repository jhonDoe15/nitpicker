import { OneToOne } from 'typeorm';
const o = { eager: true };
class K { m(@OneToOne(() => B, o) x, o) {} }
