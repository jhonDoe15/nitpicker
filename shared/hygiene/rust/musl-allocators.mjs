import path from 'node:path';
import { HYGIENE_RULE_IDS } from '../../project-rules/hygiene-rules.mjs';
import { exceptionHint } from '../rules.mjs';
import { builtCrates, muslBuilds } from './cargo-builds.mjs';
import {
  cargoCrates,
  cargoManifests,
  reachable,
  readSmallText,
  sourcesByCrate,
} from './cargo-crates.mjs';

const THREAD_CALL = /\bthread::(?:spawn|scope|Builder)\b/u;
const GLOBAL_ALLOCATOR = /#\[global_allocator\]/gu;
const NOT_MUSL = /\bnot\(\s*target_env\s*=\s*"musl"/u;
const OTHER_ENV = /\btarget_env\s*=\s*"(?!musl")/u;
const MUSL_ENV = /\btarget_env\s*=\s*"musl"/u;
const TEST_MODULE = /#\[cfg\(test\)\]/u;
const COMMENTS_AND_STRINGS = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"/gu;
const STRING = /^"/u;
const ATTRIBUTE_LOOKBACK = 200;

function blanked(match, keepStrings) {
  if (!STRING.test(match)) {
    return ' ';
  }
  return keepStrings ? match : '""';
}

function codeOf(text, keepStrings) {
  const code = text.replaceAll(COMMENTS_AND_STRINGS, (match) => blanked(match, keepStrings));
  const test = TEST_MODULE.exec(code);
  return test === null ? code : code.slice(0, test.index);
}

function declaresAllocator(code) {
  return [...code.matchAll(GLOBAL_ALLOCATOR)].some(({ index }) => {
    const before = code.slice(Math.max(0, index - ATTRIBUTE_LOOKBACK), index);
    const lastAttributes = before.slice(before.lastIndexOf(';') + 1);
    const excludesMusl =
      NOT_MUSL.test(lastAttributes) ||
      (OTHER_ENV.test(lastAttributes) && !MUSL_ENV.test(lastAttributes));
    return !excludesMusl;
  });
}

function crateFactsReader(projectRoot, crates, files) {
  const sources = sourcesByCrate(crates, files);
  const cache = new Map();
  return (crate) => {
    const cached = cache.get(crate.folder);
    if (cached !== undefined) {
      return cached;
    }
    const texts = (sources.get(crate.folder) ?? []).map(
      (file) => readSmallText(projectRoot, file) ?? '',
    );
    const facts = {
      threaded: crate.threadPool || texts.some((text) => THREAD_CALL.test(codeOf(text, false))),
      allocator:
        crate.allocatorCrate || texts.some((text) => declaresAllocator(codeOf(text, true))),
    };
    cache.set(crate.folder, facts);
    return facts;
  };
}

function dependencyClosure(crate, byFolder) {
  return reachable([crate], (current) =>
    current.pathDependencies.map((folder) => byFolder.get(folder)).filter(Boolean),
  );
}

function crateGap(crate, build, context) {
  if (crate.roots.length === 0) {
    return undefined;
  }
  const closure = dependencyClosure(crate, context.byFolder).map(context.factsOf);
  const threaded = closure.some((facts) => facts.threaded);
  return threaded && !closure.some((facts) => facts.allocator)
    ? { crate, build: build.file }
    : undefined;
}

function crateGaps(projectRoot, files, builds) {
  const manifests = cargoManifests(projectRoot, files);
  const crates = cargoCrates(manifests, files);
  const context = {
    byFolder: new Map(crates.map((crate) => [crate.folder, crate])),
    factsOf: crateFactsReader(projectRoot, crates, files),
  };
  const gaps = new Map();
  for (const build of builds) {
    const fresh = builtCrates(build, manifests, crates).filter((crate) => !gaps.has(crate.folder));
    for (const gap of fresh.map((crate) => crateGap(crate, build, context)).filter(Boolean)) {
      gaps.set(gap.crate.folder, gap);
    }
  }
  return [...gaps.values()].sort((left, right) =>
    left.crate.manifest.localeCompare(right.crate.manifest),
  );
}

function muslAllocatorGaps(projectRoot, files) {
  if (!files.some((file) => path.posix.basename(file) === 'Cargo.toml')) {
    return [];
  }
  const builds = muslBuilds(projectRoot, files);
  return builds.length === 0 ? [] : crateGaps(projectRoot, files, builds);
}

function muslAllocatorMessage({ crate, build }) {
  return `The binary crate ${crate.manifest} runs work on several threads and is built for a musl target (${build}), but declares no \`#[global_allocator]\`. musl's allocator takes one lock for every allocation, so threads that allocate queue behind each other and the build can run many times slower than the glibc one. Declare a global allocator that scales across threads for the musl target, for example \`#[cfg(target_env = "musl")] #[global_allocator] static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;\`. An exception fits only when the binary is single-threaded in practice or does not allocate on its hot path.`;
}

export function muslAllocatorFindings(tool, { projectRoot, files }) {
  const rule = HYGIENE_RULE_IDS.muslDefaultAllocator;
  return muslAllocatorGaps(projectRoot, files).map((gap) => {
    const file = gap.crate.roots[0] ?? gap.crate.manifest;
    return {
      tool,
      rule,
      path: file,
      identity: `${gap.crate.manifest}|${rule}`,
      message: `${muslAllocatorMessage(gap)} ${exceptionHint(rule, file)}`,
      classification: 'enforceable',
    };
  });
}
