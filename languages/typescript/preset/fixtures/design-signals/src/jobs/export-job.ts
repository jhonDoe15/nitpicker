import type { Session } from '../model';

export function exportRows(session: Session): void {
  session.open();
  try {
    session.write('export');
  } finally {
    session.commit();
  }
}

export function leaky(session: Session): void {
  session.open();
  session.write('leak');
}
