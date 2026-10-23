import { Session } from './cart';

export function guarded(session: Session): void {
  session.open();
  try {
    session.write('x');
  } finally {
    session.commit();
  }
}

export function leaky(session: Session): void {
  session.open();
  session.write('x');
}

export function twoSessions(first: Session, second: Session): void {
  first.open();
  second.open();
  first.commit();
}

export class Worker {
  constructor(private session: Session) {}

  run(): void {
    this.session.open();
    this.helper();
    this.session.commit();
  }

  helper(): void {}
}
