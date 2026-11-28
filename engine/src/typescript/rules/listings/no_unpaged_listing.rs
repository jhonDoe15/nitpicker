//! `no-unpaged-listing`: an S3 listing (`ListObjectsV2Command`, `listObjectsV2`) whose scope never follows the page
//! marker, and a RediSearch `ft.search` without `LIMIT`.
use crate::typescript::rules::Context;
use crate::typescript::rules::signatures::{is_function, unwrap};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use std::collections::{HashMap, HashSet};

const RULE: &str = "no-unpaged-listing";
const LISTING: &str = "An object-store listing returns one page (1000 keys) and the rest is ignored. Use the paginator (`paginateListObjectsV2`), or loop on `NextContinuationToken` and `IsTruncated`. An existence check passes `MaxKeys: 1`.";
const SEARCH: &str = "RediSearch `FT.SEARCH` returns 10 documents by default, so the rest is ignored. Pass `LIMIT: { from: 0, size: n }` and loop on the offset until a page comes back short.";
const COMMANDS: [&str; 3] = ["ListObjectsV2Command", "ListObjectsCommand", "ListObjectVersionsCommand"];
const CLIENT_CALLS: [&str; 3] = ["listObjectsV2", "listObjects", "listObjectVersions"];
const MARKERS: [&str; 12] = [
    "NextContinuationToken", "ContinuationToken", "IsTruncated", "NextMarker", "Marker", "KeyMarker", "NextKeyMarker",
    "NextVersionIdMarker", "StartAfter", "paginateListObjectsV2", "paginateListObjects", "paginateListObjectVersions",
];
const SEARCH_LIMITS: [&str; 2] = ["LIMIT", "limit"];
const RESULT_PARTS: [&str; 4] = ["promise", "KeyCount", "Contents", "length"];
const TEST_OPERATORS: [&str; 8] = [">", ">=", "<", "<=", "===", "!==", "==", "!="];
const NULLISH_WRAPPERS: &[&str] = &["ChainExpression", "TSNonNullExpression", "TSAsExpression"];

fn unwrapped(node: Node) -> Node {
    unwrap(node, NULLISH_WRAPPERS)
}

fn identifier_named(node: Option<Node>, names: &[&str]) -> bool {
    node.is_some_and(|node| node.is("Identifier") && node.name().is_some_and(|name| names.contains(&name.as_ref())))
}

struct Check<'c, 'a, 's> {
    scopes: &'c Scopes<'a, 's>,
    marked: HashMap<u32, bool>,
}

impl<'s> Check<'_, '_, 's> {
    /// `namesIn(scopeOf(node))` holds a page marker: every identifier and string literal of the enclosing function.
    fn scope_marks(&mut self, node: Node<'s>) -> bool {
        let scope = node.ancestors().find(|each| is_function(*each)).or_else(|| node.ancestors().last()).unwrap_or(node);
        if let Some(known) = self.marked.get(&scope.index) {
            return *known;
        }
        let mut names: HashSet<String> = HashSet::new();
        let mut pending = vec![scope];
        while let Some(current) = pending.pop() {
            if current.is("Identifier") {
                names.extend(current.name().map(|name| name.into_owned()));
            } else if current.is("Literal") && matches!(current.get("value"), Value::Text(..)) {
                names.extend(current.text("value").map(|text| text.into_owned()));
            }
            pending.extend(current.children());
        }
        let marks = MARKERS.iter().any(|marker| names.contains(*marker));
        self.marked.insert(scope.index, marks);
        marks
    }

    fn declared_symbols(&self, declarator: Node<'s>) -> Vec<oxc_semantic::SymbolId> {
        let Some(id) = declarator.node("id") else { return Vec::new() };
        let mut found = Vec::new();
        let mut pending = vec![id];
        while let Some(current) = pending.pop() {
            pending.extend(current.children());
            if !current.is("Identifier") {
                continue;
            }
            let Some(symbol) = self.scopes.variable_named(current) else { continue };
            if !found.contains(&symbol) && self.scopes.defs(symbol).iter().any(|definition| definition.node == declarator) {
                found.push(symbol);
            }
        }
        found
    }

    fn is_only_presence_tested(&self, node: Node<'s>) -> bool {
        let result = climb_result(node);
        if is_presence_test(result) {
            return true;
        }
        let Some(parent) = result.parent().filter(|parent| parent.is("VariableDeclarator") && parent.node("init") == Some(result)) else { return false };
        let id = parent.node("id");
        let uses: Vec<Node> = self
            .declared_symbols(parent)
            .into_iter()
            .flat_map(|symbol| self.scopes.references(symbol))
            .map(|reference| reference.identifier)
            .filter(|identifier| Some(*identifier) != id)
            .collect();
        !uses.is_empty() && uses.into_iter().all(|identifier| is_presence_test(climb_result(identifier)))
    }

    fn is_unpaged(&mut self, node: Node<'s>, input: Option<Node<'s>>) -> bool {
        if self.is_only_presence_tested(node) {
            return false;
        }
        if object_keys(input).is_some_and(|keys| keys.contains("MaxKeys") || keys.contains("maxKeys")) {
            return false;
        }
        !self.scope_marks(node)
    }
}

/// `objectKeys`: the written keys of an object literal; nothing when it spreads another object.
fn object_keys(node: Option<Node>) -> Option<HashSet<String>> {
    let inner = unwrapped(node?);
    if !inner.is("ObjectExpression") {
        return None;
    }
    let mut keys = HashSet::new();
    for property in inner.nodes("properties") {
        if !property.is("Property") {
            return None;
        }
        let Some(key) = property.node("key") else { continue };
        if key.is("Identifier") {
            keys.extend(key.name().map(|name| name.into_owned()));
        } else if key.is("Literal") && matches!(key.get("value"), Value::Text(..)) {
            keys.extend(key.text("value").map(|text| text.into_owned()));
        }
    }
    Some(keys)
}

fn passes_result(parent: Node, current: Node) -> bool {
    match parent.kind() {
        "AwaitExpression" | "ChainExpression" | "TSNonNullExpression" => true,
        "CallExpression" => parent.node("callee") == Some(current),
        "MemberExpression" => {
            parent.node("object") == Some(current) && !parent.flag("computed") && identifier_named(parent.node("property"), &RESULT_PARTS)
        }
        _ => false,
    }
}

fn climb_result(node: Node) -> Node {
    let mut current = node;
    while let Some(parent) = current.parent().filter(|parent| passes_result(*parent, current)) {
        current = parent;
    }
    current
}

fn is_presence_test(node: Node) -> bool {
    let Some(parent) = node.parent() else { return false };
    if parent.is("UnaryExpression") {
        return parent.text("operator").as_deref() == Some("!");
    }
    parent.is("BinaryExpression")
        && parent.text("operator").is_some_and(|operator| TEST_OPERATORS.contains(&operator.as_ref()))
        && [parent.node("left"), parent.node("right")]
            .into_iter()
            .flatten()
            .any(|side| side != node && side.is("Literal") && matches!(side.get("value"), Value::Number(_)))
}

fn is_search_call(callee: Node) -> bool {
    callee.is("MemberExpression")
        && !callee.flag("computed")
        && identifier_named(callee.node("property"), &["search"])
        && callee.node("object").is_some_and(|object| object.is("MemberExpression") && identifier_named(object.node("property"), &["ft"]))
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let mut check = Check { scopes, marked: HashMap::new() };
    let mut found: Vec<(Node, &str)> = Vec::new();
    for node in view.nodes() {
        if node.is("NewExpression") {
            let arguments = node.nodes("arguments");
            if identifier_named(node.node("callee"), &COMMANDS) && check.is_unpaged(node, arguments.first().copied()) {
                found.push((node, LISTING));
            }
            continue;
        }
        if !node.is("CallExpression") {
            continue;
        }
        let Some(callee) = node.node("callee").map(unwrapped) else { continue };
        let arguments = node.list("arguments");
        let argument = |at: usize| arguments.get(at).copied().flatten();
        let client = callee.is("MemberExpression")
            && !callee.flag("computed")
            && identifier_named(callee.node("property"), &CLIENT_CALLS)
            && argument(0).is_some_and(|first| first.is("ObjectExpression"));
        if client && check.is_unpaged(node, argument(0)) {
            found.push((node, LISTING));
            continue;
        }
        if !is_search_call(callee) || argument(1).is_none() {
            continue;
        }
        let options = object_keys(argument(2));
        let limited = SEARCH_LIMITS.iter().any(|limit| options.as_ref().is_some_and(|keys| keys.contains(*limit)));
        if !limited && (argument(2).is_none() || options.is_some()) {
            found.push((node, SEARCH));
        }
    }
    let found: Vec<(u32, u32, &str)> = found.into_iter().map(|(node, message)| (node.start(), node.end(), message)).collect();
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message.to_string());
    }
}
