# Test coverage provider

`vitest.config.mts` records coverage with `coverage-provider.mts`, which is Vitest's V8 provider
with one change: a test worker hands on only the coverage of the scripts Vitest ran itself.

Some tests make Node load the repository's own modules directly, for example when ESLint imports a
config that imports the plugin. Node then runs a second copy of each such module, with the same
`file://` URL as the copy Vitest runs but different code: Node strips the TypeScript types, while
Vitest runs its own transform inside a wrapper function. The V8 provider adds the counts of both
copies together by URL and maps them all onto Vitest's code, which gives branch counts below zero
and function counts of zero for functions that ran. A script counts as run by Vitest when a function
other than the script itself starts inside the wrapper (before the module's `startOffset`) and ends
where the script ends. The copies Node loaded are left out, so their runs count as not covered.

The provider calls itself `custom` instead of `v8`, since the workers load the module the
configuration names only for a custom provider.

When one test file runs a module as two different codes under the same URL, for example a test that
starts Vitest inside its own worker, the provider drops all copies of that module from that file's
coverage, since it cannot tell which copy matches the code Vitest maps the counts onto.

A merge of blob reports (`vitest --merge-reports`) cannot load this module, because the merge
restores the module graph of the test run without the module's code. The blobs already hold
converted coverage, so CI merges them with `--coverage.provider=v8`.
