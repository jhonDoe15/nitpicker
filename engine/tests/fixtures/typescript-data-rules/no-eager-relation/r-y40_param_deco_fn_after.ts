import { OneToOne } from 'typeorm';
const o = { eager: true };
class K { m(o, @OneToOne(() => B, o) x, @OneToOne(o) y) {} }
