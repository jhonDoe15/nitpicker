import { PROJECT, type ReadOptions, useTempProjects } from './temp-projects.mts';

export type ReadFindings<Found> = (projectRoot: string, options: ReadOptions) => Found[];

export type LocatedFinding = {
  readonly rule: string;
  readonly message: string;
  readonly location: { readonly line: number };
};

export function scratchScanner<Found>(options: {
  prefix: string;
  read: ReadFindings<Found>;
}): (files: Readonly<Record<string, string>>, kotlin: boolean) => Found[] {
  const projectWith = useTempProjects(options.prefix);
  return (files, kotlin) => options.read(projectWith(files), { projects: [PROJECT], kotlin });
}

export function ruleLineRunners(options: {
  prefix: string;
  read: ReadFindings<LocatedFinding>;
  rule: string;
  className: string;
  javaImports: string;
}): { java: (body: string) => number[]; kotlin: (body: string) => number[] } {
  const scan = scratchScanner({ prefix: options.prefix, read: options.read });
  const { className } = options;
  function lines(file: string, text: string, kotlin: boolean): number[] {
    return scan({ [file]: text }, kotlin)
      .filter(({ rule }) => rule === options.rule)
      .map(({ location }) => location.line);
  }
  return {
    java: (body) =>
      lines(
        `src/main/java/shop/${className}.java`,
        `package shop;\n${options.javaImports}class ${className} {\n${body}\n}\n`,
        false,
      ),
    kotlin: (body) =>
      lines(
        `src/main/kotlin/shop/${className}.kt`,
        `package shop\nclass ${className} {\n${body}\n}\n`,
        true,
      ),
  };
}
