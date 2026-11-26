import '@mikro-orm/core';
declare function Entity(): ClassDecorator;
declare function Property(options?: object): PropertyDecorator;
@Entity() export class Ledger { @Property() total = 0; }
@Entity() export class Booked { @Property() total = 0; @Property({ version: true }) version = 0; }
