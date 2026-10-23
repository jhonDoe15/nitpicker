import type { Session } from '../model';

export function importRows(session: Session): void {
  session.open();
  try {
    session.write('rows');
  } finally {
    session.commit();
  }
}

export function importUsers(session: Session): void {
  session.open();
  try {
    session.write('users');
  } finally {
    session.commit();
  }
}
