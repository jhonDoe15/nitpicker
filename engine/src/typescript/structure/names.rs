//! Display names of functions: the path of enclosing classes, object literals, functions and fields.
//! The Node analyzer numbers unnamed functions breadth first over the compiler's tree, so this does too.
use super::shape::{Shape, inner};
use oxc_ast::AstKind;
use oxc_ast::ast::*;
use std::collections::HashMap;
use std::rc::Rc;

const ANONYMOUS: &str = "<anonymous>";

enum Part {
    /// A class or a field: the name is used as it is.
    Named(String),
    /// An object literal: adds its binding name when it has one.
    Maybe(Option<String>),
    /// A function: unnamed ones are numbered within their scope.
    Function(String),
    /// The inner arrow of a curried arrow: named after the outer one.
    Folded,
}

struct Entry {
    node: u32,
    depth: u32,
    parent: Option<usize>,
    part: Part,
}

fn local_name(shape: &Shape, index: u32) -> String {
    match shape.kind(index) {
        AstKind::MethodDefinition(method) => {
            if method.kind == MethodDefinitionKind::Constructor {
                "constructor".to_string()
            } else {
                shape.key_text(&method.key, method.computed)
            }
        }
        AstKind::ObjectProperty(property) => shape.key_text(&property.key, property.computed),
        AstKind::TSMethodSignature(signature) => shape.key_text(&signature.key, signature.computed),
        AstKind::Function(function) => match &function.id {
            Some(id) => id.name.to_string(),
            None => {
                let default_export = function.r#type != FunctionType::FunctionExpression
                    && matches!(shape.parent_kind(index), Some(AstKind::ExportDefaultDeclaration(_)));
                if default_export { "default".to_string() } else { shape.binding_name(index).unwrap_or_else(|| ANONYMOUS.to_string()) }
            }
        },
        _ => shape.binding_name(index).unwrap_or_else(|| ANONYMOUS.to_string()),
    }
}

fn is_function_value(value: &Expression) -> bool {
    matches!(inner(value), Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_))
}

fn part_of(shape: &Shape, index: u32) -> Option<Part> {
    match shape.kind(index) {
        AstKind::Class(class) => Some(Part::Named(match &class.id {
            Some(id) => id.name.to_string(),
            None => shape.binding_name(index).unwrap_or_else(|| ANONYMOUS.to_string()),
        })),
        AstKind::ObjectExpression(_) => Some(Part::Maybe(shape.binding_name(index))),
        AstKind::PropertyDefinition(property) => match &property.value {
            Some(value) if !is_function_value(value) => Some(Part::Named(shape.key_text(&property.key, property.computed))),
            _ => None,
        },
        AstKind::AccessorProperty(property) => match &property.value {
            Some(value) if !is_function_value(value) => Some(Part::Named(shape.key_text(&property.key, property.computed))),
            _ => None,
        },
        AstKind::StaticBlock(_) => Some(Part::Named("<static>".to_string())),
        _ if shape.function_like(index) => {
            Some(if shape.curried_inner(index) { Part::Folded } else { Part::Function(local_name(shape, index)) })
        }
        _ => None,
    }
}

/// The name of every function-like node that is not folded into an outer arrow.
pub fn function_names(shape: &Shape) -> HashMap<u32, String> {
    let count = shape.tree.nodes.len();
    let mut depth = vec![0u32; count];
    let mut scope: Vec<Option<usize>> = vec![None; count];
    let mut entries: Vec<Entry> = Vec::new();
    for index in 0..count as u32 {
        let inherited = match shape.tree.parent(index) {
            Some(parent) => {
                depth[index as usize] = depth[parent as usize] + shape.levels(index);
                scope[parent as usize]
            }
            None => None,
        };
        scope[index as usize] = match part_of(shape, index) {
            Some(part) => {
                entries.push(Entry { node: index, depth: depth[index as usize], parent: inherited, part });
                Some(entries.len() - 1)
            }
            None => inherited,
        };
    }
    let mut order: Vec<usize> = (0..entries.len()).collect();
    order.sort_by_key(|entry| (entries[*entry].depth, entries[*entry].node));
    let empty: Rc<Vec<String>> = Rc::new(Vec::new());
    let mut resolved: Vec<Option<Rc<Vec<String>>>> = vec![None; entries.len()];
    let mut anonymous: HashMap<String, u32> = HashMap::new();
    let mut names = HashMap::new();
    for at in order {
        let entry = &entries[at];
        let outer = entry.parent.and_then(|parent| resolved[parent].clone()).unwrap_or_else(|| empty.clone());
        let with = |name: String| {
            let mut path = (*outer).clone();
            path.push(name);
            Rc::new(path)
        };
        let own = match &entry.part {
            Part::Named(name) => with(name.clone()),
            Part::Maybe(Some(name)) => with(name.clone()),
            Part::Maybe(None) | Part::Folded => outer.clone(),
            Part::Function(name) if name != ANONYMOUS => with(name.clone()),
            Part::Function(_) => {
                let seen = anonymous.entry(outer.join(".")).or_insert(0);
                *seen += 1;
                with(if *seen == 1 { ANONYMOUS.to_string() } else { format!("<anonymous#{seen}>") })
            }
        };
        if matches!(entry.part, Part::Function(_)) {
            names.insert(entry.node, own.join("."));
        }
        resolved[at] = Some(own);
    }
    names
}
