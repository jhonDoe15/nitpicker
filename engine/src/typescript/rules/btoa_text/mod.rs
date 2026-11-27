//! `no-btoa-on-runtime-text`: `btoa` called on text that can hold characters above U+00FF, which makes it throw.
//! Run without type information, the value kinds of `value-kinds.mts` are never known.
use crate::typescript::rules::Context;
use crate::typescript::rules::escaping::is_js_word;
use crate::typescript::rules::security_values::leaves::write_exprs;
use crate::typescript::rules::security_values::{member_name, resolve_constant, unwrapped, variable_of};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_quality::test_calls::resolve_function;
use crate::typescript::rules::urls::values::{source, string_value};
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-btoa-on-runtime-text";
const MESSAGE: &str = "`btoa` throws for any character above U+00FF, so a name, password or JSON with an accented letter, emoji or CJK text fails. Encode to UTF-8 bytes first: `Buffer.from(text, \"utf8\").toString(\"base64\")` or `new TextEncoder().encode(text)` with a bytes-to-base64 step.";
const GLOBAL_OBJECTS: [&str; 3] = ["window", "globalThis", "self"];
const MAX_WRITE_DEPTH: usize = 3;
const BYTE_WORDS: [&str; 8] = ["binary", "byte", "bytes", "latin", "latin1", "ascii", "hex", "digest"];
const BYTE_WORDS_MORE: [&str; 3] = ["buffer", "chunk", "raw"];

static BYTE_PLAIN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)fromCharCode|fromCodePoint|encodeURI|latin1|binary|ascii").expect("pattern"));
static ESCAPE_CALL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)escape\(").expect("pattern"));
static HEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)hex").expect("pattern"));

fn word_before(text: &str, at: usize) -> bool {
    text[..at].chars().next_back().is_some_and(|character| is_js_word(character as u32))
}

fn word_after(text: &str, at: usize) -> bool {
    text[at..].chars().next().is_some_and(|character| is_js_word(character as u32))
}

/// `BYTE_TEXT`, `/fromCharCode|fromCodePoint|encodeURI|\bescape\(|latin1|binary|ascii|hex\b/iu`, with `\b` as
/// JavaScript draws it under `u` and `i`.
fn is_byte_text(text: &str) -> bool {
    BYTE_PLAIN.is_match(text)
        || ESCAPE_CALL.find_iter(text).any(|found| !word_before(text, found.start()))
        || HEX.find_iter(text).any(|found| !word_after(text, found.end()))
}

fn is_global_btoa(scopes: &Scopes, call: Node) -> bool {
    let Some(callee) = call.node("callee").map(unwrapped) else { return false };
    if callee.is("Identifier") {
        return callee.name().as_deref() == Some("btoa") && variable_of(scopes, callee).is_none_or(|variable| scopes.defs(variable).is_empty());
    }
    let object = callee.node("object").filter(|object| callee.is("MemberExpression") && object.is("Identifier"));
    object.is_some_and(|object| object.name().is_some_and(|name| GLOBAL_OBJECTS.contains(&name.as_ref())))
        && member_name(callee).as_deref() == Some("btoa")
}

/// Splits a name before each ASCII capital and at each `_`, as `split(/(?=[A-Z])|_/u)` does.
fn name_words(name: &str) -> Vec<String> {
    let mut words = vec![String::new()];
    for (index, character) in name.chars().enumerate() {
        if character == '_' {
            words.push(String::new());
            continue;
        }
        if character.is_ascii_uppercase() && index > 0 {
            words.push(String::new());
        }
        if let Some(word) = words.last_mut() {
            word.push(character);
        }
    }
    words.iter().map(|word| word.to_lowercase()).collect()
}

fn is_byte_name(name: &str) -> bool {
    let words = name_words(name);
    words.iter().any(|word| BYTE_WORDS.contains(&word.as_str())) || (words.len() == 1 && BYTE_WORDS_MORE.contains(&name.to_lowercase().as_str()))
}

struct Check<'c, 'a, 's> {
    scopes: &'c Scopes<'a, 's>,
    text: &'c str,
}

impl<'s> Check<'_, '_, 's> {
    fn pushed_byte_text(&self, call: Node<'s>) -> bool {
        let Some(callee) = call.node("callee").map(unwrapped) else { return false };
        if !callee.is("MemberExpression") || member_name(callee).as_deref() != Some("join") {
            return false;
        }
        let Some(owner) = callee.node("object").map(unwrapped).filter(|owner| owner.is("Identifier")) else { return false };
        let Some(variable) = variable_of(self.scopes, owner) else { return false };
        self.scopes.references(variable).into_iter().any(|reference| {
            let Some(member) = reference.identifier.parent() else { return false };
            let pushed = member.parent();
            member.is("MemberExpression")
                && member_name(member).as_deref() == Some("push")
                && pushed.is_some_and(|pushed| pushed.is("CallExpression") && is_byte_text(source(self.text, pushed)))
        })
    }

    fn is_local_byte_call(&self, node: Node<'s>) -> bool {
        let callee = node.node("callee").filter(|_| node.is("CallExpression")).map(unwrapped);
        let target = callee.and_then(|callee| resolve_function(self.scopes, Some(callee)));
        target.is_some_and(|target| is_byte_text(source(self.text, target)))
    }

    fn is_direct_byte_text(&self, node: Node<'s>) -> bool {
        is_byte_text(source(self.text, node))
            || (node.is("CallExpression") && self.pushed_byte_text(node))
            || self.is_local_byte_call(node)
            || (node.is("MemberExpression") && member_name(node).as_deref() == Some("length"))
    }

    fn is_byte_value(&self, node: Node<'s>) -> bool {
        let mut pending = vec![(node, 0)];
        let mut at = 0;
        while at < pending.len() {
            let (current, depth) = pending[at];
            at += 1;
            if self.is_direct_byte_text(current) {
                return true;
            }
            let expands = current.is("Identifier") && depth < MAX_WRITE_DEPTH;
            if !expands {
                continue;
            }
            if current.name().is_some_and(|name| is_byte_name(&name)) {
                return true;
            }
            pending.extend(write_exprs(self.scopes, current).into_iter().map(|value| (value, depth + 1)));
        }
        false
    }

    fn is_constant_text(&self, node: Node<'s>) -> bool {
        let resolved = resolve_constant(self.scopes, Some(node));
        string_value(resolved).is_some() || resolved.is_some_and(|resolved| resolved.is("Literal") && matches!(resolved.get("value"), Value::Number(..)))
    }

    fn is_safe_text(&self, node: Node<'s>) -> bool {
        let mut pending = vec![node];
        let mut at = 0;
        while at < pending.len() {
            let plain = unwrapped(pending[at]);
            at += 1;
            let concatenation = plain.is("BinaryExpression") && plain.text("operator").as_deref() == Some("+");
            if plain.is("AwaitExpression") {
                pending.extend(plain.node("argument"));
            } else if plain.is("TemplateLiteral") {
                pending.extend(plain.nodes("expressions"));
            } else if concatenation {
                pending.extend(plain.node("left").into_iter().chain(plain.node("right")));
            } else if !(self.is_constant_text(plain) || self.is_byte_value(plain)) {
                return false;
            }
        }
        true
    }
}

fn is_caught(node: Node) -> bool {
    let mut child = node;
    for parent in node.ancestors() {
        if parent.is("TryStatement") && parent.get("handler") != Value::Null && parent.node("block") == Some(child) {
            return true;
        }
        child = parent;
    }
    false
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let state = Check { scopes, text: context.file.text };
    let found: Vec<Node> = view
        .nodes()
        .filter(|node| node.is("CallExpression"))
        .filter(|node| {
            let argument = node.list("arguments").first().copied().flatten();
            argument.is_some_and(|argument| {
                !argument.is("SpreadElement") && is_global_btoa(scopes, *node) && !is_caught(*node) && !state.is_safe_text(argument)
            })
        })
        .collect();
    for node in found {
        context.report_range(RULE, node.start(), Some(node.end()), MESSAGE.to_string());
    }
}
