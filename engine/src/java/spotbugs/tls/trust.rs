//! WeakTrustManagerDetector, measured on test code: in a class or interface that is an `X509TrustManager`
//! (directly, through a superclass or a subinterface), each `checkClientTrusted`, `checkServerTrusted` and
//! `getAcceptedIssuers` with a body that makes no call and reads no instance field is WEAK_TRUST_MANAGER; in a
//! `HostnameVerifier`, each such `verify` is WEAK_HOSTNAME_VERIFIER. The name decides, whatever the parameters.
//! Both are priority 2, on the line of the method's first instruction. A lambda is not a class, so it never counts.
use super::super::classes::lines::method_start;
use super::super::idioms::Compiled;
use super::super::{Context, place};
use super::trivial::busy;
use tree_sitter::Node;

pub const MANAGER: &str = "WEAK_TRUST_MANAGER";
pub const VERIFIER: &str = "WEAK_HOSTNAME_VERIFIER";

const KINDS: &[(&str, &str, &[&str], &str)] = &[
    (
        "javax.net.ssl.X509TrustManager",
        MANAGER,
        &["checkClientTrusted", "checkServerTrusted", "getAcceptedIssuers"],
        "TrustManager that accept any certificates makes communication vulnerable to a MITM attack",
    ),
    (
        "javax.net.ssl.HostnameVerifier",
        VERIFIER,
        &["verify"],
        "HostnameVerifier that accept any signed certificates makes communication vulnerable to a MITM attack",
    ),
];

pub fn check(context: &Context, own: &str, class: Node, methods: &[Compiled]) {
    let nested = class.kind() == "object_creation_expression" || crate::java::javac::declared_locally(class);
    for (interface, pattern, names, message) in KINDS {
        if !context.resolver.index.is_subtype(own, interface) {
            continue;
        }
        for method in methods.iter().filter(|method| !method.lambda && method.member.kind() == "method_declaration") {
            let named = method.member.child_by_field_name("name").is_some_and(|name| names.contains(&context.text(name)));
            if !named || busy(context, method.member, nested) {
                continue;
            }
            let Some(line) = method_start(context, method.member) else { continue };
            context.report_listed(pattern, method.member, line, message.to_string(), place::function(&method.label), 2, Vec::new());
        }
    }
}
