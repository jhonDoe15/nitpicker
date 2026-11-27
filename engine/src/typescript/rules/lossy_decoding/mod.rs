//! `no-lossy-utf8-decode`: bytes decoded to text with silent replacement where the text is then parsed, compared
//! or written back.
mod sources;

use self::sources::{Origin, Source, plain_name};
use crate::typescript::rules::Context;
use crate::typescript::rules::http_values::origins::counted_write;
use crate::typescript::rules::security_values::{defs, resolve_constant, unwrapped, variable_of};
use crate::typescript::rules::security_values::leaves::{caught_declarations, declared_writes};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::{source, string_value};
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-lossy-utf8-decode";
const DECODER: &str = "`new TextDecoder()` without `fatal: true` replaces invalid UTF-8 with U+FFFD, so this text is parsed, compared or written from corrupted data with no error. Use `new TextDecoder('utf-8', { fatal: true })`.";
const FILE: &str = "This file is read as `utf8` and written back to the same path, so invalid UTF-8 becomes U+FFFD and bytes are lost. Decode the `Buffer` with `new TextDecoder('utf-8', { fatal: true })`.";
const WRITES: [&str; 4] = ["writeFile", "writeFileSync", "appendFile", "appendFileSync"];
const EQUALITY: [&str; 4] = ["===", "!==", "==", "!="];
const PASS_THROUGH: [&str; 6] =
    ["AwaitExpression", "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression", "ChainExpression", "TemplateLiteral"];

static HASH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)hash").expect("pattern"));

enum Outcome {
    Done(bool),
    Continue,
}

struct Flow<'c, 'a, 's> {
    scopes: &'c Scopes<'a, 's>,
    text: &'c str,
    source: Source,
}

/// The writes ESLint gives a catch parameter from the `var` declarations of its name in the clause's body.
fn caught_writes(scopes: &Scopes, id: Node) -> usize {
    let name = id.name().unwrap_or_default();
    let clauses = defs(scopes, id).into_iter().filter(|definition| definition.kind == DefKind::CatchClause && definition.node.node("param") == Some(definition.name));
    clauses.flat_map(|definition| caught_declarations(definition.node, &name)).map(|declared| declared_writes(declared).len()).sum()
}

fn uses<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>) -> Vec<Node<'s>> {
    let mut top = call;
    while let Some(parent) = top.parent().filter(|parent| PASS_THROUGH.contains(&parent.kind())) {
        top = parent;
    }
    let Some(declarator) = top.parent().filter(|declarator| declarator.is("VariableDeclarator") && declarator.node("init") == Some(top)) else {
        return vec![call];
    };
    let Some(id) = declarator.node("id").filter(|id| id.is("Identifier")) else { return Vec::new() };
    let Some(variable) = variable_of(scopes, id) else { return Vec::new() };
    let names: Vec<Node> = defs(scopes, id).iter().map(|definition| definition.name).collect();
    let references = scopes.references(variable);
    let counted = references.iter().filter(|reference| counted_write(reference.identifier, reference.write, names.contains(&reference.identifier))).count();
    let writes = counted + caught_writes(scopes, id);
    if writes != 1 {
        return Vec::new();
    }
    references.into_iter().filter(|reference| reference.read).map(|reference| reference.identifier).collect()
}

impl<'s> Flow<'_, '_, 's> {
    fn is_sink_call(&self, call: Node<'s>, carried: Node<'s>) -> bool {
        let name = plain_name(call.node("callee"));
        let callee = call.node("callee").map(unwrapped);
        let arguments = call.nodes("arguments");
        let second = arguments.get(1) == Some(&carried);
        if let Source::File(path) = &self.source {
            return WRITES.contains(&name.as_str()) && second && arguments.first().is_some_and(|first| source(self.text, *first) == path);
        }
        if WRITES.contains(&name.as_str()) {
            return second;
        }
        let owner = callee.filter(|callee| callee.is("MemberExpression")).and_then(|callee| callee.node("object"));
        if name == "parse" {
            return owner.is_some_and(|owner| source(self.text, owner) == "JSON");
        }
        name == "update" && owner.is_some_and(|owner| HASH.is_match(source(self.text, owner)))
    }

    fn is_constant_side(&self, node: Node<'s>) -> bool {
        string_value(resolve_constant(self.scopes, Some(node))).is_some()
    }

    fn sink_outcome(&self, parent: Node<'s>, current: Node<'s>) -> Outcome {
        if parent.is("CallExpression") && parent.nodes("arguments").contains(&current) {
            if self.is_sink_call(parent, current) {
                return Outcome::Done(true);
            }
            return if matches!(self.source, Source::File(_)) { Outcome::Continue } else { Outcome::Done(false) };
        }
        if parent.is("BinaryExpression") && EQUALITY.contains(&parent.text("operator").unwrap_or_default().as_ref()) {
            let other = if parent.node("left") == Some(current) { parent.node("right") } else { parent.node("left") };
            return Outcome::Done(self.source == Source::Decoder && !other.is_some_and(|other| self.is_constant_side(other)));
        }
        Outcome::Done(false)
    }

    fn reaches_sink(&self, start: Node<'s>) -> bool {
        let mut current = start;
        loop {
            let Some(parent) = current.parent() else { return false };
            let carried = carry_through(parent, current);
            if carried.is_none() && let Outcome::Done(answer) = self.sink_outcome(parent, current) {
                return answer;
            }
            current = carried.unwrap_or(parent);
        }
    }
}

fn carry_through<'s>(parent: Node<'s>, current: Node<'s>) -> Option<Node<'s>> {
    let concatenation = parent.is("BinaryExpression") && parent.text("operator").as_deref() == Some("+");
    if PASS_THROUGH.contains(&parent.kind()) || concatenation {
        return Some(parent);
    }
    let call = parent.parent().filter(|call| call.is("CallExpression") && call.node("callee") == Some(parent));
    let receiver = parent.is("MemberExpression") && parent.node("object") == Some(current);
    if receiver { call } else { None }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let origin = Origin { text: context.file.text, filename: context.file.path };
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("CallExpression")) {
        let Some(source) = origin.decoded_source(scopes, node) else { continue };
        let flow = Flow { scopes, text: context.file.text, source };
        if uses(scopes, node).into_iter().any(|use_| flow.reaches_sink(use_)) {
            found.push((node, flow.source));
        }
    }
    for (node, source) in found {
        let message = if source == Source::Decoder { DECODER } else { FILE };
        context.report_range(RULE, node.start(), Some(node.end()), message.to_string());
    }
}
