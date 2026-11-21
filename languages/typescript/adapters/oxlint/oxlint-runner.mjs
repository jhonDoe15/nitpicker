import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackTemporaryPath, untrackTemporaryPath } from "../typed/tooling.mjs";
import { fieldOf } from "../../../../shared/values/readers.mjs";
import { lintResultsOf, planOf, } from "./plan/oxlint-shapes.mjs";
import { withEngineLint } from "./run/engine-pass.mjs";
import { mergeResults } from "./run/merged-results.mjs";
import { lintConfigs, settledBeside } from "./run/stage-lint.mjs";
import { checkoutModuleUrl } from "../../../../shared/paths/checkout-module.mjs";
import { oxlintBinary, spawnJson } from "./oxlint-process.mjs";
import { messageIdResolver, nativeRuleIndex, PARITY_BRIDGED_RULES, rejectedRuleIds, translatePlan, } from "./oxlint-translation.mjs";
import { directiveFilesOf, neutralizeInlineConfig, oxlintDirectiveLocations, rewriteDirectiveComments, } from "./stage/oxlint-directives.mjs";
import { createStage, hideNestedTypeScriptConfigs, writeStageConfigs, } from "./stage/oxlint-stage.mjs";
const PLAN_PATH = fileURLToPath(checkoutModuleUrl(new URL('oxlint-plan.mjs', import.meta.url)));
const MAX_CONFIGURATION_ATTEMPTS = 20;
export async function lintWithOxlint({ options, environment, projectConfigPath, runEslintCli, }) {
    const plan = planFor(options, environment);
    const files = plan.groups.flatMap((group) => group.files);
    const stage = trackTemporaryPath(createStage(options.projectRoot, projectConfigPath));
    try {
        if (projectConfigPath !== undefined) {
            hideNestedTypeScriptConfigs(stage, options.projectRoot, files);
        }
        const inlineConfig = neutralizeInlineConfig(stage, options.projectRoot, plan.noInlineConfig);
        const directiveFiles = directiveFilesOf(options.projectRoot, files, plan.noInlineConfig);
        const { projectRoot, timeoutMs } = options;
        const { results, residual } = await withEngineLint({ plan, projectRoot, environment, timeoutMs }, (engineEnvironment) => lintUntilAccepted({
            plan,
            stage,
            projectRoot,
            runEslintCli,
            environment: engineEnvironment,
            timeoutMs,
            neutralized: new Map([
                ...inlineConfig.neutralized,
                ...oxlintDirectiveLocations(directiveFiles),
            ]),
            directiveFiles,
        }));
        return mergeResults([...results, ...inlineConfig.results, ...residual]).map((result) => ({
            ...result,
            filePath: path.join(options.projectRoot, result.filePath),
        }));
    }
    finally {
        rmSync(stage, { recursive: true, force: true });
        untrackTemporaryPath(stage);
    }
}
function planFor(options, environment) {
    return planOf(spawnJson([PLAN_PATH, options.projectRoot, ...options.patterns], {
        cwd: options.projectRoot,
        env: environment,
        context: 'oxlint planning',
        timeoutMs: options.timeoutMs,
    }));
}
async function lintUntilAccepted({ plan, environment, ...run }) {
    const context = {
        plan,
        environment,
        ...run,
        native: { nativeRules: nativeRuleIndex(plan.nativeRules) },
        bridgedRules: new Set(PARITY_BRIDGED_RULES),
        residualRuns: new Map(),
    };
    const attempts = Array.from({ length: MAX_CONFIGURATION_ATTEMPTS }, () => context);
    for (const attempt of attempts) {
        const outcome = await lintAttempt(attempt);
        if (outcome.results !== undefined)
            return outcome;
    }
    throw new Error('oxlint rejected the lint configuration too many times');
}
async function lintAttempt({ plan, stage, projectRoot, runEslintCli, residualRuns, native, bridgedRules, neutralized, directiveFiles, ...run }) {
    const translation = translatePlan(plan, { ...native, bridgedRules });
    const sampleFile = plan.groups[0]?.files[0];
    const configs = writeStageConfigs({ stage, projectRoot, sampleFile, translation });
    rewriteDirectiveComments({
        stage,
        projectRoot,
        directiveFiles,
        ruleNames: translation.ruleNames,
    });
    try {
        checkNativeConfigs({ stage, configs, sampleFile, ...run });
    }
    catch (error) {
        bridgeRejectedRules(error, translation.ruleNames, bridgedRules);
        return { results: undefined };
    }
    const naming = {
        ruleNames: translation.ruleNames,
        messageIdOf: messageIdResolver(plan.ruleMessages),
        ruleMessages: plan.ruleMessages,
        neutralized,
    };
    return lintBesideResidual({
        residual: () => residualRun(residualRuns, translation.residual, () => residualResults(projectRoot, translation.residual, runEslintCli)),
        translation,
        bridgedRules,
        stage,
        configs,
        naming,
        ...run,
    });
}
function residualRun(residualRuns, residual, start) {
    const key = JSON.stringify(residual);
    const running = residualRuns.get(key) ?? start();
    residualRuns.set(key, running);
    return running;
}
async function lintBesideResidual({ residual, translation, bridgedRules, ...run }) {
    const [linted, residualOutcome] = await settledBeside(() => lintConfigs(run), residual, run);
    if (linted.status === 'rejected') {
        bridgeRejectedRules(linted.reason, translation.ruleNames, bridgedRules);
    }
    if (residualOutcome.status === 'rejected') {
        throw residualOutcome.reason;
    }
    return linted.status === 'rejected'
        ? { results: undefined }
        : { results: linted.value, residual: residualOutcome.value };
}
function checkNativeConfigs({ stage, configs, sampleFile, environment, timeoutMs, }) {
    if (sampleFile === undefined)
        return;
    for (const { nativeConfigPath } of configs) {
        spawnJson([
            oxlintBinary(),
            '--config',
            nativeConfigPath,
            '--format',
            'json',
            '--no-ignore',
            '--disable-nested-config',
            sampleFile,
        ], { cwd: stage, env: environment, context: 'oxlint', timeoutMs, acceptedStatuses: [0, 1] });
    }
}
function bridgeRejectedRules(error, ruleNames, bridgedRules) {
    const rejected = rejectedRuleIds(String(fieldOf(error, 'message')), ruleNames);
    if (rejected.length === 0 || rejected.every((ruleId) => bridgedRules.has(ruleId)))
        throw error;
    for (const ruleId of rejected)
        bridgedRules.add(ruleId);
}
async function residualResults(projectRoot, residual, runEslintCli) {
    if (residual.length === 0)
        return [];
    const files = [...new Set(residual.flatMap((group) => group.files))].sort();
    const rules = [...new Set(residual.flatMap((group) => group.rules))].sort();
    const results = lintResultsOf(await runEslintCli(files, {
        NITPICKER_DIFF_ESLINT_ONLY_RULES: JSON.stringify(rules),
    }));
    return results.map((result) => ({
        filePath: path.relative(projectRoot, result.filePath).replaceAll('\\', '/'),
        messages: result.messages.filter((message) => message.ruleId !== undefined && rules.includes(message.ruleId)),
    }));
}
