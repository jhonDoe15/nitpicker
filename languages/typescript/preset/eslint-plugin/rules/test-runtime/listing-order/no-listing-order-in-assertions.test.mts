import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-listing-order-in-assertions.mts';

const tester = typescriptRuleTester();

const flagged = (code: string) => ({ code, errors: [{ messageId: 'listingOrder' as const }] });
const FS =
  'import { readdirSync } from "node:fs"; import fs from "node:fs"; import { readdir } from "node:fs/promises";';
const GLOB =
  'import { glob } from "glob"; import fg from "fast-glob"; import { globby } from "globby";';
const withFs = (body: string) => `${FS} it("lists", async () => { ${body} });`;
const withGlob = (body: string) => `${GLOB} it("lists", async () => { ${body} });`;

tester.run('no-listing-order-in-assertions', rule, {
  valid: [
    withFs('expect(readdirSync(dir).sort()).toEqual(["a.txt", "b.txt"]);'),
    withFs('expect(readdirSync(dir).toSorted()).toEqual(["a.txt", "b.txt"]);'),
    withFs('expect(readdirSync(dir)).toEqual(["a.txt"]);'),
    withFs('expect(readdirSync(dir)).toEqual([]);'),
    withFs('expect(readdirSync(dir)).toEqual(expect.arrayContaining(["a.txt", "b.txt"]));'),
    withFs('expect(readdirSync(dir)).toHaveLength(2);'),
    withFs('expect(new Set(readdirSync(dir))).toEqual(new Set(["a.txt", "b.txt"]));'),
    withFs(
      'const files = readdirSync(dir); files.sort(); expect(files).toEqual(["a.txt", "b.txt"]);',
    ),
    withFs(
      'const files = readdirSync(dir); normalise(files); expect(files).toEqual(["a.txt", "b.txt"]);',
    ),
    withFs(
      'let files = readdirSync(dir); files = files.sort(); expect(files).toEqual(["a.txt", "b.txt"]);',
    ),
    withFs('expect(readdirSync(dir)).toEqual(["a.txt", ...rest]);'),
    withFs('expect(Object.keys(tree)).toEqual(["a", "b"]);'),
    withFs('expect(vol.readdirSync(dir)).toEqual(["a.txt", "b.txt"]);'),
    `import { readdirSync } from "node:fs"; vi.mock("node:fs");
      it("lists", () => { expect(readdirSync(dir)).toEqual(["a.txt", "b.txt"]); });`,
    `import { readdirSync } from "fs"; import mock from "mock-fs";
      it("lists", () => { expect(readdirSync(dir)).toEqual(["a.txt", "b.txt"]); });`,
    'import glob from "glob"; it("lists", () => { expect(glob.sync("*.ts")).toEqual(["a.ts", "b.ts"]); });',
    'it("lists", () => { expect(readdirSync(dir)).toEqual(["a.txt", "b.txt"]); });',
    `import fs from "fs";
      it("lists", () => {
        jest.spyOn(fs, "readdirSync").mockReturnValue(["b", "a"]);
        expect(fs.readdirSync(dir)).toEqual(["b", "a"]);
      });`,
    `import { readdirSync } from "fs";
      beforeEach(() => { vi.mock("fs"); });
      it("lists", () => { expect(readdirSync(dir)).toEqual(["a.txt", "b.txt"]); });`,
    `import { readdirSync } from "fs"; vi.mock("node:fs", () => memfs);
      it("lists", () => { expect(readdirSync(dir)).toEqual(["a.txt", "b.txt"]); });`,
    `import fs from "fs";
      it("lists", () => { const { fs } = setup(); expect(fs.readdirSync(d)).toEqual(["a", "b"]); });`,
  ],
  invalid: [
    flagged(withFs('expect(readdirSync(dir)).toEqual(["a.txt", "b.txt"]);')),
    flagged(withFs('expect(fs.readdirSync(dir)).toStrictEqual(["a.txt", "b.txt"]);')),
    flagged(withFs('expect(await readdir(dir)).toEqual(["a.txt", "b.txt"]);')),
    flagged(withFs('expect(await fs.promises.readdir(dir)).toEqual(["a.txt", "b.txt"]);')),
    flagged(withFs('const files = readdirSync(dir); expect(files).toEqual(["a.txt", "b.txt"]);')),
    flagged(
      withFs(
        'const files = await readdir(dir); expect(files.length).toBe(2); expect(files).toEqual(["a", "b"]);',
      ),
    ),
    flagged(withFs('expect(readdirSync(dir).map((f) => f.toUpperCase())).toEqual(["A", "B"]);')),
    flagged(withFs('assert.deepStrictEqual(readdirSync(dir), ["a.txt", "b.txt"]);')),
    flagged(withFs('expect(fs.readdirSync(dir)?.map((f) => f)).toEqual(["a", "b"]);')),
    flagged(withGlob('expect(await glob("**/*.ts")).toEqual(["a.ts", "b.ts"]);')),
    flagged(withGlob('expect(fg.sync("**/*.ts")).toEqual(["a.ts", "b.ts"]);')),
    flagged(withGlob('expect(await fg("**/*.ts")).toEqual(["a.ts", "b.ts"]);')),
    flagged(withGlob('expect(await globby("**/*.ts")).toEqual(["a.ts", "b.ts"]);')),
    flagged(
      `const fs = require("fs"); it("lists", () => { expect(fs.readdirSync(dir)).toEqual(["a", "b"]); });`,
    ),
    flagged(
      `const { readdirSync } = require("fs"); it("lists", () => { expect(readdirSync(dir)).toEqual(["a", "b"]); });`,
    ),
  ],
});
