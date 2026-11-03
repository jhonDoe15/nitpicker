import { describe, expect, it } from 'vitest';
import { detachLocalGitVariables } from './local-variables.mjs';

describe('detachLocalGitVariables', () => {
  it('removes the repository-local variables and returns their values', () => {
    const environment = {
      PATH: process.env.PATH,
      GIT_DIR: '/hook/.git/worktrees/linked',
      GIT_WORK_TREE: '/hook/linked',
      GIT_INDEX_FILE: '/hook/.git/worktrees/linked/index',
      GIT_OBJECT_DIRECTORY: '/hook/.git/objects',
      GIT_COMMON_DIR: '/hook/.git',
      GIT_PREFIX: 'src/',
    };

    const detached = detachLocalGitVariables(environment);

    expect(environment).toEqual({ PATH: process.env.PATH });
    expect(detached).toEqual({
      GIT_DIR: '/hook/.git/worktrees/linked',
      GIT_WORK_TREE: '/hook/linked',
      GIT_INDEX_FILE: '/hook/.git/worktrees/linked/index',
      GIT_OBJECT_DIRECTORY: '/hook/.git/objects',
      GIT_COMMON_DIR: '/hook/.git',
      GIT_PREFIX: 'src/',
    });
  });

  it('keeps the `git -c` settings and the variables that do not name a repository', () => {
    const environment = {
      PATH: process.env.PATH,
      GIT_CONFIG_PARAMETERS: "'core.quotepath'='false'",
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'safe.directory',
      GIT_CONFIG_VALUE_0: '*',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_EXEC_PATH: '/usr/lib/git-core',
    };
    const before = { ...environment };

    expect(detachLocalGitVariables(environment)).toEqual({});
    expect(environment).toEqual(before);
  });
});
