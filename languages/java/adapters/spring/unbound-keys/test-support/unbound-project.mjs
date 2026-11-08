import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unboundPropertyProblems } from '../unbound-keys.mjs';
import { metadataJson, writeJar } from './metadata-jar.mjs';

const MAP = 'java.util.Map<java.lang.String,java.lang.String>';
const BOOT_METADATA = {
  groups: [
    'server',
    'spring.datasource',
    'spring.datasource.hikari',
    'spring.jpa',
    'spring.data.redis',
    'management.endpoints.web.exposure',
    'management.endpoint.health',
  ],
  properties: [
    { name: 'server.port', type: 'java.lang.Integer' },
    'server.address',
    'spring.application.name',
    'spring.datasource.url',
    'spring.datasource.username',
    'spring.datasource.password',
    { name: 'spring.datasource.hikari.maximum-pool-size', type: 'java.lang.Integer' },
    { name: 'spring.jpa.open-in-view', type: 'java.lang.Boolean' },
    { name: 'spring.jpa.properties', type: MAP },
    'spring.data.redis.host',
    'spring.data.redis.username',
    {
      name: 'spring.redis.host',
      deprecation: { level: 'error', replacement: 'spring.data.redis.host' },
    },
    {
      name: 'spring.redis.username',
      deprecation: { level: 'error', replacement: 'spring.data.redis.username' },
    },
    {
      name: 'server.max-http-header-size',
      type: 'java.lang.String',
      deprecation: { level: 'warning' },
    },
    { name: 'logging.level', type: MAP },
    { name: 'spring.profiles.active', type: 'java.util.List<java.lang.String>' },
    { name: 'spring.config.activate.on-profile', type: 'java.lang.String[]' },
    { name: 'management.endpoints.web.exposure.include', type: 'java.util.Set<java.lang.String>' },
    {
      name: 'management.endpoint.health.show-details',
      type: 'org.springframework.boot.actuate.endpoint.Show',
    },
  ],
};

function fileIn(root, name) {
  const full = path.resolve(root, name);
  if (!full.startsWith(root + path.sep)) {
    throw new Error(`${name} is outside the scratch project`);
  }
  return full;
}

function writeProject(
  roots,
  files,
  { jarName = 'spring-boot-3.5.5.jar', metadata = BOOT_METADATA },
) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-unbound-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    const file = fileIn(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  const jar = fileIn(root, `libs/${jarName}`);
  mkdirSync(path.dirname(jar), { recursive: true });
  writeJar(jar, { 'META-INF/spring-configuration-metadata.json': metadataJson(metadata) });
  return { root, jar };
}

function problemsIn(roots, files, options) {
  const { root, jar } = writeProject(roots, files, options);
  return unboundPropertyProblems(root, {
    classpath: options.classpath ?? [jar],
    sourceRoots: ['src/main/java', 'src/main/kotlin'],
    testSourceRoots: ['src/test/java', 'src/test/kotlin'],
    resourceRoots: ['src/main/resources'],
  }).map(
    ({ path: file, line, message }) =>
      `${file}:${String(line)} ${message.split(' Declare a key')[0]}`,
  );
}

export function scratchProjects() {
  const roots = [];
  return {
    write: (files, options = {}) => writeProject(roots, files, options),
    problemsIn: (files, options = {}) => problemsIn(roots, files, options),
    remove: () => {
      for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}
