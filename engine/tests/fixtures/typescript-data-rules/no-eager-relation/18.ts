import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
const shared = { eager: true };
class Order { @ManyToOne(() => A, shared) a: A; @ManyToOne(() => B, shared) b: B; }