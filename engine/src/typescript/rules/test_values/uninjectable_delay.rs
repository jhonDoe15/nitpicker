//! `no-uninjectable-delay`: an exported function that waits a module constant of 500 ms or more with no parameter
//! that could carry a shorter delay.
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::{DefKind, ScopeKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_assertions::unowned_async::nodes::{ModuleBindings, imported_callee_name, module_bindings};
use crate::typescript::rules::test_checks::fixed_sleep::numbers::constant_number;
use crate::typescript::rules::writes::syntax::js_number;
use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

const RULE: &str = "no-uninjectable-delay";
const MIN_UNINJECTABLE_DELAY_MS: f64 = 500.0;
const TIMER_MODULES: [&str; 4] = ["timers", "node:timers", "timers/promises", "node:timers/promises"];
const TIMER_FUNCTIONS: [&str; 2] = ["setTimeout", "setInterval"];
const FUNCTIONS: [&str; 3] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"];

static OPTION_PARAMETER_NAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i-u)option|opts|config|setting|delay|timeout|interval|wait|duration|ms$|param|override|dependenc|deps|context|ctx|env").expect("pattern")
});

struct TopLevel<'v> {
    function: Node<'v>,
    name: Option<String>,
    host: Node<'v>,
}

fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn exported_local_names(program: Node) -> HashSet<String> {
    let mut names = HashSet::new();
    for statement in program.nodes("body") {
        if statement.is("ExportNamedDeclaration") && statement.node("declaration").is_none() && statement.node("source").is_none() {
            names.extend(statement.nodes("specifiers").into_iter().filter_map(|specifier| name_of(specifier.node("local"))));
        }
        let declaration = statement.node("declaration").filter(|declaration| statement.is("ExportDefaultDeclaration") && declaration.is("Identifier"));
        names.extend(name_of(declaration));
    }
    names
}

fn top_level_function(node: Node) -> Option<TopLevel> {
    let outermost = node.ancestors().filter(|ancestor| FUNCTIONS.contains(&ancestor.kind())).last()?;
    if outermost.is("FunctionDeclaration") {
        return Some(TopLevel { function: outermost, name: name_of(outermost.node("id")), host: outermost });
    }
    let parent = outermost.parent()?;
    if parent.is("ExportDefaultDeclaration") {
        return Some(TopLevel { function: outermost, name: None, host: outermost });
    }
    let id = parent.node("id").filter(|id| parent.is("VariableDeclarator") && id.is("Identifier"))?;
    let declaration = parent.parent().filter(|declaration| declaration.text("kind").as_deref() == Some("const"))?;
    Some(TopLevel { function: outermost, name: name_of(Some(id)), host: declaration })
}

fn is_exported(found: &TopLevel, exported: &HashSet<String>) -> bool {
    let wrapped = found.host.parent().is_some_and(|wrapper| matches!(wrapper.kind(), "ExportNamedDeclaration" | "ExportDefaultDeclaration"));
    wrapped || found.name.as_ref().is_some_and(|name| exported.contains(name))
}

fn can_carry_delay(parameter: Node) -> bool {
    !parameter.is("Identifier") || parameter.name().is_some_and(|name| OPTION_PARAMETER_NAME.is_match(&name))
}

fn is_module_constant(scopes: &Scopes, identifier: Node) -> bool {
    let Some(symbol) = super::find_variable(scopes, identifier) else { return false };
    let defs = scopes.defs(symbol);
    let [definition] = defs.as_slice() else { return false };
    let module = scopes.scope_of(symbol).is_some_and(|(kind, _)| matches!(kind, ScopeKind::Module | ScopeKind::Global));
    let kind = definition.node.parent().and_then(|declaration| declaration.text("kind"));
    module && definition.kind == DefKind::Variable && kind.as_deref() == Some("const")
}

fn delay_constant<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Node<'s>> {
    let mut pending: Vec<Node> = node.into_iter().collect();
    while let Some(current) = pending.pop() {
        if current.is("Identifier") && is_module_constant(scopes, current) {
            return Some(current);
        }
        let operand = current.is("BinaryExpression") && matches!(current.text("operator").as_deref(), Some("*" | "+"));
        if operand {
            pending.extend([current.node("right"), current.node("left")].into_iter().flatten());
        }
    }
    None
}

fn is_global_timer(scopes: &Scopes, callee: Node) -> Option<String> {
    if callee.is("Identifier") {
        let name = name_of(Some(callee))?;
        let declared = super::find_variable(scopes, callee).is_some_and(|symbol| !scopes.defs(symbol).is_empty());
        return (TIMER_FUNCTIONS.contains(&name.as_str()) && !declared).then_some(name);
    }
    let object = callee.node("object").filter(|object| callee.is("MemberExpression") && !callee.flag("computed") && object.is("Identifier"))?;
    let property = callee.node("property").filter(|property| property.is("Identifier")).and_then(|property| name_of(Some(property)))?;
    (name_of(Some(object)).as_deref() == Some("globalThis") && TIMER_FUNCTIONS.contains(&property.as_str())).then_some(property)
}

fn timer_of(scopes: &Scopes, bindings: &ModuleBindings, call: Node) -> Option<(String, usize)> {
    let callee = call.node("callee")?;
    if let Some(timer) = is_global_timer(scopes, callee) {
        return Some((timer, 1));
    }
    imported_callee_name(callee, bindings).filter(|imported| TIMER_FUNCTIONS.contains(&imported.as_str())).map(|timer| (timer, 0))
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let bindings = module_bindings(view.program(), &TIMER_MODULES);
    let exported = exported_local_names(view.program());
    let mut found = Vec::new();
    for call in view.nodes().filter(|node| node.is("CallExpression")) {
        let Some((timer, index)) = timer_of(scopes, &bindings, call) else { continue };
        let delay = call.list("arguments").get(index).copied().flatten();
        let Some(constant) = delay_constant(scopes, delay) else { continue };
        let Some(value) = constant_number(scopes, delay).filter(|value| !(*value < MIN_UNINJECTABLE_DELAY_MS)) else { continue };
        let Some(top) = top_level_function(call).filter(|top| is_exported(top, &exported)) else { continue };
        if top.function.nodes("params").into_iter().any(can_carry_delay) {
            continue;
        }
        let name = name_of(Some(constant)).unwrap_or_default();
        let owner = top.name.clone().unwrap_or_else(|| "default".to_string());
        let message = format!(
            "{timer} waits {name} ({} ms), a module constant that exported \"{owner}\" cannot override, so a test must wait it out or fake timers. Accept the delay as an option with {name} as its default, for example \"{{ delayMs = {name} }} = {{}}\". An exception fits only when the delay is deliberately fixed.",
            js_number(value)
        );
        found.push((call.start(), call.end(), message));
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
