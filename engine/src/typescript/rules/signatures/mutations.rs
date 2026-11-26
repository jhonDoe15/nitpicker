//! Changes made in place: a mutating method call, a write to an index or a property, `delete`, and
//! `Object.assign` or `Object.defineProperty` on an object that exists.
use super::copies::{is_object_assign, is_object_define};
use super::{ASSERTIONS, Scope, name_of, unwrap};
use crate::typescript::rules::domain::mutating_methods::{mutated_owner, static_name};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::caller_objects::is_caller_object;
use crate::typescript::types::tables::type_flags;

#[derive(Clone, Copy, PartialEq)]
pub enum Kind {
    Parameter,
    Property,
}

pub struct Mutation<'v> {
    pub object: Node<'v>,
    pub kind: Kind,
    pub name: String,
}

fn is_mutable_indexed(scope: &Scope, node: Node) -> bool {
    let mut types = scope.types.borrow_mut();
    let Some(kind) = types.type_at(node.start(), node.end()) else { return false };
    let parts = if kind.flags & type_flags::UNION != 0 { types.parts(&kind).to_vec() } else { vec![kind] };
    parts.iter().any(|part| types.apparent(part).is_some_and(|apparent| types.has_mutable_index(&apparent)))
}

fn write_mutation<'v>(scope: &Scope<'_, '_, 'v>, written: Node<'v>) -> Option<Mutation<'v>> {
    let target = unwrap(written, ASSERTIONS);
    if !target.is("MemberExpression") {
        return None;
    }
    let object = target.node("object")?;
    let indexed = target.flag("computed") || name_of(target.node("property")).as_deref() == Some("length");
    if indexed && is_mutable_indexed(scope, object) {
        return Some(Mutation { object, kind: Kind::Parameter, name: format!("{}[…]", scope.flat(object)) });
    }
    let property = static_name(target, &mut scope.types.borrow_mut())?;
    is_caller_object(&mut scope.types.borrow_mut(), object, Some(&property)).then(|| Mutation { object, kind: Kind::Property, name: scope.flat(target) })
}

fn assign_mutation<'v>(scope: &Scope<'_, '_, 'v>, call: Node<'v>) -> Option<Mutation<'v>> {
    let arguments = call.list("arguments");
    let first = unwrap(arguments.first().copied().flatten()?, ASSERTIONS);
    if arguments.len() < 2 || first.is("SpreadElement") || !is_caller_object(&mut scope.types.borrow_mut(), first, None) {
        return None;
    }
    let callee = scope.flat(call.node("callee")?);
    Some(Mutation { object: first, kind: Kind::Property, name: format!("{callee}({}, …)", scope.flat(first)) })
}

fn call_mutation<'v>(scope: &Scope<'_, '_, 'v>, call: Node<'v>) -> Option<Mutation<'v>> {
    if is_object_assign(call) || is_object_define(call) {
        return assign_mutation(scope, call);
    }
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    let mut types = scope.types.borrow_mut();
    let method = static_name(callee, &mut types)?;
    mutated_owner(callee, &method, &mut types)?;
    drop(types);
    let object = callee.node("object")?;
    Some(Mutation { object, kind: Kind::Parameter, name: format!("{}.{method}", scope.flat(object)) })
}

/// `mutationAt`: the change a call, an assignment, an update or a `delete` makes in place.
pub fn mutation_at<'v>(scope: &Scope<'_, '_, 'v>, node: Node<'v>) -> Option<Mutation<'v>> {
    match node.kind() {
        "CallExpression" => call_mutation(scope, node),
        "AssignmentExpression" => write_mutation(scope, node.node("left")?),
        "UpdateExpression" => write_mutation(scope, node.node("argument")?),
        "UnaryExpression" if node.text("operator").as_deref() == Some("delete") => write_mutation(scope, node.node("argument")?),
        _ => None,
    }
}
