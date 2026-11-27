//! `subprocess-calls.mts` and `subprocessBindings`: which calls start a process, with the command and the arguments
//! the source spells out.
use crate::typescript::rules::security_values::{resolve_constant, string_value};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_assertions::unowned_async::nodes::{ModuleBindings, imported_callee_name, module_bindings};
use crate::typescript::strings::is_space;

const SUBPROCESS_MODULES: [&str; 4] = ["child_process", "node:child_process", "execa", "cross-spawn"];
const FILE_FORM_FUNCTIONS: [&str; 7] = ["execFileSync", "execFile", "spawn", "spawnSync", "execa", "execaSync", "execaNode"];
const SHELL_FORM_FUNCTIONS: [&str; 4] = ["execSync", "exec", "execaCommand", "execaCommandSync"];
const NODE_FORM_FUNCTIONS: [&str; 2] = ["fork", "execaNode"];
const GIT_OPTIONS_WITH_VALUE: [&str; 5] = ["-c", "-C", "--git-dir", "--work-tree", "--namespace"];
const BIN_PATH: &str = "node_modules/.bin";

/// `Subprocess`: the command, the nodes it and its arguments come from, and the argument words known statically.
pub struct Subprocess<'v> {
    pub command: Option<String>,
    pub command_node: Option<Node<'v>>,
    pub args_node: Option<Node<'v>>,
    pub tokens: Vec<String>,
}

/// `subprocessBindings`.
pub fn subprocess_bindings(program: Node) -> ModuleBindings {
    let mut bindings = module_bindings(program, &SUBPROCESS_MODULES);
    for statement in program.nodes("body").into_iter().filter(|statement| statement.is("ImportDeclaration")) {
        let name = match statement.node("source").and_then(|source| source.text("value")).as_deref() {
            Some("execa") => "execa",
            Some("cross-spawn") => "spawn",
            _ => continue,
        };
        for specifier in statement.nodes("specifiers").into_iter().filter(|specifier| specifier.is("ImportDefaultSpecifier")) {
            if let Some(local) = specifier.node("local").and_then(|local| local.name()) {
                bindings.named.insert(local.into_owned(), name.to_string());
            }
        }
    }
    bindings
}

fn cooked(quasi: Node) -> String {
    match quasi.get("value") {
        Value::Node(index) => quasi.view.at(index).text("cooked").map(|text| text.into_owned()).unwrap_or_default(),
        _ => String::new(),
    }
}

/// `staticText`: a string literal, or a template with each placeholder written as `X`.
fn static_text(node: Option<Node>) -> Option<String> {
    let node = node?;
    if node.is("Literal") {
        return if matches!(node.get("value"), Value::Text(..)) { node.text("value").map(|text| text.into_owned()) } else { None };
    }
    node.is("TemplateLiteral").then(|| node.nodes("quasis").into_iter().map(cooked).collect::<Vec<_>>().join("X"))
}

/// `/(?:^|\/)node_modules\/\.bin(?:\/|$)/`.
fn has_bin_path(text: &str) -> bool {
    text.match_indices(BIN_PATH).any(|(at, _)| {
        let rest = &text[at + BIN_PATH.len()..];
        (at == 0 || text[..at].ends_with('/')) && (rest.is_empty() || rest.starts_with('/'))
    })
}

/// `containsBinPath`: the node, or an argument or operand under it, names a `node_modules/.bin` path.
fn contains_bin_path(node: Option<Node>) -> bool {
    let mut pending: Vec<Node> = node.into_iter().collect();
    while let Some(current) = pending.pop() {
        if static_text(Some(current)).is_some_and(|text| has_bin_path(&text)) {
            return true;
        }
        match current.kind() {
            "CallExpression" => pending.extend(current.nodes("arguments")),
            "BinaryExpression" => pending.extend(current.node("left").into_iter().chain(current.node("right"))),
            _ => {}
        }
    }
    false
}

fn is_exec_path(node: Node) -> bool {
    let object = node.node("object").filter(|object| object.is("Identifier"));
    let property = node.node("property").filter(|property| property.is("Identifier"));
    node.is("MemberExpression")
        && !node.flag("computed")
        && object.is_some_and(|object| object.name().as_deref() == Some("process"))
        && property.is_some_and(|property| property.name().as_deref() == Some("execPath"))
}

fn command_name(scopes: &Scopes, node: Option<Node>) -> Option<String> {
    let resolved = resolve_constant(scopes, node);
    if resolved.is_some_and(is_exec_path) {
        return Some("node".into());
    }
    if contains_bin_path(resolved) {
        return Some("package-bin".into());
    }
    string_value(resolved)
}

/// `literalTokens`: the words a constant string or array of strings spells.
pub fn literal_tokens(scopes: &Scopes, node: Option<Node>) -> Vec<String> {
    let resolved = resolve_constant(scopes, node);
    if let Some(value) = string_value(resolved) {
        return vec![value];
    }
    let Some(array) = resolved.filter(|resolved| resolved.is("ArrayExpression")) else { return Vec::new() };
    let elements = array.list("elements").into_iter().flatten().filter(|element| !element.is("SpreadElement"));
    elements.map(|element| string_value(Some(element)).unwrap_or_default()).collect()
}

fn is_argument_list(scopes: &Scopes, node: Option<Node>) -> bool {
    match node {
        None => false,
        Some(node) if node.is("SpreadElement") => true,
        Some(node) => !resolve_constant(scopes, Some(node)).is_some_and(|resolved| resolved.is("ObjectExpression")),
    }
}

fn argument_form<'v>(scopes: &Scopes<'_, 'v>, call: Node<'v>, command: Option<String>) -> Subprocess<'v> {
    let arguments = call.nodes("arguments");
    let (first, second) = (arguments.first().copied(), arguments.get(1).copied());
    let has_args = is_argument_list(scopes, second);
    let tokens = if has_args { literal_tokens(scopes, second) } else { Vec::new() };
    Subprocess { command, command_node: first, args_node: second.filter(|_| has_args), tokens }
}

fn shell_form<'v>(scopes: &Scopes<'_, 'v>, call: Node<'v>) -> Subprocess<'v> {
    let first = call.nodes("arguments").first().copied();
    let words: Vec<String> = match static_text(resolve_constant(scopes, first)) {
        Some(text) => {
            let trimmed = text.trim_matches(is_space);
            if trimmed.is_empty() { vec![String::new()] } else { trimmed.split(is_space).filter(|word| !word.is_empty()).map(str::to_string).collect() }
        }
        None => Vec::new(),
    };
    let command = words.first().cloned();
    Subprocess { command, command_node: first, args_node: first, tokens: words.into_iter().skip(1).collect() }
}

/// `describeSubprocess`.
pub fn describe_subprocess<'v>(scopes: &Scopes<'_, 'v>, call: Node<'v>, bindings: &ModuleBindings) -> Option<Subprocess<'v>> {
    if !call.is("CallExpression") {
        return None;
    }
    let name = imported_callee_name(call.node("callee")?, bindings)?;
    if NODE_FORM_FUNCTIONS.contains(&name.as_str()) {
        return Some(argument_form(scopes, call, Some("node".into())));
    }
    if FILE_FORM_FUNCTIONS.contains(&name.as_str()) {
        let command = command_name(scopes, call.nodes("arguments").first().copied());
        return Some(argument_form(scopes, call, command));
    }
    SHELL_FORM_FUNCTIONS.contains(&name.as_str()).then(|| shell_form(scopes, call))
}

/// `gitSubcommand`: the first word that is not an option or an option's value.
pub fn git_subcommand(tokens: &[String]) -> Option<&str> {
    let mut remaining = tokens.iter();
    while let Some(token) = remaining.next() {
        if GIT_OPTIONS_WITH_VALUE.contains(&token.as_str()) {
            remaining.next();
            continue;
        }
        if !token.starts_with('-') {
            return Some(token);
        }
    }
    None
}
