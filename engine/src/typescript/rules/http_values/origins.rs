//! `http-origins.mts`, `header-tables.mts` and `receivers.mts` of the ESLint plugin: where a value comes from, a
//! request header by its lowercase name or a file extension, followed back through `String`, trims, `??`, `||` and
//! single-write names in the same function. Run without type information, receivers are known by name alone.
use crate::typescript::rules::security_values::{defs, unwrapped, variable_of};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::string_value;
use regex::Regex;
use std::sync::LazyLock;

const KEEPING_METHODS: [&str; 5] = ["trim", "trimStart", "trimEnd", "toString", "valueOf"];
const DOT_HEADERS: [&str; 12] =
    ["accept", "authorization", "connection", "cookie", "expect", "forwarded", "host", "origin", "pragma", "te", "upgrade", "vary"];
const MAX_DEPTH: usize = 4;
const WRITE_WRAPPERS: [&str; 4] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion"];
const FUNCTION_SCOPES: [&str; 3] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"];
const ACCEPT: &str = "accept(?:-(?:charset|encoding|language))?";

fn pattern(text: &str) -> Regex {
    Regex::new(text).expect("pattern")
}

static VALUE_HEADERS: LazyLock<Regex> = LazyLock::new(|| {
    pattern(&format!(
        "^(?:{ACCEPT}|content-(?:type|encoding|language|disposition)|transfer-encoding|connection|upgrade|cache-control|pragma|\
         (?:proxy-)?authorization|www-authenticate|expect|te|host|origin|forwarded|x-forwarded-(?:proto|host|scheme)|\
         sec-fetch-[A-Za-z0-9_]+|vary)$"
    ))
});
static STRUCTURED_HEADERS: LazyLock<Regex> = LazyLock::new(|| {
    pattern(&format!(
        "^(?:{ACCEPT}|content-(?:type|disposition|language)|cache-control|if-none-match|if-match|cookie|set-cookie|forwarded|vary|\
         prefer|link)$"
    ))
});
static HEADER_BAG: LazyLock<Regex> = LazyLock::new(|| pattern("^[A-Za-z0-9_]*[hH]eaders$"));
static REQUEST_LIKE: LazyLock<Regex> = LazyLock::new(|| pattern("^(?:req|request|ctx|context|c|[A-Za-z0-9_]*Req|[A-Za-z0-9_]*Request)$"));
static GETTER_OWNER: LazyLock<Regex> = LazyLock::new(|| pattern("^(?:req|request|ctx|context|c)$"));
static URL_LIKE: LazyLock<Regex> = LazyLock::new(|| pattern("^(?:url|uri|location|[A-Za-z0-9_]*Url|[A-Za-z0-9_]*Uri)$"));

#[derive(Clone, PartialEq, Debug)]
pub enum Origin {
    Header(String),
    Extension,
}

enum Step<'v> {
    Next(Option<Node<'v>>),
    Found(Origin),
}

/// `nameOf`: an identifier's name, or the name of the identifier a plain member reads.
pub fn name_of(node: Option<Node>) -> Option<String> {
    let target = unwrapped(node?);
    if target.is("Identifier") {
        return target.name().map(|name| name.into_owned());
    }
    let property = target.node("property").filter(|property| target.is("MemberExpression") && !target.flag("computed") && property.is("Identifier"))?;
    property.name().map(|name| name.into_owned())
}

fn matches(regex: &Regex, name: Option<String>) -> bool {
    regex.is_match(&name.unwrap_or_default())
}

pub fn request_like(node: Option<Node>) -> bool {
    matches(&REQUEST_LIKE, name_of(node))
}

pub fn url_like(node: Node) -> bool {
    matches(&URL_LIKE, name_of(Some(node)))
}

fn is_bag(node: Node) -> bool {
    let target = unwrapped(node);
    if target.is("NewExpression") {
        return name_of(target.node("callee")).as_deref() == Some("Headers");
    }
    matches(&HEADER_BAG, name_of(Some(target)))
}

fn member_key(member: Node) -> Option<String> {
    if member.flag("computed") { string_value(member.node("property")) } else { name_of(Some(member)) }
}

fn argument(call: Node, index: usize) -> Option<Node> {
    call.list("arguments").get(index).copied().flatten()
}

fn header_getter(call: Node) -> Option<String> {
    let callee = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression") && !callee.flag("computed"))?;
    let method = name_of(Some(callee));
    let owner = unwrapped(callee.node("object")?);
    let gets_from_bag = method.as_deref() == Some("get") && is_bag(owner);
    let named = matches!(method.as_deref(), Some("header" | "getHeader"));
    let gets_from_request =
        (named && request_like(Some(owner))) || (method.as_deref() == Some("get") && matches(&GETTER_OWNER, name_of(Some(owner))));
    (gets_from_bag || gets_from_request).then(|| string_value(argument(call, 0)).map(|name| name.to_lowercase())).flatten()
}

fn header_member(member: Node) -> Option<String> {
    let key = member.node("object").filter(|object| is_bag(*object)).and_then(|_| member_key(member))?;
    (member.flag("computed") || DOT_HEADERS.contains(&key.as_str())).then(|| key.to_lowercase())
}

fn is_split_on_dot(node: Option<Node>) -> bool {
    let Some(call) = node.map(unwrapped).filter(|call| call.is("CallExpression")) else { return false };
    name_of(call.node("callee")).as_deref() == Some("split") && string_value(argument(call, 0)).as_deref() == Some(".")
}

fn uses_last_dot(node: Option<Node>) -> bool {
    let mut pending: Vec<Node> = node.map(unwrapped).into_iter().collect();
    let mut index = 0;
    while index < pending.len() {
        let target = pending[index];
        index += 1;
        if target.is("CallExpression") && name_of(target.node("callee")).as_deref() == Some("lastIndexOf") {
            return true;
        }
        if target.is("BinaryExpression") {
            pending.extend(target.node("left").map(unwrapped).into_iter().chain(target.node("right").map(unwrapped)));
        }
    }
    false
}

fn extension_of(node: Node) -> bool {
    let call = unwrapped(node);
    if !call.is("CallExpression") {
        return false;
    }
    let Some(callee) = call.node("callee") else { return false };
    let method = name_of(Some(callee)).unwrap_or_default();
    if method == "extname" {
        return true;
    }
    let callee = unwrapped(callee);
    let split = matches!(method.as_str(), "pop" | "at") && callee.is("MemberExpression") && is_split_on_dot(callee.node("object"));
    split || (matches!(method.as_str(), "slice" | "substring" | "substr") && uses_last_dot(argument(call, 0)))
}

/// The function, static block, field initializer, namespace or program whose scope holds a node's variables.
fn variable_scope(node: Node) -> Option<Node> {
    let mut child = node;
    for ancestor in node.ancestors() {
        let field = (ancestor.is("PropertyDefinition") || ancestor.is("AccessorProperty")) && ancestor.node("value") == Some(child);
        let holds = matches!(ancestor.kind(), "FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression" | "StaticBlock" | "TSModuleDeclaration" | "Program");
        if field || holds {
            return Some(ancestor);
        }
        child = ancestor;
    }
    None
}

/// Whether a reference writes the name as ESLint counts writes: not through `satisfies`, which it reads as an
/// expression, and not the `var` of a catch body that writes the clause's parameter of the same name.
fn counted_write(identifier: Node, write: bool, declared: bool) -> bool {
    let mut node = identifier;
    let mut satisfies = false;
    while let Some(wrapper) = node.parent().filter(|parent| WRITE_WRAPPERS.contains(&parent.kind())) {
        satisfies |= wrapper.is("TSSatisfiesExpression");
        node = wrapper;
    }
    let target = node.parent().is_some_and(|parent| {
        (parent.is("AssignmentExpression") && parent.node("left") == Some(node)) || parent.is("UpdateExpression")
    });
    write && !(satisfies && target) && !(declared && catching_clause(identifier))
}

fn catching_clause(name: Node) -> bool {
    let Some(text) = name.name() else { return false };
    let Some(declaration) = name.ancestors().find(|node| node.is("VariableDeclaration")) else { return false };
    if declaration.text("kind").as_deref() != Some("var") {
        return false;
    }
    for owner in declaration.ancestors() {
        if FUNCTION_SCOPES.contains(&owner.kind()) {
            return false;
        }
        let param = owner.node("param").filter(|param| owner.is("CatchClause") && param.is("Identifier"));
        if param.is_some_and(|param| param.name().as_deref() == Some(text.as_ref())) {
            return true;
        }
    }
    false
}

fn resolved_init<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> Option<Node<'s>> {
    let variable = variable_of(scopes, identifier)?;
    let definitions = defs(scopes, identifier);
    let [definition] = definitions.as_slice() else { return None };
    let names: Vec<Node> = definitions.iter().map(|definition| definition.name).collect();
    let writes = scopes
        .references(variable)
        .into_iter()
        .filter(|reference| counted_write(reference.identifier, reference.write, names.contains(&reference.identifier)))
        .count();
    let same_function = variable_scope(definition.name) == variable_scope(identifier);
    let plain = definition.kind == DefKind::Variable && definition.node.node("id").is_some_and(|id| id.is("Identifier"));
    (plain && writes == 1 && same_function).then(|| definition.node.node("init")).flatten()
}

/// `initOf`: the initializer of a name written once, in the same function.
pub fn init_of<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Node<'s>> {
    let target = unwrapped(node?);
    if target.is("Identifier") { resolved_init(scopes, target).map(unwrapped) } else { None }
}

fn call_step(call: Node) -> Option<Step> {
    let callee = unwrapped(call.node("callee")?);
    if callee.is("Identifier") && callee.name().as_deref() == Some("String") {
        return Some(Step::Next(argument(call, 0)));
    }
    if callee.is("MemberExpression") && KEEPING_METHODS.contains(&name_of(Some(callee)).unwrap_or_default().as_str()) {
        return Some(Step::Next(callee.node("object")));
    }
    if extension_of(call) {
        return Some(Step::Found(Origin::Extension));
    }
    header_getter(call).map(|header| Step::Found(Origin::Header(header)))
}

fn origin_step<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Step<'s>> {
    let target = unwrapped(node?);
    match target.kind() {
        "LogicalExpression" => matches!(target.text("operator").as_deref(), Some("??" | "||")).then(|| Step::Next(target.node("left"))),
        "Identifier" => resolved_init(scopes, target).map(|init| Step::Next(Some(init))),
        "MemberExpression" => header_member(target).map(|header| Step::Found(Origin::Header(header))),
        "CallExpression" => call_step(target),
        _ => None,
    }
}

/// `originOf`.
pub fn origin_of<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Origin> {
    let mut current = node;
    for depth in 1.. {
        let step = origin_step(scopes, current)?;
        if depth > MAX_DEPTH {
            return None;
        }
        match step {
            Step::Found(origin) => return Some(origin),
            Step::Next(next) => current = next,
        }
    }
    None
}

pub fn header_of<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<String> {
    match origin_of(scopes, node) {
        Some(Origin::Header(header)) => Some(header),
        _ => None,
    }
}

pub fn case_insensitive_header(origin: Option<Origin>) -> Option<String> {
    match origin {
        Some(Origin::Header(header)) if VALUE_HEADERS.is_match(&header) => Some(header),
        _ => None,
    }
}

pub fn is_structured(header: &str) -> bool {
    STRUCTURED_HEADERS.is_match(header)
}
