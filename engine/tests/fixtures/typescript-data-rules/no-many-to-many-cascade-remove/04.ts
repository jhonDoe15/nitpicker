import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
class Order { @OneToMany(() => Line, (l) => l.order, { cascade: true }) lines: Line[]; }