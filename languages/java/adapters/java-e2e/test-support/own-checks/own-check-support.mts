const MAIN = 'src/main/java/demo';

export const SUPPORT_FILES = {
  [`${MAIN}/DoNotMutate.java`]: 'package demo;\n\npublic @interface DoNotMutate {}\n',
};

export type Dependency = readonly [string, string, string, string];

export const DEPENDENCIES: readonly Dependency[] = [
  ['org.slf4j', 'slf4j-api', '2.0.13', 'main'],
  ['org.springframework', 'spring-context', '6.1.8', 'main'],
  ['org.springframework', 'spring-web', '6.1.8', 'main'],
  ['org.junit.jupiter', 'junit-jupiter-api', '5.10.2', 'test'],
  ['org.junit-pioneer', 'junit-pioneer', '2.2.0', 'test'],
];
