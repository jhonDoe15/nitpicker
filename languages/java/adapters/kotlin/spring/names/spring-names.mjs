export const SPRING = 'org.springframework';
export const PERSISTENCE = 'jakarta.persistence';

export function set(...names) {
  return new Set(names);
}

export function under(prefix, ...names) {
  return names.map((name) => `${prefix}.${name}`);
}
