//! FindSecBugs' crypto detectors that look at one call, constructor or class: WeakMessageDigestDetector,
//! CipherWithNoIntegrityDetector, DesUsageDetector, RsaNoPaddingDetector (`algorithms`, with the strings of
//! `values` and `summary`), CustomMessageDigestDetector, NullCipherDetector, HazelcastSymmetricEncryptionDetector,
//! EsapiEncryptorDetector (`shapes`), BadHexadecimalConversionDetector (`hex`), and RsaKeySizeDetector,
//! BlowfishKeySizeDetector and StaticIvDetector (`material`). TDesUsageDetector only reports
//! at priority 3. A call is on the line of its `(`; findings with the same pattern and message on one line of a
//! method are one.
pub mod algorithms;
mod hex;
mod material;
mod shapes;
pub mod summary;
mod values;

use super::idioms::{Compiled, compiled};
use super::taint::lines::line as invoke_line;
use super::{Context, place};
use algorithms::Use;
use crate::engine::finding::Finding;
use summary::{Fields, Waiting};
use tree_sitter::Node;
use values::{Held, held};

pub const PATTERNS: &[&str] = &[
    algorithms::INTEGRITY,
    algorithms::ECB,
    algorithms::ORACLE,
    algorithms::DES,
    algorithms::RSA,
    algorithms::MD5,
    algorithms::SHA1,
    shapes::CUSTOM,
    shapes::NULL,
    shapes::HAZELCAST,
    shapes::ESAPI,
    hex::BAD_HEXA,
    material::RSA_SIZE,
    material::BLOWFISH_SIZE,
    material::STATIC_IV,
];

const MARKS: &[&str] = &["getInstance", "DigestUtils", "toHexString", "NullCipher", "SymmetricEncryptionConfig", "Encryptor", "MessageDigest", "IvParameterSpec"];
const CALLS: &[&str] = &["method_invocation", "object_creation_expression", "explicit_constructor_invocation"];
const CODEC: &str = "org.apache.commons.codec.digest.DigestUtils";

/// The algorithm name use of a call, and the argument or fixed name that gives the name.
fn algorithm<'t>(context: &Context, own: &str, node: Node<'t>) -> Option<(Use, Result<Node<'t>, &'static str>)> {
    if let Some((used, value)) = super::tls::values::configured(context, own, node) {
        return Some((used, Ok(value)));
    }
    if node.kind() != "method_invocation" {
        return None;
    }
    let name = context.text(node.child_by_field_name("name")?);
    if !matches!(name, "getInstance" | "getDigest") && !name.starts_with("md") && !name.starts_with("sha") && !name.starts_with("getMd") && !name.starts_with("getSha") {
        return None;
    }
    let call = context.resolver.resolve_call(node)?;
    let first = || node.child_by_field_name("arguments").and_then(|arguments| arguments.named_child(0));
    let used = match (call.declaring.as_str(), name) {
        ("java.security.MessageDigest", "getInstance") => Use::Digest,
        ("java.security.Signature", "getInstance") => Use::Signature,
        ("javax.crypto.Cipher", "getInstance") => Use::Cipher,
        ("javax.crypto.KeyGenerator", "getInstance") => Use::KeyGenerator,
        (CODEC, "getDigest") if call.method.parameters.len() == 1 => Use::Digest,
        (CODEC, _) if call.method.is_static => {
            let fixed = match name {
                "md2" | "md2Hex" | "getMd2Digest" => "MD2",
                "md5" | "md5Hex" | "getMd5Digest" => "MD5",
                "sha" | "shaHex" | "getShaDigest" | "sha1" | "sha1Hex" | "getSha1Digest" => "SHA1",
                _ => return None,
            };
            return Some((Use::Digest, Err(fixed)));
        }
        _ => return None,
    };
    Some((used, Ok(first()?)))
}

fn patterns_of(used: Use) -> &'static [&'static str] {
    match used {
        Use::Digest | Use::Signature => &[algorithms::MD5, algorithms::SHA1],
        Use::Cipher | Use::KeyGenerator => &[algorithms::INTEGRITY, algorithms::ECB, algorithms::ORACLE, algorithms::DES, algorithms::RSA],
        Use::Protocol | Use::ReturnsObjects => super::tls::values::patterns_of(used),
    }
}

/// The calls of one method that name an algorithm, line by line.
fn calls<'a>(context: &Context<'a>, own: &str, method: &Compiled<'a>, fields: &Fields) {
    let mut lines: Vec<(usize, Node<'a>, Vec<(Use, Held)>)> = Vec::new();
    for node in method.nodes.iter().copied().filter(|node| CALLS.contains(&node.kind())) {
        let Some((used, given)) = algorithm(context, own, node) else { continue };
        let value = match given {
            Ok(argument) => held(context, argument),
            Err(fixed) => Held::Text(fixed.to_string()),
        };
        let line = invoke_line(context, node);
        match lines.iter_mut().find(|(known, _, _)| *known == line) {
            Some((_, _, calls)) => calls.push((used, value)),
            None => lines.push((line, node, vec![(used, value)])),
        }
    }
    let place = place::function(&method.label);
    for (line, at, calls) in lines {
        let skeletons: Vec<Finding> = calls
            .iter()
            .flat_map(|(used, _)| patterns_of(*used).iter())
            .filter_map(|pattern| context.finding_listed(pattern, at, line, String::new(), place.clone(), Vec::new()))
            .collect();
        let waiting = Waiting { calls, findings: skeletons };
        if waiting.calls.iter().any(|(_, value)| matches!(value, Held::Field(_))) {
            fields.wait(waiting);
            continue;
        }
        for finding in waiting.made(&|_| None) {
            context.push(finding);
        }
    }
}

pub fn crypto<'a>(context: &Context<'a>, declared: &[Node<'a>], fields: &Fields) {
    if !context.wants(PATTERNS) && !context.wants(super::tls::values::PATTERNS) {
        return;
    }
    fields.note(context);
    if !MARKS.iter().chain(super::tls::values::MARKS).any(|mark| context.file.text.contains(mark)) {
        return;
    }
    for class in declared.iter().copied() {
        let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { continue };
        let methods = compiled(context, &own, class);
        let body = class.child_by_field_name("body").or_else(|| crate::engine::source::children(class).into_iter().find(|part| part.kind() == "class_body"));
        let members = body.map(place::members).unwrap_or_default();
        for method in &methods {
            calls(context, &own, method, fields);
        }
        shapes::check(context, &own, class, &members, &methods);
        hex::check(context, &own, class, &methods);
        material::check(context, &own, class, &methods);
    }
}
