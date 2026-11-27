//! `file-calls.mts`: existence checks and file reads of the `fs` family, and whether a checked path comes from
//! configuration or an iteration, where a directory of that name can turn up.
use crate::typescript::rules::security_values::{defs, resolve_constant};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::{quasi_text, string_value};
use regex::Regex;
use std::sync::LazyLock;

const EXISTENCE_CALLS: [&str; 5] = ["existsSync", "access", "accessSync", "pathExists", "pathExistsSync"];
const READ_CALLS: [&str; 9] = ["readFile", "readFileSync", "createReadStream", "open", "openSync", "readJson", "readJsonSync", "readJSON", "readJSONSync"];
const FILE_OWNERS: [&str; 7] = ["fs", "fsp", "fse", "fsPromises", "promises", "fsExtra", "fileSystem"];
const NON_PROBE_MODES: [&str; 2] = ["X_OK", "W_OK"];
const ITERATION_CALLS: [&str; 8] = ["map", "flatMap", "forEach", "filter", "some", "every", "find", "reduce"];
pub const ASSERTION_FORMS: [&str; 3] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression"];

static FILE_EXTENSION: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\.[A-Za-z][A-Za-z0-9]{0,7}$").expect("extension"));
static CONFIG_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new("(?i)^(?:options|opts|config|configuration|settings|params|args|input|ctx|context)$|config|option|setting").expect("config"));
static PATH_PARAMETER: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)(?:file|path|filename)$").expect("path"));

/// `unwrapOf`: the expression inside the wrappers of those kinds.
pub fn unwrap_of<'v>(node: Node<'v>, kinds: &[&str]) -> Node<'v> {
    let mut current = node;
    while kinds.contains(&current.kind()) {
        let inner = if current.is("AwaitExpression") { current.node("argument") } else { current.node("expression") };
        match inner {
            Some(inner) => current = inner,
            None => break,
        }
    }
    current
}

/// `nameOf`: the `name` of an identifier-like node.
pub fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn is_in(names: &[&str], name: Option<String>) -> bool {
    name.is_some_and(|name| names.contains(&name.as_str()))
}

fn file_call_name(call: Node) -> Option<String> {
    let callee = call.node("callee")?;
    if callee.is("Identifier") {
        return name_of(Some(callee));
    }
    if !callee.is("MemberExpression") || callee.flag("computed") {
        return None;
    }
    let owner = callee.node("object")?;
    let owner_name = if owner.is("MemberExpression") { name_of(owner.node("object")) } else { name_of(Some(owner)) };
    if is_in(&FILE_OWNERS, owner_name) { name_of(callee.node("property")) } else { None }
}

/// `existenceCheckedPath`: the path an existence check, awaited or not, probes.
pub fn existence_checked_path(node: Node) -> Option<Node> {
    let kinds = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "AwaitExpression"];
    let value = unwrap_of(node, &kinds);
    if !value.is("CallExpression") {
        return None;
    }
    let arguments = value.list("arguments");
    let path = arguments.first().copied().flatten()?;
    let mode = arguments.get(1).copied().flatten();
    let mode_name = mode.and_then(|mode| if mode.is("MemberExpression") { name_of(mode.node("property")) } else { name_of(Some(mode)) });
    let probe = is_in(&EXISTENCE_CALLS, file_call_name(value)) && !path.is("SpreadElement") && !is_in(&NON_PROBE_MODES, mode_name);
    probe.then_some(path)
}

/// `readCallPath`: the path a file read reads.
pub fn read_call_path(call: Node) -> Option<Node> {
    let path = call.list("arguments").first().copied().flatten();
    if !is_in(&READ_CALLS, file_call_name(call)) || path.is_some_and(|path| path.is("SpreadElement")) {
        return None;
    }
    path
}

fn resolved_form<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Node<'s> {
    unwrap_of(resolve_constant(scopes, Some(node)).unwrap_or(node), &ASSERTION_FORMS)
}

fn ends_with_file_name<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> bool {
    let value = resolved_form(scopes, node);
    if value.is("TemplateLiteral") {
        let last = value.nodes("quasis").len().saturating_sub(1);
        return FILE_EXTENSION.is_match(&quasi_text(value, last));
    }
    string_value(Some(value)).is_some_and(|text| FILE_EXTENSION.is_match(&text))
}

fn roots_of(node: Node) -> Vec<String> {
    let mut names = Vec::new();
    let mut pending = vec![node];
    while let Some(current) = pending.pop() {
        let value = unwrap_of(current, &ASSERTION_FORMS);
        if value.is("MemberExpression") {
            if !value.flag("computed") {
                names.push(name_of(value.node("property")).unwrap_or_default());
            }
            pending.extend(value.node("object"));
        } else if value.is("Identifier") {
            names.extend(name_of(Some(value)));
        }
    }
    names
}

fn is_iteration_variable<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> bool {
    let Some(definition) = defs(scopes, node).into_iter().next() else { return false };
    if definition.kind == DefKind::Parameter {
        let holder = definition.node.parent();
        let callee = holder.filter(|holder| holder.is("CallExpression")).and_then(|holder| holder.node("callee"));
        let iterated = callee.is_some_and(|callee| callee.is("MemberExpression") && is_in(&ITERATION_CALLS, name_of(callee.node("property"))));
        return iterated || node.name().is_some_and(|name| PATH_PARAMETER.is_match(&name));
    }
    let statement = definition.node.parent().and_then(|declaration| declaration.parent());
    definition.kind == DefKind::Variable && statement.is_some_and(|statement| statement.is("ForOfStatement"))
}

/// `isConfiguredPath`: a path read from configuration, or an iteration variable or path parameter.
pub fn is_configured_path<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> bool {
    let value = resolved_form(scopes, node);
    if value.is("Identifier") {
        return is_iteration_variable(scopes, value);
    }
    value.is("MemberExpression") && !ends_with_file_name(scopes, value) && roots_of(value).iter().any(|name| CONFIG_NAME.is_match(name))
}
