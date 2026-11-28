import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
const eager = true;
class Order { @ManyToOne(() => Customer, { eager }) customer: Customer; }