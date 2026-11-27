import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
class Order { @ManyToOne(() => Customer, { cascade: ['remove'] }) customer: Customer; }