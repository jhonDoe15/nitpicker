import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkoutModuleUrl } from "../../../../shared/paths/checkout-module.mjs";
import { ESLint } from 'eslint';
import { listNativeRules } from "./plan/rule-listing.mjs";
import { listedFiles } from "./plan/listed-files.mjs";
import { readLayout } from "../../preset/head-policy.mjs";
import { END_TO_END_ROOT } from "../../preset/layout/end-to-end.mjs";
import { parsedTsconfig } from "../../preset/modules/tsconfig-files.mjs";
import { isInvokedModule } from "../typed/static-checks.mjs";
import { incompatiblePackageMessage } from "../lint-engine/compatibility/incompatible-package.mjs";
import { fieldOf, fieldsOf } from "../../../../shared/values/readers.mjs";
import { nativeConfigFlags } from "../lint-engine/compatibility/native-config.mjs";
const readTsconfig = parsedTsconfig;
const DECORATOR_METADATA_RULES = ['@typescript-eslint/consistent-type-imports'];
const DECORATOR = /(?:^|[\s(,])@[A-Za-z_$]/mu;
const wrapperConfigPath = fileURLToPath(checkoutModuleUrl(new URL('../eslint-wrapper.config.mjs', import.meta.url)));
if (isInvokedModule(import.meta.url)) {
    const [projectRoot = '', ...patterns] = process.argv.slice(2);
    try {
        process.stdout.write(`${JSON.stringify(await lintPlan(projectRoot, patterns))}\n`);
    }
    catch (error) {
        process.stderr.write(`oxlint planning failed: ${planningFailure(error)}\n`);
        process.exitCode = 2;
    }
}
function planningFailure(error) {
    if (!(error instanceof Error)) {
        return String(error);
    }
    return incompatiblePackageMessage(error.stack ?? '', { cwd: process.cwd() }) ?? error.message;
}
async function lintPlan(root, globs) {
    const [nativeRules, plan] = await Promise.all([
        listNativeRules(process.env),
        filePlan(root, globs),
    ]);
    return { ...plan, nativeRules };
}
async function filePlan(root, globs) {
    const eslint = new ESLint({
        cwd: root,
        overrideConfigFile: wrapperConfigPath,
        flags: nativeConfigFlags(wrapperConfigPath),
    });
    const plan = {
        groups: new Map(),
        noInlineConfig: [],
        typedPluginRules: new Set(),
        ruleMessages: {},
        metadataProjects: new Map(),
    };
    for (const file of candidateFiles(root, globs)) {
        const config = await lintedConfig(eslint, file);
        if (config !== undefined) {
            addFile(plan, { root, file }, config);
        }
    }
    return {
        groups: [...plan.groups.values()],
        noInlineConfig: plan.noInlineConfig,
        typedPluginRules: [...plan.typedPluginRules],
        ruleMessages: plan.ruleMessages,
        ...(readLayout().isEndToEndTest(`${END_TO_END_ROOT}/`)
            ? { endToEndRoot: END_TO_END_ROOT }
            : {}),
    };
}
function addFile(plan, { root, file }, config) {
    const rules = enabledRules(fieldOf(config, 'rules'));
    const programRules = programRulesOf(plan.metadataProjects, path.join(root, file), config);
    addToGroup(plan.groups, file, {
        rules,
        globals: sortedGlobals(fieldOf(fieldOf(config, 'languageOptions'), 'globals')),
        settings: fieldOf(config, 'settings') ?? {},
        ...(programRules.length === 0 ? {} : { programRules }),
    });
    if (fieldOf(fieldOf(config, 'linterOptions'), 'noInlineConfig') === true) {
        plan.noInlineConfig.push(file);
    }
    for (const ruleId of typedRulesOf(config, rules)) {
        plan.typedPluginRules.add(ruleId);
    }
    addRuleMessages(plan.ruleMessages, config, rules);
}
function candidateFiles(root, globs) {
    const files = listedFiles(process.env) ??
        globSync([...globs], {
            cwd: root,
            exclude: (entry) => entry === 'node_modules' || entry.endsWith('/node_modules'),
        });
    return [...new Set(files.map((file) => file.replaceAll('\\', '/')))].sort();
}
async function lintedConfig(eslint, file) {
    if (await eslint.isPathIgnored(file)) {
        return undefined;
    }
    const config = await eslint.calculateConfigForFile(file);
    return config;
}
function enabledRules(rules = {}) {
    return Object.fromEntries(Object.entries(fieldsOf(rules))
        .filter(([, setting]) => severityOf(setting) !== 0)
        .sort(([left], [right]) => left.localeCompare(right)));
}
function severityOf(setting) {
    const severity = Array.isArray(setting) ? setting[0] : setting;
    return severity === 'off' ? 0 : severity;
}
function sortedGlobals(globals = {}) {
    return Object.fromEntries(Object.entries(fieldsOf(globals))
        .map(([name, value]) => [name, globalAccess(value)])
        .sort(([left], [right]) => left.localeCompare(right)));
}
function globalAccess(value) {
    if (value === true || value === 'writable' || value === 'writeable') {
        return 'writable';
    }
    if (value === 'off') {
        return 'off';
    }
    return 'readonly';
}
function addToGroup(groups, file, settings) {
    const key = JSON.stringify(settings);
    const group = groups.get(key) ?? { files: [], ...settings };
    group.files.push(file);
    groups.set(key, group);
}
function ruleDefinition(config, ruleId) {
    const separator = ruleId.lastIndexOf('/');
    const plugins = fieldOf(config, 'plugins');
    if (separator === -1) {
        return fieldOf(fieldOf(fieldOf(plugins, '@'), 'rules'), ruleId);
    }
    return fieldOf(fieldOf(fieldOf(plugins, ruleId.slice(0, separator)), 'rules'), ruleId.slice(separator + 1));
}
function typedRulesOf(config, rules) {
    return Object.keys(rules).filter((ruleId) => fieldOf(fieldOf(fieldOf(ruleDefinition(config, ruleId), 'meta'), 'docs'), 'requiresTypeChecking') === true);
}
function projectFilesOf(parserOptions) {
    const project = fieldOf(parserOptions, 'project');
    const tsconfigRootDir = fieldOf(parserOptions, 'tsconfigRootDir');
    if (typeof tsconfigRootDir !== 'string') {
        return [];
    }
    const projects = project === true ? ['tsconfig.json'] : [project].flat();
    return projects
        .filter((name) => typeof name === 'string')
        .map((name) => path.resolve(tsconfigRootDir, name));
}
function emitsDecoratorMetadata(projects, configFile) {
    const known = projects.get(configFile);
    if (known !== undefined) {
        return known;
    }
    const { options } = readTsconfig(configFile);
    const emits = options['experimentalDecorators'] === true && options['emitDecoratorMetadata'] === true;
    projects.set(configFile, emits);
    return emits;
}
function programRulesOf(projects, absoluteFile, config) {
    const enabled = enabledRules(fieldOf(config, 'rules'));
    const configured = DECORATOR_METADATA_RULES.filter((ruleId) => ruleId in enabled);
    const configFiles = projectFilesOf(fieldOf(fieldOf(config, 'languageOptions'), 'parserOptions') ?? {});
    if (configured.length === 0 ||
        !configFiles.some((file) => emitsDecoratorMetadata(projects, file))) {
        return [];
    }
    return DECORATOR.test(readFileSync(absoluteFile, 'utf8')) ? configured : [];
}
function addRuleMessages(ruleMessages, config, rules) {
    for (const ruleId of Object.keys(rules)) {
        ruleMessages[ruleId] ??=
            fieldOf(fieldOf(ruleDefinition(config, ruleId), 'meta'), 'messages') ?? {};
    }
}
