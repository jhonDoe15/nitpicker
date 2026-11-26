import 'typeorm';
declare function Entity(): ClassDecorator;
declare function Column(): PropertyDecorator;
declare function VersionColumn(): PropertyDecorator;
@Entity() export class Plain { @Column() balance = 0; }
@Entity() export class Locked { @Column() balance = 0; @VersionColumn() version = 0; }
@Entity() export class Child extends Locked { @Column() note = ''; }
export class NotMapped { balance = 0; }
