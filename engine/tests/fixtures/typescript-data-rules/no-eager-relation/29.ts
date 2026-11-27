import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
const base = { eager: true };
class Order { @ManyToOne(() => Customer, { ...base, nullable: false }) customer: Customer; }