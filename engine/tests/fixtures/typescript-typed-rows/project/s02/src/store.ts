import { Entity, Column, OneToMany } from 'typeorm';
declare function BeforeUpdate(): MethodDecorator;
declare function AfterBulkUpdate(): MethodDecorator;
declare function Version(): PropertyDecorator;
declare function EventSubscriber(): ClassDecorator;
export interface EntitySubscriberInterface<T = unknown> { listenTo?(): unknown }
export class HookedBase { @BeforeUpdate() touch() {} }
export class Middle extends HookedBase {}
@Entity() export class Leaf extends Middle { @Column() status = ""; }
@Entity() export class Child extends HookedBase { @Column() status = ""; }
@Entity() export class Bulk { @Column() status = ""; @AfterBulkUpdate() after() {} }
@Entity() export class Versioned2 { @Column({ version: true }) v = 0; @Column() status = ""; }
@Entity() export class Versioned3 { @Version() v = 0; @Column() status = ""; }
@Entity() export class Quoted { @OneToMany(() => Leaf, (x: Leaf) => x, { "cascade": true }) items!: Leaf[]; @Column() status = ""; }
@Entity() export class NoOrphans { @OneToMany(() => Leaf, (x: Leaf) => x, { orphanRemoval: false }) items!: Leaf[]; @Column() status = ""; }
@Entity() export class Listed1 { @Column() status = ""; }
@Entity() export class Listed2 { @Column() status = ""; }
@Entity() export class ByHook { @Column() status = ""; }
@Entity() export class ByInit { @Column() status = ""; }
@Entity() export class Plain2 { @Column() status = ""; }
export class ListedSubscriber implements EntitySubscriberInterface { listenTo() { const f = () => { return Plain2; }; return [Listed1, Listed2]; } }
declare const hooks: { addHook(n: string): void };
ByHook.addHook?.("x");
ByInit.init({ status: 1 }, { hooks: {} });
export type Shape = { status: string };
export default class { @Column() status = ""; }
