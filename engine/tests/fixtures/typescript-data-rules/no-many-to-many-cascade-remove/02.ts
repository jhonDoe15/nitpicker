import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
class Post { @ManyToMany(() => Tag) tags: Tag[]; }