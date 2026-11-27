import { Entity, Column, ManyToOne, Repository } from 'typeorm';
declare function Other(): PropertyDecorator;
declare const ns: { Column(): PropertyDecorator };
@Entity() export class Order { @Column() status = ""; @Column() total = 0; @ManyToOne() parent?: Order; @Other() note = ""; @ns.Column() spaced = ""; plain = ""; __hidden = ""; }
export interface Shape { status: string; readonly total: number }
export type Mapped = { [K in "status" | "total"]: string };
export class Custom extends Repository<Order> { find(): Promise<Order[]> { return super.find(); } }
