import { childAt } from '../../ingest/common.mjs';
const DEPLOY = 'org.apache.maven.plugins:maven-deploy-plugin';

const PUBLISHING_PLUGINS = [
  'org.sonatype.central:central-publishing-maven-plugin',
  'org.sonatype.plugins:nexus-staging-maven-plugin',
  'org.apache.maven.plugins:maven-release-plugin',
];
const LIBRARY_PACKAGING = new Set(['jar', 'bundle', 'maven-plugin']);

export function isTrue(text) {
  return text?.trim().toLowerCase() === 'true';
}

export function isPublished(project, plugins) {
  const packaging = childAt(project, 'packaging')?.text ?? 'jar';
  const deploys =
    childAt(project, 'distributionManagement') !== undefined ||
    PUBLISHING_PLUGINS.some((name) => plugins.has(name));
  return (
    LIBRARY_PACKAGING.has(packaging) &&
    deploys &&
    !isTrue(childAt(project, 'properties', 'maven.deploy.skip')?.text) &&
    !isTrue(childAt(plugins.get(DEPLOY), 'configuration', 'skip')?.text)
  );
}
