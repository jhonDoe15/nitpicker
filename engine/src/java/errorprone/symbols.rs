//! Which variable a name or a field access stands for, as a value two uses can be compared by.
use super::vars::{Named, named};
use super::Context;
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum VarSym {
    /// A field by its declaring class and name.
    Field(String, String),
    /// A local variable by the node of its declarator.
    Local(usize),
    /// A parameter, resource, pattern variable or other variable that is no local variable.
    Other(usize),
}

fn field_of_declarator(context: &Context, declarator: Node) -> Option<VarSym> {
    let class = enclosing_type(context.file, context.resolver.scope, declarator)?;
    Some(VarSym::Field(class, context.text(declarator.child_by_field_name("name")?).to_string()))
}

fn plain(context: &Context, name: Node) -> Option<VarSym> {
    match named(context, name) {
        Some(Named::Variable(declarator)) => match crate::engine::source::parent(declarator).map(|holder| holder.kind()) {
            Some("field_declaration" | "constant_declaration") => field_of_declarator(context, declarator),
            Some("local_variable_declaration") => Some(VarSym::Local(declarator.id())),
            _ => Some(VarSym::Other(declarator.id())),
        },
        Some(Named::Other(declaration)) => Some(VarSym::Other(declaration.id())),
        None => match context.resolver.binding(name, context.text(name))? {
            Binding::Field(_, info, field) => Some(VarSym::Field(info.name.clone(), field.name.clone())),
            Binding::Local(_) => None,
        },
    }
}

fn selected(context: &Context, access: Node) -> Option<VarSym> {
    let object = access.child_by_field_name("object")?;
    let name = context.text(access.child_by_field_name("field")?);
    let class = if object.kind() == "this" {
        enclosing_type(context.file, context.resolver.scope, access)?
    } else {
        match context.resolver.receiver(object)? {
            Receiver::Static(owner) | Receiver::Value(Type::Class(owner, _)) => owner,
            _ => return None,
        }
    };
    let (info, field) = context.resolver.index.field(&class, name)?;
    Some(VarSym::Field(info.name.clone(), field.name.clone()))
}

/// The variable an expression names, when it names one.
pub fn variable_symbol(context: &Context, expression: Node) -> Option<VarSym> {
    match expression.kind() {
        "identifier" => plain(context, expression),
        "field_access" => selected(context, expression),
        "parenthesized_expression" => variable_symbol(context, expression.named_child(0)?),
        _ => None,
    }
}
