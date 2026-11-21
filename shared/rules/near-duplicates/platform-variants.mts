import type { NearPair } from './near-types.mts';

const PLATFORM_SOURCE = /^(?:.*\/)?src\/(?<set>[A-Za-z0-9]+)Main\/(?:kotlin|java)\/(?<inner>.+)$/u;

type Place = { readonly set: string; readonly inner: string; readonly name: string };

function platformPlace({
  file,
  name,
}: {
  readonly file: string;
  readonly name: string;
}): Place | undefined {
  const groups = PLATFORM_SOURCE.exec(file)?.groups;
  const set = groups?.['set'];
  const inner = groups?.['inner'];
  return set === undefined || inner === undefined ? undefined : { set, inner, name };
}

export function isPlatformVariant([here, other]: NearPair): boolean {
  const left = platformPlace(here);
  const right = platformPlace(other);
  return (
    left !== undefined &&
    right !== undefined &&
    left.set !== right.set &&
    (left.inner === right.inner || left.name === right.name)
  );
}
