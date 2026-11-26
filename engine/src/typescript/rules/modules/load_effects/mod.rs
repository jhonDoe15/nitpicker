//! `report-module-load-effects`: statements that execute observable work while a module is imported.
mod bindings;
mod main_guard;
mod member_definitions;
mod paths;

use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::testing_library::nodes::string_literal;
use bindings::{Bindings, imported_callee_name, module_bindings};
use main_guard::{guarded_by_main, is_main_guard};
use member_definitions::is_member_definition;
use paths::{callee_text, member_path};

const RULE: &str = "report-module-load-effects";
const NOT_STYLESHEET: &str = "not-stylesheet";
const EFFECT_CALLEES: [&str; 10] =
    ["fetch", "setTimeout", "setInterval", "setImmediate", "queueMicrotask", "randomUUID", "randomBytes", "randomInt", "getRandomValues", "addEventListener"];
const GLOBAL_OBJECTS: [&str; 4] = ["globalThis", "window", "self", "crypto"];
const EFFECT_MEMBER_CALLS: [&str; 3] = ["Date.now", "performance.now", "Math.random"];
const EFFECT_CONSTRUCTORS: [&str; 4] = ["Worker", "WebSocket", "XMLHttpRequest", "EventSource"];
const TOP_LEVEL_CONTROL: [&str; 10] = [
    "BlockStatement", "DoWhileStatement", "ForInStatement", "ForOfStatement", "ForStatement", "IfStatement", "SwitchStatement", "TryStatement",
    "WhileStatement", "WithStatement",
];
const ENTRY_HINT: &str = " Move the work into a function that the app entry calls. The entry (the module script in Vite's index.html, else src/main.tsx, and the NestJS entry in nest-cli.json) is detected; for another entry file, list it under `layout.entryPoints` in nitpicker.config.json.";

fn executes_at_module_load(scopes: &Scopes, node: Node) -> bool {
    for current in node.ancestors() {
        if matches!(current.kind(), "ArrowFunctionExpression" | "FunctionDeclaration" | "FunctionExpression") || guarded_by_main(scopes, current, node) {
            return false;
        }
        if current.is("Program") {
            return true;
        }
    }
    false
}

fn is_module_level_declaration(node: Node) -> bool {
    let Some(parent) = node.parent() else { return false };
    node.is("VariableDeclaration")
        && (parent.is("Program") || (parent.is("ExportNamedDeclaration") && parent.parent().is_some_and(|above| above.is("Program"))))
}

fn import_time_effect(node: Node, bindings: &Bindings) -> Option<String> {
    let callee = node.node("callee")?;
    let text = callee_text(callee);
    if node.is("NewExpression") {
        let name = text?;
        let clock = name == "Date" && node.nodes("arguments").is_empty();
        return (clock || EFFECT_CONSTRUCTORS.contains(&name.as_str())).then(|| format!("new {name}()"));
    }
    let text = text?;
    let name = text.rsplit('.').next().unwrap_or_default();
    let root = text.split('.').next().unwrap_or_default();
    let effect = (EFFECT_CALLEES.contains(&name) && (text == name || GLOBAL_OBJECTS.contains(&root)))
        || EFFECT_MEMBER_CALLS.contains(&text.as_str())
        || imported_callee_name(callee, bindings).is_some_and(|name| name.ends_with("Sync"))
        || text.starts_with("process.");
    effect.then(|| format!("{text}()"))
}

fn is_common_js_export(expression: Node) -> bool {
    if !expression.is("AssignmentExpression") || expression.text("operator").as_deref() != Some("=") {
        return false;
    }
    let Some(left) = expression.node("left") else { return false };
    let path = member_path(left);
    let at = |index: usize| path.get(index).and_then(|segment| segment.as_deref());
    (at(0) == Some("module") && at(1) == Some("exports")) || (at(0) == Some("exports") && path.len() > 1)
}

type Report<'v> = (Node<'v>, String, Vec<(String, String)>);

fn statement<'v>(reports: &mut Vec<Report<'v>>, scopes: &Scopes, node: Node<'v>, common_js_exports: bool) {
    let Some(parent) = node.parent() else { return };
    if node.is("ExpressionStatement") && parent.is("Program") {
        let expression = node.node("expression");
        let skipped = node.text("directive").is_some()
            || expression.is_none_or(|expression| expression.is("AwaitExpression"))
            || (common_js_exports && expression.is_some_and(is_common_js_export))
            || expression.is_some_and(|expression| is_member_definition(scopes, expression));
        if !skipped {
            let message = format!("Top-level expression executes work during module loading.{ENTRY_HINT}");
            reports.push((node, message, Vec::new()));
        }
    }
    if parent.is("Program") && TOP_LEVEL_CONTROL.contains(&node.kind()) && !is_main_guard(scopes, node) {
        let message = format!("Top-level {} executes control flow during module loading.{ENTRY_HINT}", node.kind());
        reports.push((node, message, Vec::new()));
    }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let common_js_exports = context.setting(&format!("{RULE}.common-js-exports")) == Some("true");
    let bindings = module_bindings(view.program());
    let mut reports: Vec<Report> = Vec::new();
    for node in view.nodes() {
        match node.kind() {
            "ImportDeclaration" if node.nodes("specifiers").is_empty() => {
                let source = string_literal(node.node("source")).unwrap_or_default();
                let message = format!("Side-effect-only import executes code during module loading.{ENTRY_HINT}");
                reports.push((node, message, vec![(NOT_STYLESHEET.into(), source)]));
            }
            "AwaitExpression" if executes_at_module_load(scopes, node) => {
                reports.push((node, format!("Top-level await delays and executes work during module loading.{ENTRY_HINT}"), Vec::new()));
            }
            "NewExpression" | "CallExpression" => {
                let call = import_time_effect(node, &bindings).filter(|_| {
                    executes_at_module_load(scopes, node) && node.ancestors().any(is_module_level_declaration)
                });
                if let Some(call) = call {
                    let message = format!("`{call}` runs when the module is imported. Move it into a function and call that from the composition root, passing the result in. An exception fits only when it must run at import.");
                    reports.push((node, message, Vec::new()));
                }
            }
            "StaticBlock" if executes_at_module_load(scopes, node) => {
                reports.push((node, "Static initialization block executes during module loading.".into(), Vec::new()));
            }
            _ => {}
        }
        statement(&mut reports, scopes, node, common_js_exports);
    }
    reports.sort_by_key(|(node, _, _)| (node.start(), std::cmp::Reverse(node.end()), node.ancestors().count()));
    for (node, message, conditions) in reports {
        context.report_when(RULE, node.start(), Some(node.end()), message, conditions);
    }
}
