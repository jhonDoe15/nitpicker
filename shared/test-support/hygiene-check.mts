import type { FileMap } from '../../core/diff/git/test-support/fixture-files.mts';
import { useGitFixtures } from '../../core/diff/git/test-support/git-repository.mts';
import { yamlDocuments } from '../../core/tooling/yaml/yaml-documents.mts';
import type { RepositoryContext } from '../hygiene/check-types.mts';
import { trackedFiles } from '../hygiene/tracked-files.mts';
import type { Finding } from '../values/findings.mts';

type Context = Pick<RepositoryContext, 'projectRoot' | 'files' | 'parseYaml'>;

export function hygieneCheck(
  finder: (tool: string, context: Context) => Finding[],
): (files: FileMap) => Finding[] {
  const { createGitRepository } = useGitFixtures();
  return (files) => {
    const { root } = createGitRepository(files);
    return finder('repository-hygiene', {
      projectRoot: root,
      files: trackedFiles(root),
      parseYaml: yamlDocuments,
    });
  };
}
