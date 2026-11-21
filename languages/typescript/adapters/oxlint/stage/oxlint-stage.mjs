import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, unlinkSync, writeFileSync, } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkoutModuleUrl } from "../../../../../shared/paths/checkout-module.mjs";
import { typescriptApi } from "../../typed/typescript-program.mjs";
import { fieldsOf, listOf } from "../../../../../shared/values/readers.mjs";
import { ownedNativePlugins } from "../native/owned-native-rules.mjs";
import { materializedDirectory } from "./oxlint-inline-config.mjs";
import { stageConfigOptions } from "./oxlint-paths.mjs";
const ts = typescriptApi();
const STAGE_DIRECTORY = '.nitpicker-oxlint';
export function hideNestedTypeScriptConfigs(stage, projectRoot, files) {
    for (const directory of nestedConfigDirectories(projectRoot, files)) {
        const stageDirectory = materializedDirectory({
            stage,
            projectRoot,
            relativeDirectory: directory,
        });
        unlinkSync(path.join(stageDirectory, 'tsconfig.json'));
    }
}
function nestedConfigDirectories(projectRoot, files) {
    const directories = new Set(files.flatMap((file) => ancestorDirectories(path.posix.dirname(file))));
    return [...directories]
        .sort()
        .filter((directory) => existsSync(path.join(projectRoot, directory, 'tsconfig.json')));
}
function ancestorDirectories(directory) {
    const segments = directory === '.' ? [] : directory.split('/');
    return segments.map((_segment, index) => segments.slice(0, index + 1).join('/'));
}
export function createStage(projectRoot, projectConfigPath) {
    const stage = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-')));
    for (const entry of readdirSync(projectRoot)) {
        if (projectConfigPath !== undefined && entry === 'tsconfig.json')
            continue;
        symlinkSync(path.join(projectRoot, entry), path.join(stage, entry));
    }
    if (projectConfigPath !== undefined) {
        writeFileSync(path.join(stage, 'tsconfig.json'), lintTypeScriptConfig(projectConfigPath, stage));
    }
    mkdirSync(path.join(stage, STAGE_DIRECTORY));
    return stage;
}
function lintTypeScriptConfig(projectConfigPath, stage) {
    const parsed = ts.parseConfigFileTextToJson(projectConfigPath, readFileSync(projectConfigPath, 'utf8'));
    const config = fieldsOf(parsed.config);
    if (parsed.error !== undefined) {
        throw new Error(`Lint TypeScript config ${projectConfigPath} is not valid JSON`);
    }
    const rebased = {
        ...config,
        ...(config['extends'] === undefined
            ? {}
            : { extends: rebasedExtends(config['extends'], path.dirname(projectConfigPath)) }),
    };
    const { compilerOptions, unset, typeFiles } = stageConfigOptions(rebased, projectConfigPath, stage);
    return JSON.stringify({
        ...rebased,
        ...(typeFiles.length === 0 ? {} : { files: [...listOf(config['files']), ...typeFiles] }),
        compilerOptions: {
            ...fieldsOf(config['compilerOptions']),
            ...compilerOptions,
            ...Object.fromEntries(unset.map((option) => [option, null])),
            noEmit: true,
        },
    });
}
function rebasedExtends(value, directory) {
    return Array.isArray(value)
        ? value.map((entry) => rebasedExtend(entry, directory))
        : rebasedExtend(value, directory);
}
function rebasedExtend(value, directory) {
    return typeof value === 'string' && (value.startsWith('./') || value.startsWith('../'))
        ? path.resolve(directory, value)
        : value;
}
export function writeStageConfigs({ stage, projectRoot, sampleFile, translation, }) {
    const bridge = checkoutModuleUrl(new URL('../oxlint-bridge.mjs', import.meta.url)).href;
    const jsPlugins = translation.plugins.map((plugin) => {
        const request = { ...plugin, projectRoot, sampleFile };
        writeFileSync(path.join(stage, STAGE_DIRECTORY, `${plugin.alias}.mjs`), `import { bridgedPlugin } from ${JSON.stringify(bridge)};\nexport default await bridgedPlugin(${JSON.stringify(request)});\n`);
        return `./${STAGE_DIRECTORY}/${plugin.alias}.mjs`;
    });
    const bridgedRulePrefixes = translation.plugins.map(({ alias }) => `${alias}/`);
    const { typeAwareRules } = translation;
    const plain = translation.partitions.map((partition) => ({
        partition: withRules(partition, (rule) => !typeAwareRules.has(rule)),
        plugins: jsPlugins,
        typeAware: false,
    }));
    const typed = typeAwarePartition(translation.partitions, typeAwareRules);
    const passes = typed === undefined ? plain : [...plain, { ...typed, plugins: [] }];
    return passes.map(({ partition, plugins, typeAware }, index) => {
        const configPath = path.join(stage, `${STAGE_DIRECTORY}rc-${String(index)}.json`);
        const nativeConfigPath = path.join(stage, `${STAGE_DIRECTORY}rc-${String(index)}-native.json`);
        const config = stageConfig(partition, plugins);
        writeFileSync(configPath, JSON.stringify(config, null, 2));
        writeFileSync(nativeConfigPath, JSON.stringify(nativeConfig(config, bridgedRulePrefixes)));
        return { configPath, nativeConfigPath, files: partition.files, typeAware };
    });
}
function withRules(partition, keeps) {
    return {
        ...partition,
        overrides: partition.overrides.map((override) => ({
            ...override,
            rules: Object.fromEntries(Object.entries(override.rules).filter(([rule]) => keeps(rule))),
        })),
    };
}
function typeAwarePartition(partitions, typeAwareRules) {
    const typed = partitions
        .map((partition) => withRules(partition, (rule) => typeAwareRules.has(rule)))
        .filter(({ overrides }) => overrides.some(({ rules }) => Object.keys(rules).length > 0));
    if (typed.length === 0) {
        return undefined;
    }
    return {
        partition: {
            settings: {},
            files: [...new Set(partitions.flatMap(({ files }) => files))],
            overrides: typed.flatMap(({ overrides }) => overrides.filter(({ rules }) => Object.keys(rules).length > 0)),
        },
        typeAware: true,
    };
}
function nativeConfig(config, bridgedRulePrefixes) {
    return {
        ...config,
        jsPlugins: [],
        overrides: config.overrides.map((override) => ({
            ...override,
            rules: nativeRules(override.rules, bridgedRulePrefixes),
        })),
    };
}
function nativeRules(rules, bridgedRulePrefixes) {
    return Object.fromEntries(Object.entries(rules).filter(([rule]) => !bridgedRulePrefixes.some((prefix) => rule.startsWith(prefix))));
}
function stageConfig({ settings, overrides }, jsPlugins) {
    const categories = [
        'correctness',
        'suspicious',
        'pedantic',
        'perf',
        'restriction',
        'style',
        'nursery',
    ];
    return {
        plugins: ['typescript', 'vitest', ...ownedNativePlugins()],
        jsPlugins,
        categories: Object.fromEntries(categories.map((category) => [category, 'off'])),
        settings,
        overrides,
    };
}
