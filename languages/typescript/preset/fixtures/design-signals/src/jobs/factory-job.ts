import { Session } from '../model';

export function startSession(): Session {
  const session = new Session();
  session.open();
  return session;
}
