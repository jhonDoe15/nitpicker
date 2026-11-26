//! Which parameter a changed value belongs to: through member chains, assertions and local aliases, and
//! whether that parameter is one a caller expects to see changed.
use super::copies::{is_context_parameter, is_fresh_container, is_off_path, is_reassigned_to_copy, writes};
use super::{ASSERTIONS, Scope, callee_name, is_function, name_of, unwrap, wrapped};
use crate::typescript::rules::support::scope::{Def, DefKind};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::caller_objects::is_caller_object;
use oxc_semantic::SymbolId;

const DRAFT_CALLEES: &[&str] = &["produce", "produceWithPatches", "createSlice", "createReducer", "useImmer", "useImmerReducer"];
const ACCUMULATING_CALLEES: &[&str] = &["reduce", "reduceRight"];

/// `crossesProperty`: a member of a project data object is still the caller's value.
pub fn crosses_property(scope: &Scope, member: Node) -> bool {
    let Some(object) = member.node("object") else { return false };
    is_caller_object(&mut scope.types.borrow_mut(), object, name_of(member.node("property")).as_deref())
}

fn chain_root<'v>(scope: &Scope<'_, '_, 'v>, node: Node<'v>) -> Option<Node<'v>> {
    let mut current = node;
    loop {
        if let Some(inner) = wrapped(current, ASSERTIONS) {
            current = inner;
        } else if current.is("MemberExpression") && (current.flag("computed") || crosses_property(scope, current)) {
            current = current.node("object")?;
        } else {
            break;
        }
    }
    current.is("Identifier").then_some(current)
}

fn alias_source(node: Node) -> Option<Node> {
    let mut current = node;
    loop {
        let inner = unwrap(current, ASSERTIONS);
        if inner.is("LogicalExpression") && matches!(inner.text("operator").as_deref(), Some("??" | "||")) {
            current = inner.node("left")?;
        } else {
            break;
        }
    }
    let source = unwrap(current, ASSERTIONS);
    source.is("Identifier").then_some(source)
}

fn aliased_variable(scope: &Scope, symbol: SymbolId, mutation: Node) -> Option<SymbolId> {
    let definition = scope.scopes.defs(symbol).into_iter().next()?;
    let declarator = (definition.kind == DefKind::Variable).then_some(definition.node)?;
    let fixed = writes(scope, symbol).iter().all(|write| write.init || is_off_path(write.identifier, mutation));
    let init = declarator.node("init")?;
    if !declarator.node("id").is_some_and(|id| id.is("Identifier")) || !fixed {
        return None;
    }
    scope.scopes.variable_named(alias_source(init)?)
}

fn aliased_parameter(scope: &Scope, symbol: SymbolId, mutation: Node) -> SymbolId {
    let mut seen = vec![symbol];
    let mut index = 0;
    while index < seen.len() {
        if let Some(next) = aliased_variable(scope, seen[index], mutation)
            && !seen.contains(&next)
        {
            seen.push(next);
        }
        index += 1;
    }
    *seen.last().unwrap_or(&symbol)
}

fn first_declared(owner: Node) -> Option<Node> {
    if let Some(id) = owner.node("id") {
        return Some(id);
    }
    let first = owner.list("params").first().copied().flatten()?;
    let name = if first.is("AssignmentPattern") { first.node("left")? } else { first };
    name.is("Identifier").then_some(name)
}

fn is_named_reducer(scope: &Scope, owner: Node) -> bool {
    let Some(symbol) = first_declared(owner).and_then(|id| scope.scopes.variable_named(id)) else { return false };
    scope.scopes.references(symbol).iter().any(|reference| {
        reference.identifier.parent().is_some_and(|call| {
            call.is("CallExpression")
                && call.list("arguments").first().copied().flatten() == Some(reference.identifier)
                && callee_name(call).is_some_and(|name| ACCUMULATING_CALLEES.contains(&name.as_str()))
        })
    })
}

fn is_accumulator(scope: &Scope, owner: Node, name: Node) -> bool {
    let first = owner.list("params").first().copied().flatten();
    let first_name = first.and_then(|first| if first.is("AssignmentPattern") { first.node("left") } else { Some(first) });
    let defaulted = name.parent().is_some_and(|initial| initial.is("AssignmentPattern") && initial.node("right").is_some_and(is_fresh_container));
    let inline_reducer = owner.parent().is_some_and(|call| {
        call.is("CallExpression")
            && call.nodes("arguments").contains(&owner)
            && callee_name(call).is_some_and(|called| ACCUMULATING_CALLEES.contains(&called.as_str()))
    }) && first_name == Some(name);
    let named_reducer = first_name == Some(name) && owner.is("FunctionDeclaration") && is_named_reducer(scope, owner);
    defaulted || inline_reducer || named_reducer
}

fn is_draft(owner: Node) -> bool {
    owner.ancestors().any(|ancestor| ancestor.is("CallExpression") && callee_name(ancestor).is_some_and(|name| DRAFT_CALLEES.contains(&name.as_str())))
}

fn is_private_member(owner: Node) -> bool {
    owner.parent().is_some_and(|member| {
        matches!(member.kind(), "MethodDefinition" | "PropertyDefinition")
            && (member.text("accessibility").as_deref() == Some("private") || member.node("key").is_some_and(|key| key.is("PrivateIdentifier")))
    })
}

fn declared_name(statement: Node) -> Option<String> {
    let declaration = if is_export(statement) { statement.node("declaration")? } else { statement };
    if declaration.is("VariableDeclaration") {
        return name_of(declaration.list("declarations").first().copied().flatten().and_then(|first| first.node("id")));
    }
    name_of(declaration.node("id"))
}

fn is_export(node: Node) -> bool {
    matches!(node.kind(), "ExportNamedDeclaration" | "ExportDefaultDeclaration")
}

fn is_exported_statement(program: Node, statement: Node) -> bool {
    if is_export(statement) {
        return true;
    }
    let Some(name) = declared_name(statement) else { return false };
    program.is("Program")
        && program.nodes("body").iter().any(|other| {
            other.is("ExportNamedDeclaration")
                && other.get("source") == crate::typescript::rules::support::view::Value::Null
                && other.nodes("specifiers").iter().any(|specifier| name_of(specifier.node("local")).as_deref() == Some(name.as_str()))
        })
}

pub fn is_internal_function(owner: Node) -> bool {
    let nested = owner.ancestors().any(is_function);
    let statement = owner.ancestors().find(|ancestor| ancestor.parent().is_some_and(|parent| parent.is("Program")));
    let exported = statement.is_some_and(|statement| statement.parent().is_some_and(|program| is_exported_statement(program, statement)));
    nested || is_private_member(owner) || !exported
}

/// `changedParameter`: the parameter whose value `target` is, when changing it changes a caller's value.
pub fn changed_parameter<'v>(scope: &Scope<'_, '_, 'v>, target: Node<'v>, mutation: Node<'v>, include_internal: bool) -> Option<Def<'v>> {
    let root = chain_root(scope, target)?;
    let named = scope.scopes.variable_named(root)?;
    let symbol = aliased_parameter(scope, named, mutation);
    let definition = scope.scopes.defs(symbol).into_iter().next()?;
    if definition.kind != DefKind::Parameter
        || !is_function(definition.node)
        || definition.name.parent().is_some_and(|parent| parent.is("RestElement"))
    {
        return None;
    }
    let owner = definition.node;
    let exempt = (!include_internal && is_internal_function(owner))
        || is_accumulator(scope, owner, definition.name)
        || is_draft(owner)
        || is_context_parameter(definition.name)
        || is_reassigned_to_copy(scope, symbol, mutation);
    (!exempt).then_some(definition)
}
