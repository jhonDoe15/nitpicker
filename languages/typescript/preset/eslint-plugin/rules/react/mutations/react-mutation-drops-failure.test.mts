import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll } from 'vitest';
import { temporaryProjects } from '../../../../eslint-config/react/test-support/react-projects.mts';
import { createReactRuleTester } from '../test-support/tester.mts';
import { rule } from './react-mutation-drops-failure.mts';

const tester = createReactRuleTester();
const projects = temporaryProjects();
afterAll(() => {
  projects.removeProjects();
});

const imports = `import { useMutation } from '@tanstack/react-query';
import { useUpdateUserMutation, useSafeMutation, useUpdateUser } from './api';
import { useRemoteMutation } from 'sdk';
`;

function projectFile(name: string, files: Record<string, string> = {}) {
  const root = projects.projectWith('{"name":"app"}');
  mkdirSync(path.join(root, 'src'));
  for (const [file, text] of Object.entries(files)) {
    writeFileSync(path.join(root, 'src', file), text);
  }
  return path.join(root, 'src', name);
}

const api = {
  'api.ts': `export function useUpdateUserMutation() {
  return useMutation({ mutationFn: update });
}
export const useUpdateUser = (id: string) => useMutation({ mutationFn: (v) => update(id, v) });
export function useSafeMutation() {
  return useMutation({ mutationFn: update, onError: report });
}
`,
};
const filename = projectFile('panel.tsx', api);

function inPanel(body: string) {
  return `${imports}export function Panel({ onClose }) { ${body} return <div />; }`;
}

function valid(code: string) {
  return { filename, code: inPanel(code) };
}

function invalid(code: string, count = 1) {
  return {
    filename,
    code: inPanel(code),
    errors: Array.from({ length: count }, () => ({ messageId: 'dropsFailure' as const })),
  };
}

function centrallyHandled() {
  return projectFile('panel.tsx', {
    ...api,
    'client.ts':
      'export const client = new QueryClient({ mutationCache: new MutationCache({ onError: report }) });',
  });
}

tester.run('react-mutation-drops-failure', rule, {
  valid: [
    valid(`const { mutate } = useUpdateUser(user.id, options);
      mutate(values, { onSuccess: () => onClose() });`),
    valid(`const { mutate } = useUpdateUser(user.id, { onError: show });
      mutate(values, { onSuccess: () => onClose() });`),
    valid(`const { mutate } = useUpdateUserMutation();
      mutate(values, { onSuccess: () => onClose(), onError: (error) => toast.error(error.message) });`),
    valid(`const { mutate } = useMutation({ mutationFn: save, onSuccess: onClose, onError: show });
      mutate(values);`),
    valid(`const { mutate, error } = useUpdateUserMutation();
      mutate(values, { onSuccess: () => onClose() });`),
    valid(`const { mutate, isError } = useUpdateUserMutation();
      mutate(values, { onSuccess: () => onClose() });`),
    valid(`const { mutate, status: state } = useUpdateUserMutation();
      mutate(values, { onSuccess: () => onClose() });`),
    valid(`const update = useUpdateUserMutation();
      update.mutate(values, { onSuccess: () => onClose() });
      if (update.error) show(update.error);`),
    valid(`const update = useUpdateUserMutation();
      update.mutate(values, { onSuccess: () => onClose() });
      return <Form mutation={update} />;`),
    valid(`const { mutate, ...rest } = useUpdateUserMutation();
      mutate(values, { onSuccess: () => onClose() });`),
    valid(`const { mutate } = useUpdateUserMutation();
      mutate(values, { onSuccess: () => onClose(), onSettled: refresh });`),
    valid(`const { mutate } = useUpdateUserMutation();
      mutate(values);`),
    valid(`const { mutate } = useUpdateUserMutation();
      mutate(values, options);`),
    valid(`const { mutate } = useUpdateUserMutation();
      mutate(values, { ...shared, onSuccess: () => onClose() });`),
    valid(`const { mutate } = useUpdateUserMutation(options);
      mutate(values);`),
    valid(`const { mutateAsync } = useUpdateUserMutation();
      async function save() { try { await mutateAsync(values, { onSuccess: onClose }); } catch (e) { show(e); } }`),
    valid(`const { mutateAsync } = useUpdateUserMutation();
      const save = () => mutateAsync(values, { onSuccess: onClose }).catch(show);`),
    valid(`const { mutateAsync } = useUpdateUserMutation();
      const save = () => mutateAsync(values, { onSuccess: onClose });`),
    valid(`const [updateUser, { error }] = useUpdateUserMutation();
      updateUser(values, { onSuccess: () => onClose() });`),
    valid(`const [updateUser] = useUpdateUserMutation();
      updateUser(values, { onSuccess: () => onClose() });`),
    valid(`const { mutate } = useSafeMutation();
      mutate(values, { onSuccess: () => onClose() });`),
    valid(`const { mutate } = useRemoteMutation();
      mutate(values, { onSuccess: () => onClose() });`),
    valid(`const { mutate } = useLocalMutation();
      mutate(values, { onSuccess: () => onClose() });`),
    valid(`function useSaveMutation() { return useMutation({ mutationFn: save }); }
      const { mutate } = useSaveMutation();
      mutate(values, { onSuccess: () => onClose() });`),
    valid(`const { mutate } = useUpdateUserMutation();
      return <Form onSubmit={mutate} />;`),
    valid(`const { mutate } = useUpdateUserMutation();
      mutate(values, { onError: show });`),
    valid(`const { mutate } = useMutation({ mutationFn: save, onSuccess: onClose, throwOnError: true });
      mutate(values);`),
    valid(`const { mutate } = useMutation({ mutationFn: save, onSuccess: onClose, meta: { errorMessage: 'x' } });
      mutate(values);`),
    valid(`const { mutate } = useUpdateUserMutation();
      mutate(values, { onSuccess: () => onClose(), meta: { errorMessage: 'Save failed' } });`),
    {
      filename: centrallyHandled(),
      code: inPanel(`const { mutate } = useUpdateUserMutation();
      mutate(values, { onSuccess: () => onClose() });`),
    },
  ],
  invalid: [
    invalid(`const { mutateAsync } = useUpdateUser(user.id);
      const save = async (values) => { await mutateAsync(values, { onSuccess: () => onClose() }); };`),
    invalid(`const { mutate } = useUpdateUser(user.id, { onSuccess: () => onClose() });
      mutate(values);`),
    invalid(`const { mutate: updateUser } = useUpdateUserMutation();
      updateUser(values, { onSuccess: () => { toast.success('Saved'); onClose(); } });`),
    invalid(`const { mutate } = useMutation({ mutationFn: save });
      mutate(values, { onSuccess: onClose });`),
    invalid(`const { mutate, isPending } = useMutation({ mutationFn: save });
      mutate(values, { onSuccess() { onClose(); } });`),
    invalid(`const { mutate } = useMutation({ mutationFn: save, onSuccess: onClose });
      mutate(values);`),
    invalid(`const { mutate } = useMutation({ mutationFn: save, onSuccess: onClose });
      mutate(values);
      mutate(other);`),
    invalid(`const update = useUpdateUserMutation();
      update.mutate(values, { onSuccess: () => onClose() });`),
    invalid(`const update = useUpdateUserMutation();
      const submit = () => update.mutate(values, { onSuccess: () => onClose() });`),
    invalid(`const { mutateAsync } = useUpdateUserMutation();
      async function save() { await mutateAsync(values, { onSuccess: onClose }); }`),
    invalid(`const { mutateAsync } = useUpdateUserMutation();
      async function save() { try { await mutateAsync(values); } catch (e) { show(e); } }
      async function other() { await mutateAsync(values, { onSuccess: onClose }); }`),
    invalid(`const { mutate } = api.users.update.useMutation();
      mutate(values, { onSuccess: () => onClose() });`),
    invalid(`const { mutate } = useUpdateUserMutation({ onSuccess: () => onClose() });
      mutate(values);`),
    invalid(
      `const { mutate } = useUpdateUserMutation();
      mutate(first, { onSuccess: () => onClose() });
      mutate(second, { onSuccess: () => refresh() });`,
      2,
    ),
  ],
});
