import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
@Entity() class Order { @ManyToOne(() => Customer, { eager: false }) customer: Customer; }