export function filesEnvironment(files) {
  return {
    read: (name) => files[name],
    exists: (name) => Object.hasOwn(files, name),
    list: (name) =>
      Object.keys(files)
        .filter((file) => file.startsWith(`${name}/`))
        .map((file) => file.slice(name.length + 1))
        .filter((file) => !file.includes('/')),
  };
}

export function enforceable(fields) {
  return {
    identity: 'id',
    message: 'message',
    classification: 'enforceable',
    ...fields,
  };
}
