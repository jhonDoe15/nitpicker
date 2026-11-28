use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::{Node, Value};

const RULE: &str = "no-external-executables-in-unit-tests";
const MESSAGE: &str = "Tests requiring external executables belong in the integration project.";
const SUBPROCESS_MODULES: [&str; 4] = ["child_process", "node:child_process", "execa", "cross-spawn"];

/// `literalValue`: the value of a literal node when it is a string.
fn literal_string(node: Option<Node>) -> Option<String> {
    let node = node.filter(|node| node.is("Literal"))?;
    match node.get("value") {
        value @ Value::Text(..) => node.view.text(value).map(|text| text.into_owned()),
        _ => None,
    }
}

fn is_subprocess(value: Option<String>) -> bool {
    value.is_some_and(|value| SUBPROCESS_MODULES.contains(&value.as_str()))
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let mut found = Vec::new();
    for node in view.nodes() {
        let (source, reported) = match node.kind() {
            "ImportDeclaration" if node.text("importKind").as_deref() != Some("type") => (node.node("source"), true),
            "ImportExpression" => (node.node("source"), true),
            "CallExpression" => {
                let callee = node.node("callee").filter(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("require"));
                (callee.and_then(|_| node.list("arguments").first().copied().flatten()), callee.is_some())
            }
            _ => (None, false),
        };
        if reported && is_subprocess(literal_string(source)) {
            found.push((node.start(), node.end()));
        }
    }
    for (start, end) in found {
        context.report_range(RULE, start, Some(end), MESSAGE.to_string());
    }
}
