export const SPRING = 'org.springframework';
export const PERSISTENCE = 'jakarta.persistence';
export const set = (...names) => new Set(names);
export const under = (prefix, ...names) => names.map((name) => `${prefix}.${name}`);
