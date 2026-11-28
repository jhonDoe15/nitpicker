import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
@Entity() class Order { @ManyToOne(() => Customer, { eager: true }) customer: Customer; }