import { availableParallelism, totalmem } from 'node:os';
import { diagnosticsOf } from "../plan/oxlint-shapes.mjs";
import { eslintShapedResults } from "../oxlint-diagnostics.mjs";
import { oxlintBinary, spawnJsonAsync, tsgolintBinary } from "../oxlint-process.mjs";
import { appendAll } from "../../../../../shared/lists/lists.mjs";
import { mergedPassResults } from "./pass-directives.mjs";
const MAX_ARGUMENT_BYTES = 1024 * 1024;
const MIN_FILES_PER_SLICE = 200;
const GIB = 1024 ** 3;
const MEMORY_PER_SLICE = 1.5 * GIB;
const LINT_MEMORY_PERCENT = 75;
const PROGRAM_BYTES_PER_FILE = 0.75 * 1024 ** 2;
function machineMemory() {
    const constrained = process.constrainedMemory();
    const total = totalmem();
    return constrained > 0 && constrained < total ? constrained : total;
}
function runsBesideTypeChecks(fileCount, memory = machineMemory()) {
    return 2 * fileCount * PROGRAM_BYTES_PER_FILE <= (memory * LINT_MEMORY_PERCENT) / 100;
}
export async function settledBeside(lint, residual, { configs }) {
    const fileCount = new Set(configs.flatMap(({ files }) => files)).size;
    if (runsBesideTypeChecks(fileCount)) {
        const [linted, rest] = await Promise.allSettled([lint(), residual()]);
        return [linted, rest];
    }
    const [linted] = await Promise.allSettled([lint()]);
    if (linted.status === 'rejected') {
        return [linted, { status: 'fulfilled', value: [] }];
    }
    const [rest] = await Promise.allSettled([residual()]);
    return [linted, rest];
}
export async function lintConfigs({ configs, ...run }) {
    const passes = [];
    for (const config of configs) {
        const slices = config.typeAware ? [config.files] : fileSlices(config.files);
        const reports = await Promise.allSettled(slices.map((files) => lintStage({ ...run, configPath: config.configPath, files, typeAware: config.typeAware })));
        const failed = reports.find((report) => report.status === 'rejected');
        if (failed !== undefined) {
            throw failed.reason;
        }
        passes.push({
            typeAware: config.typeAware,
            results: reports.flatMap((report) => (report.status === 'fulfilled' ? report.value : [])),
        });
    }
    return mergedPassResults(passes);
}
export function sliceCount(fileCount, cpus = availableParallelism(), memory = machineMemory()) {
    const byMemory = Math.floor((memory * LINT_MEMORY_PERCENT) / 100 / MEMORY_PER_SLICE);
    return Math.max(1, Math.min(cpus, byMemory, Math.floor(fileCount / MIN_FILES_PER_SLICE)));
}
function fileSlices(files) {
    const count = sliceCount(files.length);
    return Array.from({ length: count }, (_slice, index) => files.filter((_file, position) => position % count === index));
}
async function lintStage({ stage, configPath, files, typeAware, naming, environment, timeoutMs, }) {
    const typeAwareEnvironment = typeAware ? { OXLINT_TSGOLINT_PATH: tsgolintBinary() } : {};
    const results = [];
    for (const chunk of argumentChunks(files)) {
        const report = await spawnJsonAsync([
            oxlintBinary(),
            '--config',
            configPath,
            '--format',
            'json',
            '--no-ignore',
            '--disable-nested-config',
            '--report-unused-disable-directives',
            ...(typeAware ? ['--type-aware'] : []),
            ...chunk,
        ], {
            cwd: stage,
            env: { ...environment, ...typeAwareEnvironment },
            context: 'oxlint',
            timeoutMs,
            acceptedStatuses: [0, 1],
        });
        appendAll(results, eslintShapedResults(stage, diagnosticsOf(report), naming));
    }
    return results;
}
function argumentChunks(files) {
    const chunks = [[]];
    let size = 0;
    for (const file of files) {
        if (size + file.length > MAX_ARGUMENT_BYTES && (chunks.at(-1)?.length ?? 0) > 0) {
            chunks.push([]);
            size = 0;
        }
        chunks.at(-1)?.push(file);
        size += file.length + 1;
    }
    return chunks.filter((chunk) => chunk.length > 0);
}
