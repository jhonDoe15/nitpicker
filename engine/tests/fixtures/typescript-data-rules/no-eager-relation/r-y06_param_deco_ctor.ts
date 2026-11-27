import { Entity, ManyToMany, OneToMany, ManyToOne, OneToOne } from 'typeorm';
const o = { eager: true };
class A { constructor(o, @OneToOne(() => B, o) private x: B) {} }
