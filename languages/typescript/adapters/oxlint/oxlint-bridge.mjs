var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import { checkoutModuleUrl } from "../../../../shared/paths/checkout-module.mjs";
import { fieldOf, listOf } from "../../../../shared/values/readers.mjs";
import { nativeConfigFlags } from "../lint-engine/compatibility/native-config.mjs";
export const CORE_RULES_NAMESPACE = '';
const wrapperPath = fileURLToPath(checkoutModuleUrl(new URL('../eslint-wrapper.config.mjs', import.meta.url)));
export async function bridgedPlugin({ namespace, alias, ruleNames, projectRoot, sampleFile, }) {
    const rules = namespace === CORE_RULES_NAMESPACE
        ? await coreRules({ ruleNames, projectRoot, sampleFile })
        : await pluginRules(namespace);
    return { meta: { name: alias }, rules };
}
async function coreRules({ ruleNames, projectRoot, sampleFile, }) {
    const eslint = new ESLint({
        cwd: projectRoot,
        overrideConfigFile: wrapperPath,
        flags: nativeConfigFlags(wrapperPath),
    });
    const config = await eslint.calculateConfigForFile(sampleFile);
    const rules = fieldOf(fieldOf(fieldOf(config, 'plugins'), '@'), 'rules');
    return Object.fromEntries(ruleNames.map((name) => [name, fieldOf(rules, name)]));
}
async function pluginRules(namespace) {
    const loaded = await import(__rewriteRelativeImportExtension(pathToFileURL(wrapperPath).href, true));
    const entries = listOf(fieldOf(loaded, 'default'));
    const plugin = fieldOf(fieldOf(entries.find((entry) => fieldOf(fieldOf(entry, 'plugins'), namespace) !== undefined), 'plugins'), namespace);
    if (plugin === undefined) {
        throw new Error(`ESLint plugin ${namespace} is not part of the lint policy`);
    }
    return fieldOf(plugin, 'rules');
}
