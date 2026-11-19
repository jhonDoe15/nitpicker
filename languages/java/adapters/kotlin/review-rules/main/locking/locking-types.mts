export type ItemScope = {
  k: string;
  name?: string;
  qualified?: string;
  host?: string;
  qualifier?: string;
  argument?: string;
  supers?: string[];
};

export type ClassScope = ItemScope & { qualified: string };

export type LockedItem = {
  line: number;
  scopes: ItemScope[];
  locals: string[];
  synchronizedFunction: boolean;
};

export type LockAcquisition = LockedItem & { lock: string };

export type FieldWrite = LockedItem & {
  target: string;
  viaThis: boolean;
  operator: string;
  readsTarget: boolean;
  explicitLock: boolean;
};

export type LockedCall = { name: string; scopes: ItemScope[] };
