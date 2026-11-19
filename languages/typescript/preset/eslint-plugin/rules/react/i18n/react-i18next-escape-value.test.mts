import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll } from 'vitest';
import { temporaryProjects } from '../../../../eslint-config/react/test-support/react-projects.mts';
import { createReactRuleTester } from '../test-support/tester.mts';
import { rule } from './react-i18next-escape-value.mts';

const tester = createReactRuleTester();
const projects = temporaryProjects();
afterAll(() => {
  projects.removeProjects();
});

function projectFile(manifest: object, others: Record<string, string> = {}) {
  const root = projects.projectWith(JSON.stringify({ name: 'app', ...manifest }));
  mkdirSync(path.join(root, 'src'));
  for (const [file, text] of Object.entries(others)) {
    writeFileSync(path.join(root, 'src', file), text);
  }
  return path.join(root, 'src', 'banner.tsx');
}

const withI18next = { dependencies: { 'react-i18next': '15.0.0' } };
const filename = projectFile(withI18next);
const unescapedFilename = projectFile(withI18next, {
  'i18n.ts': 'i18next.use(initReactI18next).init({ interpolation: { escapeValue: false } });',
});
const withoutLibrary = projectFile({ dependencies: { react: '19.0.0' } });

function component(body: string, imports = "import { useTranslation } from 'react-i18next';") {
  return `${imports}
export function Banner({ title, count }) {
  const { t, i18n } = useTranslation();
  ${body}
}`;
}

function valid(code: string, file = filename) {
  return { filename: file, code };
}

function invalid(code: string) {
  return { filename, code, errors: [{ messageId: 'doubleEscaped' as const }] };
}

tester.run('react-i18next-escape-value', rule, {
  valid: [
    component(
      "return <h1 title={t('banner.title', 'Viewing {{title}}', { title, interpolation: { escapeValue: false } })} />;",
    ),
    component("return <h1>{t('banner.title', { count })}</h1>;"),
    component("return <h1>{t('banner.title', 'Viewing', { count: 2, context: 'male' })}</h1>;"),
    component("return <h1>{t('banner.title')}</h1>;"),
    component("return <h1>{t('banner.title', { n: 3 })}</h1>;"),
    component("return <h1>{t('banner.title', { name: 'Ada' })}</h1>;"),
    component("return <h1>{t('banner.title', { when: date.toLocaleDateString() })}</h1>;"),
    component("return <h1>{t('banner.title', { total: price.toFixed(2) })}</h1>;"),
    component("return <h1>{t('banner.title', { total: currencyFormat.format(price) })}</h1>;"),
    component("return <h1>{t('banner.title', { left: max - used })}</h1>;"),
    component(
      "const label = t('banner.title', { title }); return <h1 dangerouslySetInnerHTML={{ __html: label }} />;",
    ),
    component("return <h1 dangerouslySetInnerHTML={{ __html: t('banner.title', { title }) }} />;"),
    component("const label = t('banner.title', { title }); send(label); return <h1 />;"),
    component("return <h1 onClick={() => send(t('banner.title', { title }))} />;"),
    component("send(t('banner.title', { title })); return <h1 />;"),
    component("return <h1>{translate('banner.title', { title })}</h1>;"),
    component("return <h1>{other.t('banner.title', { title })}</h1>;"),
    component(
      'return <Trans i18nKey="banner.title" values={{ title }} shouldUnescape />;',
      "import { Trans } from 'react-i18next';",
    ),
    component(
      'return <Trans i18nKey="banner.title" values={{ count }} />;',
      "import { Trans } from 'react-i18next';",
    ),
    component(
      'return <Trans i18nKey="banner.title" values={{ title }} />;',
      "import { Trans } from './trans';",
    ),
    'export const Banner = ({ t, title }) => <h1>{t("banner.title", { title })}</h1>;',
    valid(
      component("return <h1>{t('banner.title', 'Viewing {{title}}', { title })}</h1>;"),
      unescapedFilename,
    ),
    valid(
      component("return <h1>{t('banner.title', 'Viewing {{title}}', { title })}</h1>;"),
      withoutLibrary,
    ),
  ].map((entry) => (typeof entry === 'string' ? valid(entry) : entry)),
  invalid: [
    invalid(
      component("return <h1 title={t('banner.title', 'You are viewing {{title}}', { title })} />;"),
    ),
    invalid(component("return <h1>{t('banner.title', { title })}</h1>;")),
    invalid(
      component(
        "return <h1>{t('banner.title', { defaultValue: 'Viewing {{title}}', title })}</h1>;",
      ),
    ),
    invalid(
      component(
        "const label = t('banner.title', { title }); return <h1 aria-label={label}>{label}</h1>;",
      ),
    ),
    invalid(component("return <h1>{title ? t('banner.title', { title }) : null}</h1>;")),
    invalid(component("return <h1>{i18n.t('banner.title', { title })}</h1>;")),
    invalid(component("return <h1>{i18n?.t('banner.title', { title })}</h1>;")),
    invalid(component("return <h1>{t?.('banner.title', { title })}</h1>;")),
    invalid(component("const label = t?.('banner.title', { title }); return <h1>{label}</h1>;")),
    invalid(component("return <h1>{t('banner.title', { title, count: 2 })}</h1>;")),
    invalid(
      component(
        'return <Trans i18nKey="banner.title" values={{ title }} />;',
        "import { Trans } from 'react-i18next';",
      ),
    ),
    invalid(
      `import i18next, { t } from 'i18next';
export const Banner = ({ title }) => <h1>{t('banner.title', { title })}</h1>;`,
    ),
    invalid(
      `import i18next from 'i18next';
export const Banner = ({ title }) => <h1>{i18next.t('banner.title', { title })}</h1>;`,
    ),
    invalid(
      `import { useTranslation } from 'react-i18next';
export const Banner = ({ title }) => {
  const [t] = useTranslation();
  return <h1>{t('banner.title', { title })}</h1>;
};`,
    ),
  ],
});
