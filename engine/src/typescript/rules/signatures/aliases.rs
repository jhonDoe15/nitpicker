//! Changes that reach a parameter another way: through a local helper that changes its own parameter, or
//! through a shallow copy whose nested objects are still the caller's.
use super::copies::{is_object_assign, is_reassigned_from_call, writes};
use super::mutations::{Mutation, mutation_at};
use super::owners::{changed_parameter, is_internal_function};
use super::{ASSERTION_FORMS, Scope, is_function, name_of, unwrap};
use crate::typescript::rules::support::scope::{Def, DefKind};
use crate::typescript::rules::support::view::Node;
use std::collections::{HashMap, HashSet};

pub struct HelperCall<'v> {
    pub callee: String,
    pub argument: Node<'v>,
    pub parameter: Def<'v>,
}

/// `resolveFunction`: the function a called name stands for, declared once as a function or a `const`.
fn resolve_function<'v>(scope: &Scope<'_, '_, 'v>, callee: Option<Node<'v>>) -> Option<Node<'v>> {
    let callee = callee.filter(|callee| callee.is("Identifier"))?;
    let mut definitions = scope.scopes.defs(scope.scopes.variable_named(callee)?);
    if definitions.len() != 1 {
        return None;
    }
    let definition = definitions.remove(0);
    match definition.kind {
        DefKind::FunctionName => Some(definition.node),
        DefKind::Variable if definition.node.parent().and_then(|declaration| declaration.text("kind")).as_deref() == Some("const") => {
            definition.node.node("init").filter(|init| is_function(*init))
        }
        _ => None,
    }
}

fn parameter_index(function: Node, name: Node) -> Option<usize> {
    function.list("params").iter().position(|param| {
        let param = param.and_then(|param| if param.is("AssignmentPattern") { param.node("left") } else { Some(param) });
        param == Some(name)
    })
}

fn mutated_indexes(scope: &Scope, function: Node) -> HashSet<usize> {
    let mut indexes = HashSet::new();
    let Some(body) = function.node("body") else { return indexes };
    for node in body.descendants() {
        let Some(mutation) = mutation_at(scope, node) else { continue };
        let Some(definition) = changed_parameter(scope, mutation.object, node, true) else { continue };
        if definition.node == function {
            indexes.extend(parameter_index(function, definition.name));
        }
    }
    indexes
}

/// `helperMutation`: a call that hands a parameter to a local, top-level helper that changes it in place.
pub fn helper_mutation<'v>(scope: &Scope<'_, '_, 'v>, call: Node<'v>, cache: &mut HashMap<u32, HashSet<usize>>) -> Option<HelperCall<'v>> {
    let helper = resolve_function(scope, call.node("callee"))?;
    if !is_function(helper) || !is_internal_function(helper) || helper.ancestors().any(is_function) {
        return None;
    }
    if !cache.contains_key(&helper.index) {
        let found = mutated_indexes(scope, helper);
        cache.insert(helper.index, found);
    }
    let mutated = cache.get(&helper.index)?.clone();
    for (position, argument) in call.list("arguments").into_iter().enumerate() {
        let Some(argument) = argument.filter(|argument| mutated.contains(&position) && !argument.is("SpreadElement")) else { continue };
        if let Some(parameter) = changed_parameter(scope, argument, call, false)
            && !is_reassigned_from_call(call, argument)
        {
            return Some(HelperCall { callee: scope.source(call.node("callee")?).to_string(), argument, parameter });
        }
    }
    None
}

struct Copy<'v> {
    sources: Vec<Node<'v>>,
    own: HashSet<String>,
}

fn object_copy(node: Node) -> Copy {
    let mut copy = Copy { sources: Vec::new(), own: HashSet::new() };
    for property in node.nodes("properties") {
        if property.is("SpreadElement") {
            copy.sources.extend(property.node("argument"));
        } else {
            copy.own.insert(name_of(property.node("key")).unwrap_or_else(|| "*".to_string()));
        }
    }
    copy
}

fn returned_values(function: Node) -> Vec<Node> {
    let Some(body) = function.node("body") else { return Vec::new() };
    if !body.is("BlockStatement") {
        return vec![body];
    }
    if !body.nodes("body").last().is_some_and(|last| last.is("ReturnStatement")) {
        return Vec::new();
    }
    let mut values = Vec::new();
    let mut pending = vec![body];
    while let Some(node) = pending.pop() {
        if node.is("ReturnStatement") {
            values.extend(node.node("argument"));
        }
        if !is_function(node) {
            pending.extend(node.children().into_iter().rev());
        }
    }
    values
}

fn helper_copy<'v>(scope: &Scope<'_, '_, 'v>, call: Node<'v>) -> Option<Copy<'v>> {
    let helper = resolve_function(scope, call.node("callee")).filter(|helper| is_function(*helper))?;
    let copies: Vec<Option<Copy>> = returned_values(helper)
        .into_iter()
        .map(|value| Some(unwrap(value, ASSERTION_FORMS)).filter(|value| value.is("ObjectExpression")).map(object_copy))
        .collect();
    if copies.is_empty() || copies.iter().any(|copy| copy.as_ref().is_none_or(|copy| !copy.own.is_empty())) {
        return None;
    }
    let params = helper.list("params");
    let arguments = call.list("arguments");
    let sources = copies.into_iter().flatten().flat_map(|copy| copy.sources).filter_map(|source| {
        let wanted = name_of(Some(source))?;
        let index = params.iter().position(|param| param.is_some_and(|param| param.is("Identifier") && name_of(Some(param)).as_deref() == Some(wanted.as_str())))?;
        arguments.get(index).copied().flatten()
    });
    Some(Copy { sources: sources.collect(), own: HashSet::new() })
}

fn copy_of<'v>(scope: &Scope<'_, '_, 'v>, init: Node<'v>) -> Option<Copy<'v>> {
    let value = unwrap(init, ASSERTION_FORMS);
    if value.is("ObjectExpression") {
        return Some(object_copy(value));
    }
    if !value.is("CallExpression") {
        return None;
    }
    let arguments = value.list("arguments");
    let target = arguments.first().copied().flatten();
    if is_object_assign(value) && let Some(target) = target.filter(|target| target.is("ObjectExpression")) {
        let mut base = object_copy(target);
        base.sources.extend(arguments.into_iter().skip(1).flatten());
        return Some(base);
    }
    helper_copy(scope, value)
}

fn chain(object: Node) -> Option<(Node, String)> {
    let mut members = vec![unwrap(object, ASSERTION_FORMS)];
    while let Some(current) = members.last().copied().filter(|current| current.is("MemberExpression")) {
        members.push(unwrap(current.node("object")?, ASSERTION_FORMS));
    }
    let root = *members.last()?;
    let innermost = members.len().checked_sub(2).map(|index| members[index]);
    let first = innermost.filter(|member| member.is("MemberExpression") && !member.flag("computed")).and_then(|member| name_of(member.node("property")));
    (root.is("Identifier")).then_some(root).zip(first)
}

fn reassigned(scope: &Scope, root: Node, first: &str) -> bool {
    let Some(symbol) = scope.scopes.variable_named(root) else { return false };
    scope.scopes.references(symbol).iter().any(|reference| {
        let Some(member) = reference.identifier.parent() else { return false };
        member.is("MemberExpression")
            && name_of(member.node("property")).as_deref() == Some(first)
            && member.parent().is_some_and(|assigned| assigned.is("AssignmentExpression") && assigned.node("left") == Some(member))
    })
}

/// `nestedCopyWrite`: a write into a nested object of a shallow copy, which is still the caller's object.
pub fn nested_copy_write<'v>(scope: &Scope<'_, '_, 'v>, mutation: &Mutation<'v>, node: Node<'v>) -> Option<Def<'v>> {
    let (root, first) = chain(mutation.object)?;
    let symbol = scope.scopes.variable_named(root)?;
    let declarator = scope.scopes.defs(symbol).into_iter().next()?.node;
    let fixed = writes(scope, symbol).iter().all(|write| write.init);
    let init = declarator.node("init").filter(|_| declarator.is("VariableDeclarator"))?;
    if !mutation.object.is("MemberExpression") || !fixed {
        return None;
    }
    let copy = copy_of(scope, init)?;
    if copy.own.contains(&first) || reassigned(scope, root, &first) {
        return None;
    }
    copy.sources.into_iter().find_map(|source| changed_parameter(scope, source, node, false))
}
