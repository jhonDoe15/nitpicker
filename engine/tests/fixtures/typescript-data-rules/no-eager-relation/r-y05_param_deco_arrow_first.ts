import { Entity, ManyToMany, OneToMany, ManyToOne, OneToOne } from 'typeorm';
const o = { eager: true };
class A { m(o, @OneToOne(() => B, o) x) {} }
