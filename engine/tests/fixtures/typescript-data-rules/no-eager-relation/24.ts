import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
@Entity() class Order { @OneToMany(() => Line, (l) => l.order, { eager: true }) lines: Line[]; }