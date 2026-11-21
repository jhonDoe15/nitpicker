import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mts';
import { trackedFiles } from '../tracked-files.mjs';
import { muslAllocatorFindings } from './musl-allocators.mjs';

const { createGitRepository } = useGitFixtures();

function gaps(files) {
  const { root } = createGitRepository(files);
  return muslAllocatorFindings('repository-hygiene', {
    projectRoot: root,
    files: trackedFiles(root),
  }).map(({ path, identity }) => `${path} ${identity}`);
}

const crate = (name, dependencies = '') =>
  `[package]\nname = "${name}"\nversion = "0.1.0"\n\n[dependencies]\n${dependencies}`;
const RAYON = 'rayon = "1"\n';
const MAIN = 'fn main() { run(); }\n';
const MUSL_BUILD = 'cargo build --release --target x86_64-unknown-linux-musl';
const workflow = (run) => `jobs:\n  build:\n    steps:\n      - run: ${run}\n`;
const WORKSPACE = '[workspace]\nmembers = ["crates/*"]\n';
const MIMALLOC =
  '#[cfg(target_env = "musl")]\n#[global_allocator]\nstatic GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;\nfn main() {}\n';
const REPORT = 'crates/engine/src/main.rs crates/engine/Cargo.toml|musl-default-allocator';

function workspace(extra = {}) {
  return {
    'Cargo.toml': WORKSPACE,
    'crates/engine/Cargo.toml': crate('engine', RAYON),
    'crates/engine/src/main.rs': MAIN,
    ...extra,
  };
}

describe('musl-default-allocator', () => {
  it('reports a threaded binary crate that a workflow builds for musl without a global allocator', () => {
    expect(gaps(workspace({ '.github/workflows/release.yml': workflow(MUSL_BUILD) }))).toEqual([
      REPORT,
    ]);
    expect(
      gaps(
        workspace({
          Makefile: `release:\n\tcargo build --release \\\n\t  -p engine \\\n\t  --target aarch64-unknown-linux-musl\n`,
          'crates/other/Cargo.toml': crate('other', RAYON),
          'crates/other/src/main.rs': MAIN,
        }),
      ),
    ).toEqual([REPORT]);
  });

  it('finds threads in path dependencies, tokio features and .cargo/config targets', () => {
    expect(
      gaps({
        'tool/.cargo/config.toml': '[build]\ntarget = ["aarch64-unknown-linux-musl"]\n',
        'tool/Cargo.toml': crate('tool', 'core = { path = "../core" }\n'),
        'tool/src/main.rs': MAIN,
        'core/Cargo.toml': crate('core'),
        'core/src/lib.rs': 'pub fn run() { std::thread::spawn(|| {}); }\n',
        'server/.cargo/config.toml': '[build]\ntarget = "x86_64-unknown-linux-musl"\n',
        'server/Cargo.toml': crate(
          'server',
          'tokio = { version = "1", features = ["macros", "rt-multi-thread"] }\n',
        ),
        'server/src/main.rs': MAIN,
      }),
    ).toEqual([
      'server/src/main.rs server/Cargo.toml|musl-default-allocator',
      'tool/src/main.rs tool/Cargo.toml|musl-default-allocator',
    ]);
  });

  it('reports a crate built in an Alpine Rust stage', () => {
    expect(
      gaps({
        Dockerfile:
          'FROM rust:1.82-alpine AS build\nCOPY . .\nRUN cargo build --release\nFROM alpine\n',
        'Cargo.toml': crate('app', RAYON),
        'src/main.rs': MAIN,
      }),
    ).toEqual(['src/main.rs Cargo.toml|musl-default-allocator']);
  });

  it('accepts an allocator in the crate, a path dependency or a mimalloc override', () => {
    expect(
      gaps(
        workspace({
          '.github/workflows/r.yml': workflow(MUSL_BUILD),
          'crates/engine/src/main.rs': MIMALLOC,
        }),
      ),
    ).toEqual([]);
    expect(
      gaps(
        workspace({
          'Cargo.toml': `${WORKSPACE}\n[workspace.dependencies]\nalloc = { path = "crates/alloc" }\n`,
          '.github/workflows/r.yml': workflow(MUSL_BUILD),
          'crates/engine/Cargo.toml': crate('engine', `${RAYON}alloc = { workspace = true }\n`),
          'crates/alloc/Cargo.toml': crate('alloc'),
          'crates/alloc/src/lib.rs': MIMALLOC.replace('fn main() {}\n', ''),
        }),
      ),
    ).toEqual([]);
    expect(
      gaps(
        workspace({
          '.github/workflows/r.yml': workflow(MUSL_BUILD),
          'crates/engine/Cargo.toml': crate(
            'engine',
            `${RAYON}mimalloc = { version = "0.1", features = ["override"] }\n`,
          ),
        }),
      ),
    ).toEqual([]);
  });

  it.each([
    workflow('cargo build --release'),
    workflow('rustup target add x86_64-unknown-linux-musl && cargo build --release'),
    workflow('cargo build --release # was x86_64-unknown-linux-musl'),
    workflow('cargo install ripgrep --target x86_64-unknown-linux-musl'),
    workflow(`${MUSL_BUILD} -p other`),
    `jobs:\n  b:\n    defaults:\n      run:\n        working-directory: other\n    steps:\n      - run: ${MUSL_BUILD}\n`,
  ])('stays quiet when a workflow does not build this crate for musl: %s', (text) => {
    expect(gaps(workspace({ '.github/workflows/r.yml': text }))).toEqual([]);
  });

  it('stays quiet when the musl build is not of this crate', () => {
    expect(
      gaps({
        '.github/workflows/r.yml': workflow(MUSL_BUILD),
        'Cargo.toml': `${crate('root')}\n[workspace]\nmembers = ["tools/x"]\n`,
        'src/main.rs': MAIN,
        'tools/x/Cargo.toml': crate('x', RAYON),
        'tools/x/src/main.rs': MAIN,
        'vendor/y/Cargo.toml': crate('y', RAYON),
        'vendor/y/src/main.rs': MAIN,
      }),
    ).toEqual([]);
    expect(
      gaps({
        '.cargo/config.toml': '[target.x86_64-unknown-linux-musl]\nlinker = "cc"\n',
        'Cargo.toml': crate('a', RAYON),
        'src/main.rs': MAIN,
      }),
    ).toEqual([]);
  });

  it('counts threads only in shipped code', () => {
    const files = {
      '.github/workflows/r.yml': workflow(MUSL_BUILD),
      'Cargo.toml': [
        crate('app'),
        '[target.\'cfg(windows)\'.dependencies]\nrayon = "1"\n',
        '[dependencies.threadpool]\nversion = "1"\noptional = true\n',
      ].join('\n'),
      'src/main.rs':
        '// thread::spawn here\nfn main() { let s = "thread::spawn"; }\n#[cfg(test)]\nmod tests { fn t() { std::thread::spawn(|| {}); } }\n',
      'tests/it.rs': 'fn t() { std::thread::spawn(|| {}); }\n',
      'build.rs': 'fn main() { std::thread::spawn(|| {}); }\n',
    };
    expect(gaps(files)).toEqual([]);
  });

  it.each(['#[cfg(not(target_env = "musl"))]', '#[cfg(target_env = "gnu")]'])(
    'does not count an allocator declared only for other targets: %s',
    (cfg) => {
      expect(
        gaps({
          '.github/workflows/r.yml': workflow(MUSL_BUILD),
          'Cargo.toml': crate('app', RAYON),
          'src/main.rs': `${cfg}\n${MIMALLOC.split('\n').slice(1).join('\n')}`,
        }),
      ).toEqual(['src/main.rs Cargo.toml|musl-default-allocator']);
    },
  );
});
