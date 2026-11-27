import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
@Entity() class Order { @OneToOne(() => Profile, (p) => p.user, { eager: true }) profile: Profile; }