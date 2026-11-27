//! `no-hardcoded-secret`: a secret written into the source, as the value of a name that names a secret or as a
//! string shaped like a credential.
use super::nodes::{env_key, literal_parts, member_name, string_key};
use super::words::{has_credential_shape, is_hardcoded_secret, is_secret_name};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::urls::values::quasi_text;

const RULE: &str = "no-hardcoded-secret";
const CREDENTIAL: &str = "Read it from the environment or a secrets manager: this string looks like a credential (access key, token, private key, or a password in a URL).";
const ASSIGNMENTS: [&str; 3] = ["=", "||=", "??="];
const FALLBACKS: [&str; 2] = ["||", "??"];

fn hardcoded(name: &str) -> String {
    format!("Read `{name}` from the environment or a secrets manager and inject it: this value is a hardcoded secret.")
}

fn property_key(node: Node) -> Option<String> {
    let key = node.node("key")?;
    if !node.flag("computed") && key.is("Identifier") {
        return key.name().map(|name| name.into_owned());
    }
    string_key(key)
}

fn binding_name(target: Node) -> Option<String> {
    match target.kind() {
        "Identifier" => target.name().map(|name| name.into_owned()),
        "MemberExpression" => member_name(target),
        _ => None,
    }
}

fn named_value(node: Node) -> Option<(Option<String>, Option<Node>)> {
    let operator = node.text("operator");
    let found = match node.kind() {
        "VariableDeclarator" => (node.node("id").and_then(binding_name), node.node("init")),
        "AssignmentPattern" => (node.node("left").and_then(binding_name), node.node("right")),
        "PropertyDefinition" => (property_key(node), node.node("value")),
        "Property" if node.parent().is_some_and(|parent| parent.is("ObjectExpression")) => (property_key(node), node.node("value")),
        "AssignmentExpression" if operator.as_deref().is_some_and(|operator| ASSIGNMENTS.contains(&operator)) => {
            (node.node("left").and_then(binding_name), node.node("right"))
        }
        "LogicalExpression" if operator.as_deref().is_some_and(|operator| FALLBACKS.contains(&operator)) => {
            (node.node("left").and_then(env_key), node.node("right"))
        }
        _ => return None,
    };
    Some(found)
}

fn credential_text(node: Node) -> Option<String> {
    match node.kind() {
        "Literal" if matches!(node.get("value"), Value::Text(..)) => string_key(node),
        "TemplateElement" => {
            let template = node.parent()?;
            let index = template.list("quasis").iter().position(|quasi| *quasi == Some(node))?;
            Some(quasi_text(template, index))
        }
        _ => None,
    }
}

struct Reports<'v> {
    reported: Vec<Node<'v>>,
    found: Vec<(u32, u32, String)>,
}

impl<'v> Reports<'v> {
    fn report(&mut self, node: Node<'v>, message: String) {
        if !self.reported.contains(&node) {
            self.reported.push(node);
            self.found.push((node.start(), node.end(), message));
        }
    }
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let mut reports = Reports { reported: Vec::new(), found: Vec::new() };
    for node in view.nodes() {
        if let Some((Some(name), Some(value))) = named_value(node) {
            if is_secret_name(&name) {
                for part in literal_parts(value).into_iter().filter(|part| is_hardcoded_secret(&part.text, &name)) {
                    reports.report(part.node, hardcoded(&name));
                }
            }
        }
        if credential_text(node).is_some_and(|text| has_credential_shape(&text)) {
            reports.report(node, CREDENTIAL.to_string());
        }
    }
    for (start, end, message) in reports.found {
        context.report_range(RULE, start, Some(end), message);
    }
}
