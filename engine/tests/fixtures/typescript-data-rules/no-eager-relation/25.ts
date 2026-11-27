import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
@Entity() class Post { @ManyToMany(() => Tag, { eager: true }) tags: Tag[]; }