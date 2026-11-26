import { BaseEntity, Column, Entity } from 'typeorm';
@Entity()
export class UserEntity extends BaseEntity { @Column() email = ""; }
export class AdminEntity extends UserEntity {}
@Entity()
export class Audit { @Column() at = 0; }
export class UserView { email = ""; }
