import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

export function useDeclarationScripts(enabled: boolean): ReturnType<typeof useScripts> {
  return useScripts({
    enabled,
    hidden: ['test-without-assertion', 'unindexed-foreign-key', 'lazy-relation-in-loop'],
  });
}

export type DeclaredClass = {
  readonly models: readonly string[];
  readonly header: string;
  readonly body: readonly string[];
  readonly meta: readonly string[];
};

export function declaredClass({ models, header, body, meta }: DeclaredClass): string {
  return code(...models, header, ...body, '', '    class Meta:', ...meta);
}

export { code };
