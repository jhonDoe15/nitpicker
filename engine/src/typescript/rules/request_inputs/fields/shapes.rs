//! `schema-shapes.mts`: the fields of a zod or valibot object schema, through `pick`, `omit`, `extend` and `merge`.
use super::super::bindings::resolved_expression;
use super::super::tree::{key_name, member_text, name_of, Tree, T};
use super::libraries::{library_call, listed, method_call};
use crate::typescript::rules::support::view::Node;

const MAX_LEAF_STEPS: usize = 16;
const PICKERS: [&str; 2] = ["pick", "omit"];
const MERGERS: [&str; 3] = ["extend", "safeExtend", "merge"];

#[derive(Clone)]
pub struct Field<'v> {
    pub name: String,
    pub value: T<'v>,
}

struct Operation<'v> {
    method: String,
    argument: Option<T<'v>>,
}

#[derive(Default)]
struct ShapeStep<'v> {
    next: Option<T<'v>>,
    operation: Option<Operation<'v>>,
    shape: Option<T<'v>>,
}

/// An object literal's entries, as the compiler sees them: a destructuring target is an object literal too.
pub fn object_entries<'v>(literal: Node<'v>) -> Option<Vec<Node<'v>>> {
    let object = literal.is("ObjectExpression") || (literal.is("ObjectPattern") && super::super::order::is_assignment_pattern(literal));
    object.then(|| literal.nodes("properties"))
}

/// A `PropertyAssignment`: `key: value`, not a method, accessor or shorthand.
pub fn is_property_assignment(property: Node) -> bool {
    property.is("Property") && !property.flag("shorthand") && !property.flag("method") && property.text("kind").as_deref() == Some("init")
}

/// The initializer of a property assignment; in a destructuring target `a = b` is a binary expression there.
pub fn initializer<'v>(tree: &Tree<'v>, property: Node<'v>) -> Option<T<'v>> {
    tree.field(property, "value")
}

fn literal_fields<'v>(tree: &Tree<'v>, literal: Option<T<'v>>) -> Option<Vec<Field<'v>>> {
    let entries = object_entries(literal?.bare()?)?;
    Some(entries.into_iter().filter_map(|property| {
        if is_property_assignment(property) {
            let name = key_name(tree, property)?;
            return Some(Field { name, value: initializer(tree, property)? });
        }
        if property.is("Property") && property.flag("shorthand") {
            let key = property.node("key")?;
            return Some(Field { name: key.name()?.into_owned(), value: T { node: shorthand_name(property)?, level: 0 } });
        }
        None
    }).collect())
}

/// The identifier of a shorthand property: its value, before any default.
pub fn shorthand_name(property: Node) -> Option<Node> {
    let value = property.node("value")?;
    if value.is("AssignmentPattern") { value.node("left") } else { Some(value) }
}

fn key_names(tree: &Tree, expression: Option<T>) -> Option<Vec<Option<String>>> {
    let argument = resolved_expression(tree, expression);
    if let Some(fields) = literal_fields(tree, argument) {
        return Some(fields.into_iter().map(|field| Some(field.name)).collect());
    }
    let array = argument?.bare().filter(|array| array.is("ArrayExpression"))?;
    Some(tree.fields(array, "elements").into_iter().map(|element| name_of(element)).collect())
}

fn applied<'v>(tree: &Tree<'v>, fields: Vec<Field<'v>>, operation: &Operation<'v>) -> Option<Vec<Field<'v>>> {
    if PICKERS.contains(&operation.method.as_str()) {
        let Some(keys) = key_names(tree, operation.argument) else { return Some(fields) };
        let pick = operation.method == "pick";
        return Some(fields.into_iter().filter(|field| keys.iter().any(|key| key.as_deref() == Some(field.name.as_str())) == pick).collect());
    }
    let added = added_fields(tree, operation.argument)?;
    let mut kept: Vec<Field> = fields.into_iter().filter(|field| !added.iter().any(|other| other.name == field.name)).collect();
    kept.extend(added);
    Some(kept)
}

fn shape_step<'v>(tree: &Tree<'v>, node: T<'v>) -> ShapeStep<'v> {
    if let Some(callee) = method_call(tree, node) {
        let method = member_text(callee).unwrap_or_default();
        let shaping = PICKERS.contains(&method.as_str()) || MERGERS.contains(&method.as_str());
        let argument = tree.fields(node.node, "arguments").first().copied().flatten();
        let operation = shaping.then_some(Operation { method, argument });
        return ShapeStep { next: tree.field(callee, "object"), operation, shape: None };
    }
    if !node.is("CallExpression") {
        return ShapeStep::default();
    }
    let Some(found) = library_call(tree, node) else { return ShapeStep::default() };
    if found.coerce {
        return ShapeStep::default();
    }
    let first = tree.fields(node.node, "arguments").first().copied().flatten();
    if listed(found.library.objects, found.name.as_deref()) {
        return ShapeStep { shape: first, ..ShapeStep::default() };
    }
    if listed(found.library.wrappers, found.name.as_deref()) { ShapeStep { next: first, ..ShapeStep::default() } } else { ShapeStep::default() }
}

fn shape_root<'v>(tree: &Tree<'v>, expression: Option<T<'v>>) -> Option<(Option<T<'v>>, Vec<Operation<'v>>)> {
    let mut pending = vec![expression];
    let mut operations: Vec<Operation> = Vec::new();
    let mut index = 0;
    while index < pending.len() {
        let node = resolved_expression(tree, pending[index]);
        index += 1;
        let step = match node {
            Some(node) if pending.len() <= MAX_LEAF_STEPS => shape_step(tree, node),
            _ => ShapeStep::default(),
        };
        if let Some(operation) = step.operation {
            operations.insert(0, operation);
        }
        match step.next {
            Some(next) => pending.push(Some(next)),
            None => return step.shape.map(|shape| (Some(shape), operations)),
        }
    }
    None
}

fn added_fields<'v>(tree: &Tree<'v>, argument: Option<T<'v>>) -> Option<Vec<Field<'v>>> {
    let direct = literal_fields(tree, resolved_expression(tree, argument));
    if direct.is_some() {
        return direct;
    }
    let argument = argument?;
    let shape = argument.bare().filter(|node| super::super::tree::is_pa(*node) && member_text(*node).as_deref() == Some("shape"));
    let start = match shape {
        Some(node) => tree.field(node, "object"),
        None => Some(argument),
    };
    let (shape, operations) = shape_root(tree, start)?;
    if operations.is_empty() { literal_fields(tree, resolved_expression(tree, shape)) } else { None }
}

pub fn shape_fields<'v>(tree: &Tree<'v>, expression: Option<T<'v>>) -> Option<Vec<Field<'v>>> {
    let root = shape_root(tree, expression);
    let mut fields = match &root {
        Some((shape, _)) => literal_fields(tree, resolved_expression(tree, *shape)),
        None => None,
    };
    for operation in root.map(|(_, operations)| operations).unwrap_or_default() {
        fields = applied(tree, fields?, &operation);
    }
    fields
}
