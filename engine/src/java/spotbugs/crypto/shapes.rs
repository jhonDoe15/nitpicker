//! FindSecBugs crypto detectors that need no value, measured on test code, each priority 2 and once per method,
//! line and message:
//! - CUSTOM_MESSAGE_DIGEST: a class, abstract, local or anonymous, whose direct superclass is
//!   `java.security.MessageDigest`, on the first line of the class (an anonymous class on the line of its body);
//! - NULL_CIPHER and HAZELCAST_SYMMETRIC_ENCRYPTION: each call of the constructor of `javax.crypto.NullCipher` or
//!   Hazelcast's `SymmetricEncryptionConfig`: `new`, the constructor of an anonymous class, and the constructors of
//!   a named class that extends one directly;
//! - ESAPI_ENCRYPTOR: `encrypt` or `decrypt` called on a value whose written type is ESAPI's `Encryptor` itself.
use super::super::classes::lines::class_first;
use super::super::idioms::Compiled;
use super::super::idioms::encoding::written_owner;
use super::super::statements::random::super_calls;
use super::super::taint::lines::line as invoke_line;
use super::super::{Context, names, place};
use crate::engine::source::children;
use tree_sitter::Node;

pub const CUSTOM: &str = "CUSTOM_MESSAGE_DIGEST";
pub const NULL: &str = "NULL_CIPHER";
pub const HAZELCAST: &str = "HAZELCAST_SYMMETRIC_ENCRYPTION";
pub const ESAPI: &str = "ESAPI_ENCRYPTOR";

const DIGEST: &str = "java.security.MessageDigest";
const ENCRYPTOR: &str = "org.owasp.esapi.Encryptor";
const BUILT: &[(&str, &str, &str)] = &[
    ("javax.crypto.NullCipher", NULL, "The use of a NullCipher is typically not desirable"),
    ("com.hazelcast.config.SymmetricEncryptionConfig", HAZELCAST, "The network communication for Hazelcast are configured to use a symmetric cipher"),
];

fn report(context: &Context, pattern: &'static str, at: Node, line: usize, message: &str, label: &str) {
    let place = place::function(label);
    let same = |found: &crate::engine::finding::Finding| found.rule == pattern && found.line == line && found.symbol.as_deref() == Some(place.as_str());
    if context.out.borrow().iter().any(same) {
        return;
    }
    context.report_listed(pattern, at, line, message.to_string(), place, 2, Vec::new());
}

fn built(context: &Context, creation: Node) -> Option<&'static (&'static str, &'static str, &'static str)> {
    let made = creation.child_by_field_name("type").and_then(|written| context.resolver.type_node(written))?;
    BUILT.iter().find(|(class, _, _)| made.name() == *class)
}

fn custom(context: &Context, own: &str, class: Node, members: &[Node]) {
    let (extended, anonymous) = match class.kind() {
        "class_declaration" => (class.child_by_field_name("superclass").and_then(|written| written.named_child(0)), None),
        "object_creation_expression" => (class.child_by_field_name("type"), children(class).into_iter().find(|part| part.kind() == "class_body")),
        _ => return,
    };
    if extended.and_then(|written| context.resolver.type_node(written)).is_none_or(|kind| kind.name() != DIGEST) {
        return;
    }
    let binary = names::binary(context, own);
    let line = anonymous.map(|body| context.line(body)).or_else(|| class_first(context, own, class, members)).unwrap_or(0);
    let message = format!("{binary} is a custom cryptographic hash function implementation");
    context.report_listed(CUSTOM, class, line, message, format!("type:{binary}"), 2, vec![binary.clone()]);
}

pub fn check<'a>(context: &Context<'a>, own: &str, class: Node<'a>, members: &[Node<'a>], methods: &[Compiled<'a>]) {
    custom(context, own, class, members);
    for (superclass, pattern, message) in BUILT {
        for (at, label) in super_calls(context, class, superclass) {
            report(context, pattern, at, context.line(at), message, &label);
        }
    }
    for method in methods {
        for node in method.nodes.iter().copied() {
            match node.kind() {
                "object_creation_expression" => {
                    let Some((_, pattern, message)) = built(context, node) else { continue };
                    let anonymous = children(node).iter().any(|part| part.kind() == "class_body");
                    match context.resolver.scope.names.get(&node.id()).filter(|_| anonymous) {
                        Some(made) => report(context, pattern, node, invoke_line(context, node), message, &names::anonymous(context, made, node)),
                        None => report(context, pattern, node, invoke_line(context, node), message, &method.label),
                    }
                }
                "method_invocation" => {
                    let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
                    if matches!(name, "encrypt" | "decrypt") && node.child_by_field_name("object").is_some() && written_owner(context, own, node).as_deref() == Some(ENCRYPTOR) {
                        report(context, ESAPI, node, invoke_line(context, node), "The ESAPI encryptor API is used to encrypt data", &method.label);
                    }
                }
                _ => {}
            }
        }
    }
}
