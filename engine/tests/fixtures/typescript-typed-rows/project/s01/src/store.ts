import { Entity, Column, Model, OneToMany } from 'typeorm';
declare function BeforeUpdate(): MethodDecorator;
declare function VersionColumn(): PropertyDecorator;
declare function EventSubscriber(): ClassDecorator;
@Entity() export class Order { @Column() status = ""; @Column() total = 0; get label() { return this.status; } }
@Entity() export class Audited { @Column() status = ""; @BeforeUpdate() touch() {} }
@Entity() export class Versioned { @Column() status = ""; @VersionColumn() version = 0; }
@Entity() export class Watched { @Column() status = ""; }
@EventSubscriber() export class WatchedSubscriber { listenTo() { return Watched; } beforeUpdate() {} }
@Entity() export class Parent { @Column() status = ""; @OneToMany(() => Order, (order: Order) => order, { cascade: true }) items!: Order[]; }
export declare class MikroManager {
  find<T>(entity: new () => T, where?: object): Promise<T[]>;
  flush(): Promise<void>;
  removeAndFlush(entity: unknown): Promise<void>;
  nativeUpdate(entity: unknown, where: object, data: object): Promise<number>;
}
