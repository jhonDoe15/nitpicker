//! The lazy relation an expression of the file reads: a property access (`order.customer`), a property
//! destructured from an item (`lazyBinding`), or a parameter's property a helper awaits (`helperRelation`).
use super::schema::{Access, Relation, Schemas, decorated_relation, source_of, ts_lazy_relation};
use crate::typescript::rules::effects::callees::declarations::{callee_declaration, function_like, nodes};
use crate::typescript::rules::effects::views::At;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::tables::kind as k;
use std::collections::VecDeque;

pub struct HelperRelation {
    pub relation: Relation,
    pub access: String,
}

fn compiler_node(types: &mut Types, kind: u32, node: Node) -> Option<At> {
    let found = types.handle_at(Some(kind), node.start(), node.end()).and_then(|handle| At::of(types, &handle));
    if found.is_none() {
        types.refuse("the compiler has no node for an expression of the file");
    }
    found
}

/// `lazyBinding`: the relation named `name` of the type of `source`, an identifier.
pub fn lazy_binding(types: &mut Types, schemas: &mut Schemas, source: Node, name: &str) -> Option<Relation> {
    let expression = compiler_node(types, k::IDENTIFIER, source)?;
    let handles = types.property_declarations_named(&expression.handle(), name);
    let declarations = nodes(types, &handles);
    decorated_relation(types, schemas, &Access { expression: &expression, name, declarations })
}

/// `lazyRelation`: the relation a plain member access reads.
pub fn lazy_relation(types: &mut Types, schemas: &mut Schemas, member: Node) -> Option<Relation> {
    if !member.is("MemberExpression") || member.flag("computed") {
        return None;
    }
    let compiled = compiler_node(types, k::PROPERTY_ACCESS_EXPRESSION, member)?;
    ts_lazy_relation(types, schemas, &compiled)
}

fn callee_name(types: &mut Types, reference: Node) -> Option<At> {
    if reference.is("Identifier") {
        return compiler_node(types, k::IDENTIFIER, reference);
    }
    if reference.is("MemberExpression") && !reference.flag("computed") {
        return compiler_node(types, k::PROPERTY_ACCESS_EXPRESSION, reference)?.child("name");
    }
    None
}

fn awaited_relation(types: &mut Types, schemas: &mut Schemas, function: &At, index: usize) -> Option<HelperRelation> {
    let name = function.listed("parameters").get(index).and_then(|parameter| parameter.child("name")).filter(|name| name.is(k::IDENTIFIER))?;
    let parameter = types.symbol_at_handle(&name.handle())?;
    let mut pending = VecDeque::from(function.child("body").into_iter().collect::<Vec<_>>());
    while let Some(node) = pending.pop_front() {
        let member = node.child("expression").filter(|member| node.is(k::AWAIT_EXPRESSION) && member.is(k::PROPERTY_ACCESS_EXPRESSION));
        if let Some(member) = member {
            let receiver = member.child("expression").and_then(|receiver| types.symbol_at_handle(&receiver.handle()));
            if receiver.is_some_and(|receiver| receiver.id == parameter.id) {
                if let Some(relation) = ts_lazy_relation(types, schemas, &member) {
                    return Some(HelperRelation { relation, access: source_of(&member) });
                }
            }
        }
        if types.refused.is_some() {
            return None;
        }
        pending.extend(node.children());
    }
    None
}

/// `helperRelation`: the lazy relation the function a reference names awaits on its parameter `index`.
pub fn helper_relation(types: &mut Types, schemas: &mut Schemas, reference: Node, index: usize) -> Option<HelperRelation> {
    let name = callee_name(types, reference)?;
    let declaration = callee_declaration(types, &name)?;
    let function = function_like(&declaration)?;
    awaited_relation(types, schemas, &function, index)
}
