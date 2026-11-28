//! `arrays/array-bounds.mts`: whether an expression holds an array whose length is only known at run time, and
//! whether the code around a call checks that array's size or splits it into chunks first.
use super::fixed::is_fixed_collection;
use crate::typescript::rules::queries::chains::chain_steps;
use crate::typescript::rules::security_values::{call_name, defs, is_function_node, member_name, unwrapped};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::database::modules::ModuleScope;
use regex::Regex;
use std::sync::LazyLock;

const FLAT_MAP: &str = "flatMap";
const ARRAY_MAKERS: [&str; 8] = ["map", "filter", FLAT_MAP, "flat", "concat", "split", "toSorted", "toReversed"];
const ARRAY_STATICS: [&str; 4] = ["from", "keys", "values", "entries"];
const SIZE_KEEPING: [&str; 7] = ["map", "filter", FLAT_MAP, "toSorted", "toReversed", "sort", "reverse"];
const ITERATING: [&str; 6] = ["map", "forEach", FLAT_MAP, "reduce", "every", "some"];
const EVIDENT_TYPES: [&str; 4] = ["Identifier", "MemberExpression", "CallExpression", "ArrayExpression"];
const ARRAY_TYPE_NAMES: [&str; 2] = ["Array", "ReadonlyArray"];
const SIZE_MEMBERS: [&str; 2] = ["length", "size"];
const MAX_SOURCES: usize = 6;
const EMPTY_CHECKS: [&str; 4] = ["isEmpty", "isNotEmpty", "isNonEmpty", "isEmptyArray"];
const QUERY_STEPS: [&str; 5] = ["selectFrom", "select", "from", "createQueryBuilder", "subQuery"];

static CHUNK_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)chunk|batch|partition|paginat").expect("pattern"));

fn has(names: &[&str], name: Option<String>) -> bool {
    name.is_some_and(|name| names.contains(&name.as_str()))
}

fn annotation_of<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> Option<Node<'s>> {
    let name = defs(scopes, identifier).into_iter().next()?.name;
    let annotation = without_parentheses(name.node("typeAnnotation").filter(|_| name.is("Identifier"))?.node("typeAnnotation")?);
    if annotation.is("TSTypeOperator") { annotation.node("typeAnnotation").map(without_parentheses) } else { Some(annotation) }
}

/// typescript-estree leaves parenthesized types out of the tree; the engine's view keeps them.
fn without_parentheses(mut node: Node) -> Node {
    while let Some(inner) = node.node("typeAnnotation").filter(|_| node.is("TSParenthesizedType")) {
        node = inner;
    }
    node
}

fn has_array_annotation<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> bool {
    let Some(annotation) = annotation_of(scopes, identifier) else { return false };
    let reference = annotation.node("typeName").filter(|_| annotation.is("TSTypeReference"));
    annotation.is("TSArrayType") || has(&ARRAY_TYPE_NAMES, reference.and_then(|reference| reference.name()).map(|name| name.into_owned()))
}

/// `constInit`: what a `const` name is declared with.
pub fn const_init<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> Option<Node<'s>> {
    let definition = defs(scopes, identifier).into_iter().next().filter(|definition| definition.kind == DefKind::Variable)?;
    let direct = definition.node.node("id").is_some_and(|id| id.is("Identifier"));
    let constant = definition.node.parent().and_then(|declaration| declaration.text("kind")).as_deref() == Some("const");
    if direct && constant { definition.node.node("init").map(unwrapped) } else { None }
}

fn is_array_making(node: Option<Node>) -> bool {
    let Some(target) = node.map(unwrapped) else { return false };
    if target.is("ArrayExpression") {
        return target.list("elements").iter().flatten().any(|element| element.is("SpreadElement"));
    }
    let Some(callee) = target.node("callee").map(unwrapped).filter(|callee| target.is("CallExpression") && callee.is("MemberExpression")) else { return false };
    let owner = callee.node("object").map(unwrapped);
    let is_static = owner.is_some_and(|owner| owner.is("Identifier") && matches!(owner.name().as_deref(), Some("Array" | "Object")));
    has(if is_static { &ARRAY_STATICS } else { &ARRAY_MAKERS }, member_name(callee))
}

fn is_subquery<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> bool {
    let target = unwrapped(node);
    if is_function_node(target) || target.is("TaggedTemplateExpression") {
        return true;
    }
    let value = if target.is("Identifier") { const_init(scopes, target).unwrap_or(target) } else { target };
    chain_steps(value).steps.iter().any(|step| has(&QUERY_STEPS, step.name.clone()))
}

/// `isRuntimeArray`: whether `node` holds an array whose length is only known at run time.
pub fn is_runtime_array<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>, needs_evidence: bool) -> bool {
    let target = unwrapped(node);
    if is_subquery(scopes, target) || is_fixed_collection(scopes, target) {
        return false;
    }
    if target.is("ArrayExpression") && !is_array_making(Some(target)) {
        return false;
    }
    if !needs_evidence {
        return EVIDENT_TYPES.contains(&target.kind());
    }
    if target.is("Identifier") {
        return has_array_annotation(scopes, target) || is_array_making(const_init(scopes, target));
    }
    is_array_making(Some(target))
}

fn same_size_source(node: Node) -> Option<Node> {
    if node.is("CallExpression") {
        let callee = unwrapped(node.node("callee")?);
        return if callee.is("MemberExpression") && has(&SIZE_KEEPING, member_name(callee)) { callee.node("object").map(unwrapped) } else { None };
    }
    if node.is("ArrayExpression") {
        let elements = node.list("elements");
        let spread = match elements.as_slice() {
            [Some(only)] if only.is("SpreadElement") => Some(*only),
            _ => None,
        };
        return spread.and_then(|spread| spread.node("argument")).map(unwrapped);
    }
    let callee = node.node("callee").filter(|callee| node.is("NewExpression") && callee.is("Identifier"))?;
    if callee.name().as_deref() != Some("Set") {
        return None;
    }
    node.nodes("arguments").first().copied().map(unwrapped)
}

fn sources_of<'s>(module: &ModuleScope<'_, '_, 's>, node: Node<'s>) -> Vec<String> {
    let mut pending = vec![unwrapped(node)];
    let mut at = 0;
    while at < pending.len() {
        let current = pending[at];
        at += 1;
        let next = if current.is("Identifier") { const_init(module.scopes, current) } else { same_size_source(current) };
        if let Some(next) = next.filter(|_| pending.len() < MAX_SOURCES) {
            pending.push(next);
        }
    }
    pending.into_iter().map(|current| module.source(current).to_string()).collect()
}

fn checks_size(module: &ModuleScope, function: Node, texts: &[String]) -> bool {
    let named = |node: Option<Node>| node.is_some_and(|node| texts.iter().any(|text| text == module.source(unwrapped(node))));
    let body = function.node("body").map(|body| body.descendants()).unwrap_or_default();
    body.into_iter().any(|child| {
        let sized = child.is("MemberExpression") && has(&SIZE_MEMBERS, member_name(child)) && named(child.node("object"));
        let arguments = child.nodes("arguments");
        let checked = child.is("CallExpression") && has(&EMPTY_CHECKS, call_name(child)) && arguments.len() == 1 && named(arguments.first().copied());
        sized || checked
    })
}

fn is_chunk_call(node: Option<Node>) -> bool {
    let target = node.map(unwrapped).filter(|target| target.is("CallExpression"));
    target.is_some_and(|target| CHUNK_NAME.is_match(&call_name(target).unwrap_or_default()))
}

fn chunked_callback<'s>(scopes: &Scopes<'_, 's>, function: Node<'s>) -> bool {
    let Some(call) = function.parent().filter(|call| call.is("CallExpression") && call.nodes("arguments").contains(&function)) else { return false };
    if is_chunk_call(Some(call)) {
        return true;
    }
    let Some(callee) = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression") && has(&ITERATING, member_name(*callee))) else { return false };
    let Some(owner) = callee.node("object").map(unwrapped) else { return false };
    is_chunk_call(Some(owner)) || (owner.is("Identifier") && is_chunk_call(const_init(scopes, owner)))
}

fn chunked_loop(node: Node) -> bool {
    node.ancestors().any(|ancestor| ancestor.is("ForOfStatement") && is_chunk_call(ancestor.node("right")))
}

fn decorator_name(decorator: Node) -> String {
    let Some(expression) = decorator.node("expression").map(unwrapped) else { return String::new() };
    let callee = if expression.is("CallExpression") { expression.node("callee").map(unwrapped) } else { Some(expression) };
    callee.filter(|callee| callee.is("Identifier")).and_then(|callee| callee.name()).map(|name| name.into_owned()).unwrap_or_default()
}

fn decorated(function: Node) -> bool {
    let method = function.parent().filter(|parent| parent.is("MethodDefinition"));
    method.is_some_and(|method| method.nodes("decorators").into_iter().any(|decorator| CHUNK_NAME.is_match(&decorator_name(decorator))))
}

/// `isBounded`: the code around `call` checks the array's size or splits it into chunks first.
pub fn is_bounded<'s>(module: &ModuleScope<'_, '_, 's>, call: Node<'s>, array: Node<'s>) -> bool {
    let texts = sources_of(module, array);
    chunked_loop(call)
        || call
            .ancestors()
            .filter(|ancestor| is_function_node(*ancestor))
            .any(|function| checks_size(module, function, &texts) || chunked_callback(module.scopes, function) || decorated(function))
}
