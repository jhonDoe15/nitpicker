//! `no-weak-hash`: MD5, SHA-1 and the other broken digests, by name, through the packages that compute only them,
//! and as HMAC over MD5.
mod calls;
mod sources;

use self::calls::{CRYPTO_JS_WEAK, Finding, Scope, is_hash_property, weak_leaves};
use self::sources::{
    hmac_package_algorithm, is_hmac_argument, is_hmac_options, is_message_digest, is_weak_package, package_source, weak_named_imports,
};
use crate::typescript::rules::Context;
use crate::typescript::rules::module_values::{bindings_of, is_module_value};
use crate::typescript::rules::security_values::{member_name, unwrapped};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::string_value;

const RULE: &str = "no-weak-hash";
const CRYPTO_MODULES: &[&str] = &["crypto", "node:crypto", "create-hash", "crypto-browserify"];
const CRYPTO_JS: &[&str] = &["crypto-js"];

fn weak_hash(algorithm: &str) -> String {
    format!("{algorithm} is a broken hash: collisions are cheap and brute force is fast. Hash with `createHash(\"sha256\")` (or sha384, sha512, sha3-256), sign with `createHmac(\"sha256\", key)`, and hash passwords with `scrypt` from node:crypto, argon2 or bcrypt. An exception fits only when a protocol you do not control requires it (a legacy signature header, an ETag, a git object id).")
}

fn weak_hmac(algorithm: &str) -> String {
    format!("HMAC with {algorithm} rests on MD5, which is broken and no longer approved for message authentication. Sign with `createHmac(\"sha256\", key)`; HMAC-SHA1 is accepted where a protocol fixes it (TOTP, OAuth 1.0a). An exception fits only when a protocol you do not control requires HMAC-MD5.")
}

fn weak_package(name: &str) -> String {
    format!("`{name}` only computes MD5 or SHA-1, which are broken hashes. Use `createHash(\"sha256\")` from node:crypto (or sha384, sha512, sha3-256), and hash passwords with `scrypt`, argon2 or bcrypt. An exception fits only when a protocol you do not control requires it.")
}

type Found = Vec<(u32, u32, String)>;

fn report(found: &mut Found, node: Node, algorithm: &str, hmac: bool) {
    if hmac && !is_message_digest(algorithm) {
        return;
    }
    let message = if hmac { weak_hmac(algorithm) } else { weak_hash(algorithm) };
    found.push((node.start(), node.end(), message));
}

fn push_unique(names: &mut Vec<String>, name: String) {
    if !names.contains(&name) {
        names.push(name);
    }
}

impl<'s> Scope<'_, '_, 's> {
    fn reported_at_property(&self, leaf: Node<'s>) -> bool {
        let Some(owner) = leaf.parent().filter(|owner| owner.is("Property") || owner.is("PropertyDefinition")) else { return false };
        owner.node("value") == Some(leaf) && is_hash_property(owner) && !self.is_checked_argument(owner)
    }

    fn report_finding(&self, found: &mut Found, node: Node<'s>, finding: Finding<'s>) {
        let mut names = Vec::new();
        for name in finding.names {
            push_unique(&mut names, name);
        }
        for leaf in finding.leaves.into_iter().filter(|leaf| !self.reported_at_property(*leaf)) {
            if let Some(text) = string_value(Some(leaf)) {
                push_unique(&mut names, text);
            }
        }
        for algorithm in names {
            report(found, node, &algorithm, finding.hmac);
        }
    }

    fn check_package(&self, found: &mut Found, node: Node<'s>) {
        let source = package_source(node);
        if is_weak_package(source.as_deref()) {
            found.push((node.start(), node.end(), weak_package(source.as_deref().unwrap_or_default())));
        }
        if let Some(algorithm) = hmac_package_algorithm(source.as_deref()) {
            report(found, node, algorithm, true);
        }
    }

    fn check_named_imports(&self, found: &mut Found, node: Node<'s>) {
        let source = node.node("source").and_then(|source| source.text("value")).unwrap_or_default();
        let Some(weak) = weak_named_imports(&source) else { return };
        for specifier in node.nodes("specifiers") {
            let imported = specifier.node("imported").filter(|_| specifier.is("ImportSpecifier")).and_then(|imported| {
                if imported.is("Identifier") { imported.name() } else { imported.text("value") }
            });
            let Some(imported) = imported.filter(|imported| weak.contains(&imported.as_ref())) else { continue };
            let variable = specifier.node("local").and_then(|local| self.scopes.variable_named(local));
            let uses = variable.map(|variable| self.scopes.references(variable)).unwrap_or_default();
            let hmac = !uses.is_empty() && uses.iter().all(|reference| reference.identifier.is("Identifier") && is_hmac_argument(reference.identifier));
            if hmac {
                let algorithm = imported.strip_prefix("create").unwrap_or(&imported).to_lowercase();
                report(found, specifier, &algorithm, true);
            } else {
                found.push((specifier.start(), specifier.end(), weak_package(&format!("{imported} from {source}"))));
            }
        }
    }

    fn is_crypto_js_hmac_key(&self, node: Node<'s>) -> bool {
        let Some(call) = node.parent().filter(|call| call.is("CallExpression")) else { return false };
        let callee = call.node("callee").map(unwrapped);
        let owner = callee.filter(|callee| callee.is("MemberExpression")).and_then(|callee| callee.node("object")).map(unwrapped);
        call.list("arguments").contains(&Some(node)) && owner.is_some_and(|owner| owner.is("MemberExpression") && member_name(owner).as_deref() == Some("HMAC"))
    }

    fn check_crypto_js_algo(&self, found: &mut Found, node: Node<'s>) {
        let Some(algorithm) = member_name(node).filter(|algorithm| CRYPTO_JS_WEAK.contains(&algorithm.as_str())) else { return };
        let Some(owner) = node.node("object").map(unwrapped) else { return };
        let algo = owner.is("MemberExpression") && member_name(owner).as_deref() == Some("algo");
        if algo && is_module_value(self.scopes, owner.node("object"), &self.crypto_js) {
            report(found, node, &algorithm, self.is_crypto_js_hmac_key(node));
        }
    }

    fn check_property(&self, found: &mut Found, node: Node<'s>) {
        let Some(value) = node.node("value") else { return };
        if !is_hash_property(node) || self.is_checked_argument(node) {
            return;
        }
        let hmac = is_hmac_options(node.parent());
        let mut names = Vec::new();
        for leaf in weak_leaves(self.scopes, Some(value)) {
            if let Some(text) = string_value(Some(leaf)) {
                push_unique(&mut names, text);
            }
        }
        for algorithm in names {
            report(found, node, &algorithm, hmac);
        }
    }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let program = view.program();
    let scope = Scope { scopes, crypto: bindings_of(program, CRYPTO_MODULES), crypto_js: bindings_of(program, CRYPTO_JS) };
    let mut found = Vec::new();
    for node in view.nodes() {
        match node.kind() {
            "ImportDeclaration" => {
                scope.check_package(&mut found, node);
                scope.check_named_imports(&mut found, node);
            }
            "CallExpression" => {
                scope.check_package(&mut found, node);
                if let Some(finding) = scope.call_finding(node) {
                    scope.report_finding(&mut found, node, finding);
                }
            }
            "MemberExpression" => scope.check_crypto_js_algo(&mut found, node),
            "Property" | "PropertyDefinition" => scope.check_property(&mut found, node),
            _ => {}
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
