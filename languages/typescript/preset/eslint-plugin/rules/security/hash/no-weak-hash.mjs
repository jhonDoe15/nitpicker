import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { importedName } from "../../../fixes/support/nodes.mjs";
import { stringValue } from "../../analysis/constant-resolution.mjs";
import { bindingsOf, isModuleValue } from "../imported-names.mjs";
import { memberName, unwrapped } from "../security-values.mjs";
import { CRYPTO_JS_WEAK, callFinding, isCheckedArgument, isHashProperty, weakLeaves, } from "./hash-calls.mjs";
import { hmacPackageAlgorithm, isHmacArgument, isHmacOptions, isMessageDigest, isWeakPackage, packageSource, weakNamedImports, } from "./hash-sources.mjs";
const CRYPTO_MODULES = new Set(['crypto', 'node:crypto', 'create-hash', 'crypto-browserify']);
const CRYPTO_JS = new Set(['crypto-js']);
function reportedAtProperty(scope, leaf) {
    const owner = leaf.parent;
    return ((owner?.type === AST_NODE_TYPES.Property ||
        owner?.type === AST_NODE_TYPES.PropertyDefinition) &&
        owner.value === leaf &&
        isHashProperty(owner) &&
        !isCheckedArgument(scope, owner));
}
function report({ context }, node, { algorithm, hmac }) {
    if (hmac && !isMessageDigest(algorithm)) {
        return;
    }
    const messageId = hmac ? 'weakHmac' : 'weakHash';
    context.report({ node, messageId, data: { algorithm } });
}
function reportFinding(scope, node, finding) {
    const kept = finding.leaves.filter((leaf) => !reportedAtProperty(scope, leaf));
    const names = [...(finding.names ?? []), ...kept.flatMap((leaf) => stringValue(leaf) ?? [])];
    for (const algorithm of new Set(names)) {
        report(scope, node, { algorithm, hmac: finding.hmac });
    }
}
function checkPackage(scope, node) {
    const source = packageSource(node);
    if (isWeakPackage(source)) {
        scope.context.report({ node, messageId: 'weakPackage', data: { name: source } });
    }
    const hmacAlgorithm = hmacPackageAlgorithm(source);
    if (hmacAlgorithm !== undefined) {
        report(scope, node, { algorithm: hmacAlgorithm, hmac: true });
    }
}
function checkNamedImports(scope, node) {
    const weak = weakNamedImports(node.source.value);
    if (weak === undefined) {
        return;
    }
    for (const specifier of node.specifiers) {
        const imported = importedName(specifier);
        const [variable] = scope.context.sourceCode.getDeclaredVariables(specifier);
        const uses = variable?.references ?? [];
        const hmac = uses.length > 0 &&
            uses.every((use) => use.identifier.type === AST_NODE_TYPES.Identifier && isHmacArgument(use.identifier));
        if (imported === undefined || !weak.has(imported)) {
            continue;
        }
        if (hmac) {
            const algorithm = imported.replace(/^create/u, '').toLowerCase();
            report(scope, specifier, { algorithm, hmac: true });
        }
        else {
            const name = `${imported} from ${node.source.value}`;
            scope.context.report({ node: specifier, messageId: 'weakPackage', data: { name } });
        }
    }
}
function isCryptoJsHmacKey(node) {
    const call = node.parent;
    if (call.type !== AST_NODE_TYPES.CallExpression) {
        return false;
    }
    const callee = unwrapped(call.callee);
    const owner = callee.type === AST_NODE_TYPES.MemberExpression ? unwrapped(callee.object) : undefined;
    return (call.arguments.includes(node) &&
        owner?.type === AST_NODE_TYPES.MemberExpression &&
        memberName(owner) === 'HMAC');
}
function checkCryptoJsAlgo(scope, node) {
    const algorithm = memberName(node);
    const owner = unwrapped(node.object);
    const isAlgo = algorithm !== undefined &&
        CRYPTO_JS_WEAK.has(algorithm) &&
        owner.type === AST_NODE_TYPES.MemberExpression &&
        memberName(owner) === 'algo' &&
        isModuleValue(scope.context, owner.object, scope.cryptoJs);
    if (isAlgo) {
        report(scope, node, { algorithm, hmac: isCryptoJsHmacKey(node) });
    }
}
function checkProperty(scope, node) {
    if (isHashProperty(node) && node.value !== null && !isCheckedArgument(scope, node)) {
        const hmac = isHmacOptions(node.parent);
        for (const algorithm of new Set(weakLeaves(scope.context, node.value).flatMap((leaf) => stringValue(leaf) ?? []))) {
            report(scope, node, { algorithm, hmac });
        }
    }
}
export const rule = {
    meta: {
        type: 'problem',
        docs: { description: 'Disallow MD5 and SHA-1 hashing' },
        schema: [],
        messages: {
            weakHash: '{{algorithm}} is a broken hash: collisions are cheap and brute force is fast. Hash with `createHash("sha256")` (or sha384, sha512, sha3-256), sign with `createHmac("sha256", key)`, and hash passwords with `scrypt` from node:crypto, argon2 or bcrypt. An exception fits only when a protocol you do not control requires it (a legacy signature header, an ETag, a git object id).',
            weakHmac: 'HMAC with {{algorithm}} rests on MD5, which is broken and no longer approved for message authentication. Sign with `createHmac("sha256", key)`; HMAC-SHA1 is accepted where a protocol fixes it (TOTP, OAuth 1.0a). An exception fits only when a protocol you do not control requires HMAC-MD5.',
            weakPackage: '`{{name}}` only computes MD5 or SHA-1, which are broken hashes. Use `createHash("sha256")` from node:crypto (or sha384, sha512, sha3-256), and hash passwords with `scrypt`, argon2 or bcrypt. An exception fits only when a protocol you do not control requires it.',
        },
    },
    create(context) {
        const { ast } = context.sourceCode;
        const scope = {
            context,
            crypto: bindingsOf(ast, CRYPTO_MODULES),
            cryptoJs: bindingsOf(ast, CRYPTO_JS),
        };
        return {
            ImportDeclaration(node) {
                checkPackage(scope, node);
                checkNamedImports(scope, node);
            },
            CallExpression(node) {
                checkPackage(scope, node);
                const finding = callFinding(scope, node);
                if (finding !== undefined) {
                    reportFinding(scope, node, finding);
                }
            },
            MemberExpression(node) {
                checkCryptoJsAlgo(scope, node);
            },
            Property(node) {
                checkProperty(scope, node);
            },
            PropertyDefinition(node) {
                checkProperty(scope, node);
            },
        };
    },
};
