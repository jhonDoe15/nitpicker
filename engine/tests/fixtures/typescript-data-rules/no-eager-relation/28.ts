import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
const always = { eager: true } as const;
class Order { @ManyToOne(() => Customer, always) customer: Customer; }