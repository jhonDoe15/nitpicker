import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
@Entity() class Order { @ManyToOne(() => Customer, { lazy: true }) customer: Promise<Customer>; }