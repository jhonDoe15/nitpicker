import { RULES_TOOL } from './tool.mjs';

function contractParts(subject) {
  const [member, kind, type, feature] = subject.split('|');
  return { member, kind, type, feature };
}

function describeContract(subject) {
  const { member, kind, type, feature } = contractParts(subject);
  return kind === 'persistence'
    ? `Return a frozen dataclass or a domain type from \`${member}\` and take plain values: \`${type}\` is a persistence handle, so every importer of feature \`${feature}\` depends on its database session`
    : `Take plain values and return a frozen dataclass or a domain type from \`${member}\`: \`${type}\` is a web request or response object, so every importer of feature \`${feature}\` needs a live HTTP exchange`;
}

function handlerParts(subject) {
  const [handler, site, entity, orm] = subject.split('|');
  return { handler, site, entity, orm };
}

function siteText(site) {
  return site.endsWith('=') ? `\`${site}\`` : site.replace(/^parameter (.+)$/u, 'parameter `$1`');
}

function describeHandler(subject) {
  const { handler, site, entity, orm } = handlerParts(subject);
  return `Take and return a separate schema (a Pydantic model or a frozen dataclass) in the ${siteText(site)} of route handler \`${handler}\` and map \`${entity}\` to it in the service: \`${entity}\` is a ${orm} entity, so the response serializes every column and loaded relation and ties the API to the database schema`;
}

export const CONTRACT_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['contract-infrastructure-type'],
    describe: describeContract,
    allowed:
      'Keep a persistence handle inside a repository class, an `adapters.py` or `persistence.py` module, or a module whose name starts with `_`, and pass it in from the composition root; read a request in the route handler or view and pass the values in.',
  },
  {
    tool: RULES_TOOL,
    rules: ['handler-entity-type'],
    describe: describeHandler,
    allowed:
      'A SQLModel class without `table=True` or a django-ninja `Schema` is a schema, not an entity.',
  },
];
