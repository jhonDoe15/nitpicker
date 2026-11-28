//! `heldScope`: the transaction or lock a node runs under, either as the callback of a scope opener
//! (`prisma.$transaction(async (tx) => ...)`, `mutex.runExclusive(...)`) or between a call that begins it and
//! the call that ends it in the same body (`startTransaction()` ... `commitTransaction()`).
use super::estree_calls::{call_view, calls_within, is_function, runs_with_caller};
use super::owners::{Opener, is_owned};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::rules::queries::js_patterns::{Folded, js_pattern};
use regex::Regex;
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::LazyLock;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ScopeKind {
    Transaction,
    Lock,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Begins,
    Ends,
}

pub struct Marker<'v> {
    pub call: Node<'v>,
    pub role: Role,
    branch: Option<Node<'v>>,
}

/// The calls and markers of one body, found once per file and kind.
pub struct BodyIndex<'v> {
    calls: Vec<Node<'v>>,
    pub markers: Vec<Marker<'v>>,
}

/// What a file's check keeps between nodes: body indexes by body and kind.
pub struct Held<'a, 'v> {
    pub scopes: &'v Scopes<'a, 'v>,
    bodies: HashMap<(u32, u32, bool), Rc<BodyIndex<'v>>>,
}

impl<'a, 'v> Held<'a, 'v> {
    pub fn of(scopes: &'v Scopes<'a, 'v>) -> Held<'a, 'v> {
        Held { scopes, bodies: HashMap::new() }
    }
}

pub struct HeldScope<'v> {
    pub opener: Node<'v>,
    /// The callback's first parameter, or the root of the call that begins the range.
    pub param: Option<Node<'v>>,
    pub calls: Vec<Node<'v>>,
    pub root: Node<'v>,
}

const SQL_METHODS: [&str; 5] = ["query", "execute", "exec", "raw", "run"];
static BEGIN_TEXT: LazyLock<Regex> = LazyLock::new(|| js_pattern(r"^\s*(?:BEGIN|START\s+TRANSACTION)\b", true));
static END_TEXT: LazyLock<Regex> = LazyLock::new(|| js_pattern(r"^\s*(?:COMMIT|ROLLBACK)\b", true));

/// An `iu` pattern tested the way JavaScript does: U+017F and U+212A are word characters.
fn is_js_match(pattern: &Regex, text: &str) -> bool {
    pattern.is_match(&Folded::of(text).text)
}

impl ScopeKind {
    pub fn callbacks(self) -> &'static [&'static str] {
        match self {
            ScopeKind::Transaction => &["$transaction", "transaction", "transactional"],
            ScopeKind::Lock => &["runExclusive", "acquire", "request", "using"],
        }
    }
    fn begins(self) -> &'static [&'static str] {
        match self {
            ScopeKind::Transaction => &["startTransaction", "beginTransaction", "transaction"],
            ScopeKind::Lock => &["acquire"],
        }
    }
    fn ends(self) -> &'static [&'static str] {
        match self {
            ScopeKind::Transaction => &["commit", "commitTransaction", "rollback", "rollbackTransaction"],
            ScopeKind::Lock => &["release", "unlock", "releaseLock"],
        }
    }
}

pub fn callee_method(call: Node) -> Option<String> {
    let callee = call.node("callee")?;
    if callee.is("MemberExpression") {
        return if callee.flag("computed") { None } else { callee.node("property")?.name().map(|name| name.into_owned()) };
    }
    callee.is("Identifier").then(|| callee.name().map(|name| name.into_owned())).flatten()
}

fn has(list: &[&str], name: Option<&str>) -> bool {
    name.is_some_and(|name| list.contains(&name))
}

fn statement_text(kind: ScopeKind, call: Node) -> String {
    let Some(view) = call_view(call) else { return String::new() };
    let sql = kind == ScopeKind::Transaction && has(&SQL_METHODS, view.method.as_deref());
    match view.args.first() {
        Some(crate::typescript::rules::effects::views::Argument::Literal(crate::typescript::rules::effects::views::Literal::Text(text))) if sql => text.clone(),
        _ => String::new(),
    }
}

fn marker_role(types: Option<&mut Types>, scopes: &Scopes, kind: ScopeKind, call: Node) -> Option<Role> {
    if !call.is("CallExpression") || call.nodes("arguments").into_iter().any(is_function) {
        return None;
    }
    let method = callee_method(call);
    let candidate = has(kind.ends(), method.as_deref()) || has(kind.begins(), method.as_deref()) || (kind == ScopeKind::Transaction && has(&SQL_METHODS, method.as_deref()));
    if !candidate {
        return None;
    }
    let view = call_view(call)?;
    let text = statement_text(kind, call);
    if has(kind.ends(), view.method.as_deref()) || is_js_match(&END_TEXT, &text) {
        return Some(Role::Ends);
    }
    let begins = has(kind.begins(), view.method.as_deref()) || is_js_match(&BEGIN_TEXT, &text);
    (begins && is_owned(types, scopes, kind, &Opener { call, view: &view, callbacks: false })).then_some(Role::Begins)
}

fn is_branch(node: Node) -> bool {
    matches!(node.kind(), "IfStatement" | "CatchClause" | "SwitchCase" | "ConditionalExpression")
}

fn in_test(branch: Node, node: Node) -> bool {
    branch.node("test").is_some_and(|test| test.contains(node))
}

fn branch_of<'v>(node: Node<'v>, body: Node<'v>) -> Option<Node<'v>> {
    node.ancestors().filter(|ancestor| body.contains(*ancestor)).find(|ancestor| is_branch(*ancestor) && !in_test(*ancestor, node))
}

pub fn closes(marker: &Marker, node: Node) -> bool {
    marker.branch.is_none_or(|branch| branch.contains(node))
}

fn exits(part: Node) -> bool {
    let last = if part.is("BlockStatement") {
        part.nodes("body").last().copied()
    } else if part.is("SwitchCase") {
        part.nodes("consequent").last().copied()
    } else {
        Some(part)
    };
    last.is_some_and(|last| last.is("ReturnStatement") || last.is("ThrowStatement"))
}

fn construct_of(branch: Node) -> Option<Node> {
    if branch.is("SwitchCase") {
        return branch.parent();
    }
    let mut current = branch;
    while let Some(parent) = current.parent().filter(|parent| parent.is("IfStatement") && parent.node("alternate") == Some(current)) {
        current = parent;
    }
    Some(current)
}

fn alternatives(construct: Node) -> Vec<Option<Node>> {
    if construct.is("SwitchStatement") {
        let cases = construct.nodes("cases");
        let has_default = cases.iter().any(|case| case.node("test").is_none());
        return if has_default { cases.into_iter().filter(|case| !case.nodes("consequent").is_empty()).map(Some).collect() } else { vec![None] };
    }
    if !construct.is("IfStatement") {
        return vec![construct.node("consequent"), construct.node("alternate")];
    }
    let mut parts = Vec::new();
    let mut current = construct;
    loop {
        parts.push(current.node("consequent"));
        match current.node("alternate") {
            Some(next) if next.is("IfStatement") => current = next,
            last => {
                parts.push(last);
                break;
            }
        }
    }
    parts
}

fn ends_alternative(markers: &[Marker], part: Option<Node>) -> bool {
    let Some(part) = part else { return false };
    exits(part) || markers.iter().any(|marker| marker.role == Role::Ends && part.contains(marker.call))
}

fn ends_after(markers: &[Marker], marker: &Marker, node: Node) -> bool {
    let Some(construct) = marker.branch.and_then(construct_of) else { return false };
    !construct.is("CatchClause") && construct.end() <= node.start() && alternatives(construct).into_iter().all(|part| ends_alternative(markers, part))
}

pub fn body_index<'v>(mut types: Option<&mut Types>, held: &mut Held<'_, 'v>, kind: ScopeKind, body: Node<'v>) -> Rc<BodyIndex<'v>> {
    let key = (body.start(), body.end(), kind == ScopeKind::Lock);
    if let Some(known) = held.bodies.get(&key) {
        return Rc::clone(known);
    }
    let calls = calls_within(body);
    let mut markers = Vec::new();
    for call in &calls {
        if let Some(role) = marker_role(types.as_deref_mut(), held.scopes, kind, *call) {
            markers.push(Marker { call: *call, role, branch: branch_of(*call, body) });
        }
    }
    let index = Rc::new(BodyIndex { calls, markers });
    held.bodies.insert(key, Rc::clone(&index));
    index
}

fn range_scope<'v>(types: Option<&mut Types>, held: &mut Held<'_, 'v>, kind: ScopeKind, body: Node<'v>, node: Node) -> Option<HeldScope<'v>> {
    let index = body_index(types, held, kind, body);
    let markers = &index.markers;
    let last = markers
        .iter()
        .filter(|marker| marker.call.end() <= node.start())
        .filter(|marker| marker.role == Role::Begins || closes(marker, node) || ends_after(markers, marker, node))
        .last()?;
    if last.role != Role::Begins {
        return None;
    }
    let begin = last.call;
    let end = markers.iter().find(|marker| marker.role == Role::Ends && marker.call.start() >= begin.end() && closes(marker, begin)).map(|marker| marker.call);
    let calls = index.calls.iter().copied().filter(|call| call.start() >= begin.end() && end.is_none_or(|end| call.end() <= end.start())).collect();
    let param = call_view(begin).and_then(|view| view.root);
    Some(HeldScope { opener: begin, param, calls, root: body })
}

fn is_callback_opener(types: Option<&mut Types>, scopes: &Scopes, kind: ScopeKind, function: Node) -> bool {
    let Some(call) = function.parent().filter(|call| call.is("CallExpression")) else { return false };
    if !(call.nodes("arguments").contains(&function) && has(kind.callbacks(), callee_method(call).as_deref())) {
        return false;
    }
    let Some(view) = call_view(call) else { return false };
    is_owned(types, scopes, kind, &Opener { call, view: &view, callbacks: true })
}

fn callback_scope<'v>(mut types: Option<&mut Types>, scopes: &Scopes, kind: ScopeKind, node: Node<'v>) -> Option<HeldScope<'v>> {
    for function in node.ancestors().filter(|ancestor| is_function(*ancestor)) {
        if is_callback_opener(types.as_deref_mut(), scopes, kind, function) {
            let body = function.node("body")?;
            let param = function.nodes("params").first().copied();
            return Some(HeldScope { opener: function.parent()?, param, calls: calls_within(body), root: body });
        }
        if !runs_with_caller(function) {
            return None;
        }
    }
    None
}

/// `heldScope`.
pub fn held_scope<'v>(mut types: Option<&mut Types>, held: &mut Held<'_, 'v>, kind: ScopeKind, node: Node<'v>, program: Node<'v>) -> Option<HeldScope<'v>> {
    if let Some(callback) = callback_scope(types.as_deref_mut(), held.scopes, kind, node) {
        return Some(callback);
    }
    let unit = node.ancestors().filter(|ancestor| is_function(*ancestor)).find(|function| !runs_with_caller(*function));
    let body = match unit {
        Some(function) => function.node("body")?,
        None => program,
    };
    range_scope(types, held, kind, body, node)
}
