const PLATFORM_SOURCE = /^(?:.*\/)?src\/(?<set>[A-Za-z0-9]+)Main\/(?:kotlin|java)\/(?<inner>.+)$/u;

function platformPlace({ file, name }) {
  const groups = PLATFORM_SOURCE.exec(file)?.groups;
  return groups === undefined ? undefined : { ...groups, name };
}

export function isPlatformVariant([here, other]) {
  const [left, right] = [here, other].map(platformPlace);
  return (
    left !== undefined &&
    right !== undefined &&
    left.set !== right.set &&
    (left.inner === right.inner || left.name === right.name)
  );
}
