//! The type SpotBugs works with for a value. It reads compiled code, so it knows a field or a local variable by what
//! was stored in it rather than by how it was declared: a `Map` field only ever given `new ConcurrentHashMap<>()` is
//! a `ConcurrentHashMap` to it.
use super::Context;
use crate::engine::source::{ancestor, children, parent, walk};
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_types;
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use tree_sitter::Node;

pub(super) const BODIES: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "lambda_expression", "static_initializer"];
const DEPTH: usize = 6;

pub type Stores<'t> = HashMap<(String, String), Vec<Node<'t>>>;

/// What the file's fields hold, worked out once: every value stored in each, how many stores each gets, and the type
/// SpotBugs sees in each at a depth of reading.
#[derive(Default)]
pub struct Memo<'a> {
    stores: RefCell<Option<Rc<Stores<'a>>>>,
    pub counts: std::cell::OnceCell<HashMap<(String, String), usize>>,
    types: RefCell<HashMap<(String, String, String, usize), Option<Type>>>,
}

pub use super::fields::field_key;

/// Every value the file stores in a field, by field, worked out once.
pub fn field_stores<'a>(context: &Context<'a>) -> Rc<Stores<'a>> {
    if let Some(known) = context.memo.stores.borrow().as_ref() {
        return known.clone();
    }
    let mut stored: Stores = HashMap::new();
    walk(context.file.tree.root_node(), |node| match node.kind() {
        "variable_declarator" if parent(node).is_some_and(|holder| holder.kind() == "field_declaration") => {
            let class = enclosing_types(context.resolver.scope, node).into_iter().next();
            if let (Some(class), Some(name), Some(value)) = (class, node.child_by_field_name("name"), node.child_by_field_name("value")) {
                stored.entry((class, context.text(name).to_string())).or_default().push(value);
            }
        }
        "assignment_expression" => {
            let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
            if let Some(key) = field_key(context, left).filter(|_| !super::compare::reach::dead(context, node)) {
                stored.entry(key).or_default().push(right);
            }
        }
        _ => {}
    });
    let stored = Rc::new(stored);
    *context.memo.stores.borrow_mut() = Some(stored.clone());
    stored
}

fn same(all: Vec<Option<Type>>) -> Option<Type> {
    let mut all = all.into_iter();
    let first = all.next()??;
    all.all(|next| next.as_ref().map(Type::name) == Some(first.name())).then_some(first)
}

fn field_type(context: &Context, key: &(String, String), declared: Type, depth: usize) -> Option<Type> {
    let memo = (key.0.clone(), key.1.clone(), format!("{declared:?}"), depth);
    if let Some(known) = context.memo.types.borrow().get(&memo) {
        return known.clone();
    }
    let found = field_type_at(context, key, declared, depth);
    context.memo.types.borrow_mut().insert(memo, found.clone());
    found
}

fn field_type_at(context: &Context, key: &(String, String), declared: Type, depth: usize) -> Option<Type> {
    if !context.classes.contains_key(&key.0) || context.literals.contains(&key.0) {
        return Some(declared);
    }
    let stores = field_stores(context);
    let values: Vec<Node> = stores.get(key).into_iter().flatten().map(|value| unwrap(*value)).filter(|value| value.kind() != "null_literal").collect();
    if values.is_empty() {
        return stores.get(key).is_none().then_some(declared);
    }
    same(values.into_iter().map(|value| observed_at(context, value, depth + 1)).collect()).or(Some(declared))
}

fn caught(context: &Context, usage: Node, name: &str) -> bool {
    let mut at = parent(usage);
    while let Some(node) = at {
        if node.kind() == "catch_clause" {
            let named = children(node)
                .into_iter()
                .filter(|part| part.kind() == "catch_formal_parameter")
                .any(|formal| formal.child_by_field_name("name").is_some_and(|declared| context.text(declared) == name));
            if named {
                return true;
            }
        }
        at = parent(node);
    }
    false
}

/// Whether a name is a parameter declared with a type variable: SpotBugs reads its type from the generic signature.
pub fn generic_parameter(context: &Context, usage: Node, name: &str) -> bool {
    let Some(method) = ancestor(usage, &["method_declaration", "constructor_declaration"]) else { return false };
    let Some(parameters) = method.child_by_field_name("parameters") else { return false };
    let Some(written) = children(parameters)
        .into_iter()
        .filter(|parameter| parameter.kind() == "formal_parameter")
        .find(|parameter| parameter.child_by_field_name("name").is_some_and(|declared| context.text(declared) == name))
        .and_then(|parameter| parameter.child_by_field_name("type"))
    else {
        return false;
    };
    let written = context.text(written);
    let mut holder = Some(method);
    while let Some(at) = holder {
        let listed = at.child_by_field_name("type_parameters").or_else(|| children(at).into_iter().find(|part| part.kind() == "type_parameters"));
        let declares = listed.is_some_and(|listed| {
            children(listed)
                .into_iter()
                .filter_map(|parameter| parameter.named_child(0))
                .any(|declared| declared.kind() == "type_identifier" && context.text(declared) == written)
        });
        if declares {
            return true;
        }
        holder = parent(at);
    }
    false
}

const BRANCHES: &[&str] = &[
    "if_statement",
    "switch_block_statement_group",
    "switch_rule",
    "while_statement",
    "for_statement",
    "enhanced_for_statement",
    "do_statement",
    "catch_clause",
    "try_statement",
    "ternary_expression",
    "binary_expression",
];

/// Whether a store always runs before a use: no branch around it that leaves the use out.
pub(super) fn always_before(store: Node, usage: Node, body: Node) -> bool {
    let mut at = parent(store);
    while let Some(node) = at {
        if node.id() == body.id() {
            return true;
        }
        let around = node.start_byte() <= usage.start_byte() && usage.end_byte() <= node.end_byte();
        if BRANCHES.contains(&node.kind()) && !around {
            return false;
        }
        at = parent(node);
    }
    true
}

/// The values a local variable may hold at a use: the last one always given to it before, and any given after that
/// on a branch. SpotBugs merges the types of values that meet.
pub fn local_values<'t>(context: &Context, usage: Node<'t>, name: &str) -> Vec<Node<'t>> {
    let Some(body) = ancestor(usage, BODIES) else { return Vec::new() };
    let mut stores: Vec<(Node, Node)> = Vec::new();
    walk(body, |node| {
        let value = match node.kind() {
            "variable_declarator" if node.child_by_field_name("name").is_some_and(|declared| context.text(declared) == name) => node.child_by_field_name("value"),
            "assignment_expression" if node.child_by_field_name("left").is_some_and(|left| left.kind() == "identifier" && context.text(left) == name) => {
                node.child_by_field_name("right")
            }
            _ => None,
        };
        if let Some(value) = value.filter(|value| value.end_byte() <= usage.start_byte()) {
            stores.push((node, value));
        }
    });
    let first = stores.iter().rposition(|(store, _)| always_before(*store, usage, body)).unwrap_or(0);
    stores.into_iter().skip(first).map(|(_, value)| value).collect()
}

fn observed_at(context: &Context, value: Node, depth: usize) -> Option<Type> {
    let value = unwrap(value);
    let resolver = context.resolver;
    if depth > DEPTH {
        return resolver.type_of(value);
    }
    match value.kind() {
        "null_literal" => None,
        "ternary_expression" => {
            let sides = [value.child_by_field_name("consequence")?, value.child_by_field_name("alternative")?];
            let known: Vec<Node> = sides.into_iter().map(unwrap).filter(|side| side.kind() != "null_literal").collect();
            same(known.into_iter().map(|side| observed_at(context, side, depth + 1)).collect())
        }
        "identifier" => {
            let name = context.text(value);
            let Some(bound) = resolver.binding(value, name) else { return resolver.type_of(value) };
            match bound {
                Binding::Field(_, declaring, field) => field_type(context, &(declaring.name.clone(), field.name.clone()), field.kind.clone(), depth),
                Binding::Local(declared) => {
                    if caught(context, value, name) || matches!(declared, Some(Type::Variable(_))) || generic_parameter(context, value, name) {
                        return None;
                    }
                    let held = local_values(context, value, name);
                    if held.is_empty() {
                        return declared;
                    }
                    same(held.into_iter().map(unwrap).filter(|held| held.kind() != "null_literal").map(|held| observed_at(context, held, depth + 1)).collect())
                }
            }
        }
        "field_access" => {
            let declared = resolver.type_of(value)?;
            match field_key(context, value) {
                Some(key) => field_type(context, &key, declared, depth),
                None => Some(declared),
            }
        }
        _ => resolver.type_of(value),
    }
}

/// The type of a value as SpotBugs has it; nothing when it cannot say.
pub fn observed(context: &Context, value: Node) -> Option<Type> {
    observed_at(context, value, 0)
}
