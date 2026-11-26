//! `isMainGuard` and `guardedByMain`: an `if` that runs only when the module is the script that was started.
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};

type Check<'a> = &'a dyn Fn(Node) -> bool;

fn is_process_import(def: &crate::typescript::rules::support::scope::Def) -> bool {
    def.kind == DefKind::ImportBinding
        && !def.node.is("ImportSpecifier")
        && def.node.parent().is_some_and(|parent| {
            parent.is("ImportDeclaration")
                && parent.node("source").and_then(|source| source.text("value")).is_some_and(|value| matches!(value.as_ref(), "process" | "node:process"))
        })
}

fn is_global(scopes: &Scopes, node: Option<Node>, name: &str) -> bool {
    let Some(node) = node.filter(|node| node.is("Identifier") && node.name().as_deref() == Some(name)) else { return false };
    let defs = scopes.variable_by_name(name, node.start()).map(|symbol| scopes.defs(symbol)).unwrap_or_default();
    if name == "process" { defs.iter().all(is_process_import) } else { defs.is_empty() }
}

fn is_member(node: Node, property: &str) -> bool {
    node.is("MemberExpression")
        && !node.flag("computed")
        && !node.flag("optional")
        && node.node("property").and_then(|found| found.name()).as_deref() == Some(property)
}

fn is_import_meta(node: Node, property: &str) -> bool {
    is_member(node, property)
        && node.node("object").is_some_and(|object| object.is("MetaProperty") && object.node("meta").and_then(|meta| meta.name()).as_deref() == Some("import"))
}

fn is_script_path(scopes: &Scopes, node: Node) -> bool {
    node.is("MemberExpression")
        && node.flag("computed")
        && !node.flag("optional")
        && node.node("property").is_some_and(|property| property.is("Literal") && property.get("value") == Value::Number(1.0))
        && node.node("object").is_some_and(|object| is_member(object, "argv") && is_global(scopes, object.node("object"), "process"))
}

fn is_helper_call(scopes: &Scopes, node: Node, name: &str, source: &[&str], argument: Check) -> bool {
    let arguments = node.nodes("arguments");
    node.is("CallExpression")
        && !node.flag("optional")
        && arguments.len() == 1
        && is_imported_helper(scopes, node.node("callee"), name, source)
        && arguments.into_iter().all(argument)
}

fn is_imported_helper(scopes: &Scopes, node: Option<Node>, name: &str, sources: &[&str]) -> bool {
    let Some(node) = node.filter(|node| node.is("Identifier") && node.name().as_deref() == Some(name)) else { return false };
    let defs = scopes.variable_by_name(name, node.start()).map(|symbol| scopes.defs(symbol)).unwrap_or_default();
    let [definition] = defs.as_slice() else { return false };
    definition.kind == DefKind::ImportBinding
        && definition.node.is("ImportSpecifier")
        && definition.node.node("imported").and_then(|imported| imported.name()).as_deref() == Some(name)
        && definition.node.parent().is_some_and(|parent| {
            parent.is("ImportDeclaration")
                && parent.node("source").and_then(|source| source.text("value")).is_some_and(|value| sources.contains(&value.as_ref()))
        })
}

fn is_file_path(scopes: &Scopes, node: Node) -> bool {
    is_script_path(scopes, node) || is_helper_call(scopes, node, "realpathSync", &["fs", "node:fs"], &|argument| is_script_path(scopes, argument))
}

fn cooked_pieces(node: Node) -> String {
    let pieces: Vec<String> = node
        .nodes("quasis")
        .into_iter()
        .map(|quasi| match quasi.get("value") {
            Value::Node(index) => quasi.view.at(index).text("cooked").map(|text| text.into_owned()).unwrap_or_default(),
            _ => String::new(),
        })
        .collect();
    pieces.join("|")
}

fn is_script_url(scopes: &Scopes, node: Node) -> bool {
    if is_script_path(scopes, node) {
        return true;
    }
    if is_member(node, "href") {
        let call = node.node("object");
        let argument = |argument: Node| is_file_path(scopes, argument);
        if call.is_some_and(|call| is_helper_call(scopes, call, "pathToFileURL", &["url", "node:url"], &argument)) {
            return true;
        }
    }
    node.is("TemplateLiteral")
        && cooked_pieces(node) == "file://|"
        && node.nodes("expressions").first().is_some_and(|first| is_script_path(scopes, *first))
}

fn is_comparison(test: Node, operators: &[&str], left: Check, right: Check) -> bool {
    let operator = test.text("operator");
    let (Some(a), Some(b)) = (test.node("left"), test.node("right")) else { return false };
    test.is("BinaryExpression")
        && operator.is_some_and(|operator| operators.contains(&operator.as_ref()))
        && ((left(a) && right(b)) || (left(b) && right(a)))
}

fn is_entry_comparison(scopes: &Scopes, test: Node) -> bool {
    const EQUALITY: [&str; 2] = ["===", "=="];
    is_import_meta(test, "main")
        || is_comparison(test, &EQUALITY, &|side| is_import_meta(side, "url"), &|side| is_script_url(scopes, side))
        || is_comparison(
            test,
            &EQUALITY,
            &|side| is_member(side, "main") && is_global(scopes, side.node("object"), "require"),
            &|side| is_global(scopes, Some(side), "module"),
        )
}

fn is_script_path_check(scopes: &Scopes, test: Node) -> bool {
    is_script_path(scopes, test)
        || is_comparison(test, &["!=="], &|side| is_script_path(scopes, side), &|side| is_global(scopes, Some(side), "undefined"))
}

fn operands(root: Node) -> Vec<Node> {
    let mut pending = vec![root];
    let mut found = Vec::new();
    let mut at = 0;
    while at < pending.len() {
        let node = pending[at];
        at += 1;
        let joined = matches!(node.kind(), "LogicalExpression" | "BinaryExpression") && node.text("operator").as_deref() == Some("&&");
        match (joined, node.node("left"), node.node("right")) {
            (true, Some(left), Some(right)) => pending.extend([left, right]),
            _ => found.push(node),
        }
    }
    found
}

pub fn is_main_guard(scopes: &Scopes, statement: Node) -> bool {
    if !statement.is("IfStatement") || statement.node("alternate").is_some() {
        return false;
    }
    let Some(test) = statement.node("test") else { return false };
    let operands = operands(test);
    operands.iter().any(|operand| is_entry_comparison(scopes, *operand))
        && operands.iter().all(|operand| is_entry_comparison(scopes, *operand) || is_script_path_check(scopes, *operand))
}

pub fn guarded_by_main(scopes: &Scopes, statement: Node, node: Node) -> bool {
    is_main_guard(scopes, statement) && statement.node("consequent").is_some_and(|consequent| consequent.contains(node))
}
