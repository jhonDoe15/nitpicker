import { Entity, ManyToMany, OneToMany, ManyToOne, OneToOne } from 'typeorm';
const o = { eager: true };
class A { m(o: any, @OneToOne(() => B, o) x: B) {} }
