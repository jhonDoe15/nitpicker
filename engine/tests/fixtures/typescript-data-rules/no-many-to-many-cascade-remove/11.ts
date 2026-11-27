import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
class Post { @ManyToMany(() => Tag, { cascade: ['remove'] as const }) tags: Tag[]; }