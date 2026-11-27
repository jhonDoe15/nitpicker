import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
class Post { @ManyToMany(() => Tag, { cascade: ['soft-remove'] }) tags: Tag[]; }