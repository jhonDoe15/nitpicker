//! Questions about supertypes and overriding, answered the way javac orders and decides them.
use super::Context;
use crate::engine::source::{children, named_children};
use crate::java::types::index::TypeIndex;
use crate::java::types::model::{ClassInfo, Method, OBJECT, Type, flag};
use crate::java::types::scope::enclosing_type;
use std::collections::HashMap;
use tree_sitter::Node;

fn supers(index: &TypeIndex, name: &str) -> Vec<String> {
    let Some(info) = index.get(name) else { return Vec::new() };
    let mut list: Vec<String> = info.superclass.iter().cloned().collect();
    if info.superclass.is_none() && name != OBJECT {
        list.push(OBJECT.to_string());
    }
    list.extend(info.interfaces.iter().cloned());
    list
}

fn rank(index: &TypeIndex, name: &str, known: &mut HashMap<String, u32>) -> u32 {
    if name == OBJECT {
        return 0;
    }
    if let Some(found) = known.get(name) {
        return *found;
    }
    known.insert(name.to_string(), 1);
    let above = supers(index, name).iter().map(|parent| rank(index, parent, known)).max().unwrap_or(0);
    known.insert(name.to_string(), above + 1);
    above + 1
}

/// Every supertype of a class, the class itself left out, in the order of javac's `Types.closure`: farthest from
/// `Object` first. Among types of the same rank javac puts the one whose name it met last first; here that is
/// the reverse of the order in which a walk up the supertypes meets them.
pub fn closure(index: &TypeIndex, name: &str) -> Vec<String> {
    let mut order: Vec<String> = Vec::new();
    let mut queue: std::collections::VecDeque<String> = supers(index, name).into();
    while let Some(current) = queue.pop_front() {
        if order.contains(&current) {
            continue;
        }
        queue.extend(supers(index, &current));
        order.push(current);
    }
    let mut known = HashMap::new();
    let mut ranked: Vec<(u32, usize, String)> =
        order.into_iter().enumerate().map(|(met, parent)| (rank(index, &parent, &mut known), met, parent)).collect();
    ranked.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)));
    ranked.into_iter().map(|(_, _, parent)| parent).collect()
}

pub fn own_type(index: &TypeIndex, name: &str) -> Type {
    let bounds = index.get(name).map(|info| info.type_parameters.iter().map(|(_, bound)| bound.clone()).collect());
    Type::Class(name.to_string(), bounds.unwrap_or_default())
}

pub fn formals<'t>(method: Node<'t>) -> Vec<Node<'t>> {
    method
        .child_by_field_name("parameters")
        .map(named_children)
        .unwrap_or_default()
        .into_iter()
        .filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter"))
        .collect()
}

/// The index entry of a method declaration, with the name of its class.
pub fn declared_method<'c>(context: &'c Context, method: Node) -> Option<(&'c ClassInfo, &'c Method)> {
    let owner = enclosing_type(context.file, context.resolver.scope, method)?;
    let info = context.resolver.index.get(&owner)?;
    let name = match method.kind() {
        "method_declaration" | "annotation_type_element_declaration" => context.text(method.child_by_field_name("name")?),
        _ => "<init>",
    };
    let parameters = formals(method);
    let candidates: Vec<&Method> =
        info.methods.iter().filter(|candidate| candidate.name == name && candidate.parameters.len() == parameters.len()).collect();
    if candidates.len() == 1 {
        return Some((info, candidates[0]));
    }
    let written: Vec<Option<String>> = parameters
        .iter()
        .map(|parameter| match parameter.kind() {
            "spread_parameter" => named_children(*parameter)
                .into_iter()
                .find_map(|part| context.resolver.type_node(part))
                .map(|element| format!("{}[]", element.erased().name())),
            _ => context.resolver.declared_type(*parameter, None).map(|kind| kind.erased().name()),
        })
        .collect();
    candidates
        .into_iter()
        .find(|candidate| candidate.parameters.iter().zip(&written).all(|(formal, own)| own.as_ref().is_none_or(|own| *own == formal.name())))
        .map(|found| (info, found))
}

fn overridable_in(other: &Method, declaring: &ClassInfo, origin: &ClassInfo) -> bool {
    if other.is_private {
        return false;
    }
    if other.flags & flag::PUBLIC != 0 || declaring.is_interface {
        return true;
    }
    !origin.is_interface && (other.flags & flag::PROTECTED != 0 || declaring.package == origin.package)
}

pub fn sub_signature(index: &TypeIndex, origin: &ClassInfo, method: &Method, declaring: &ClassInfo, other: &Method) -> bool {
    if method.parameters.len() != other.parameters.len() {
        return false;
    }
    if method.parameters == other.parameters {
        return true;
    }
    let map = index.member_map(&own_type(index, &origin.name), &declaring.name);
    let seen: Vec<Type> = other.generic_parameters.iter().map(|formal| formal.substitute(&map)).collect();
    if seen == method.generic_parameters || seen.iter().map(Type::erased).eq(method.parameters.iter().cloned()) {
        return true;
    }
    // A type variable of a class around the declaring class takes what the class around the overriding one gives it.
    let mut around = map;
    let mut changed = false;
    let mut outer = declaring.name.as_str();
    while let Some((parent, _)) = outer.rsplit_once('.') {
        outer = parent;
        let Some(info) = index.get(parent).filter(|info| !info.type_parameters.is_empty()) else { continue };
        let mut inner = origin.name.as_str();
        while let Some((child, _)) = inner.rsplit_once('.') {
            inner = child;
            if index.has(child) && index.is_subtype(child, parent) {
                let given = index.member_map(&own_type(index, child), parent);
                for (name, _) in &info.type_parameters {
                    if let Some(kind) = given.get(name) {
                        around.insert(name.clone(), kind.clone());
                        changed = true;
                    }
                }
                break;
            }
        }
    }
    changed && other.generic_parameters.iter().map(|formal| formal.substitute(&around).erased()).eq(method.parameters.iter().cloned())
}

/// Every method in the supertypes that the method overrides, in the order of `ASTHelpers.streamSuperMethods`.
pub fn super_methods<'c>(index: &'c TypeIndex, origin: &ClassInfo, method: &Method) -> Vec<(&'c ClassInfo, &'c Method)> {
    if method.is_static || method.name == "<init>" {
        return Vec::new();
    }
    let mut found = Vec::new();
    for parent in closure(index, &origin.name) {
        let Some(declaring) = index.get(&parent) else { continue };
        found.extend(
            declaring
                .methods
                .iter()
                .find(|other| {
                    other.name == method.name
                        && !other.is_static
                        && overridable_in(other, declaring, origin)
                        && sub_signature(index, origin, method, declaring, other)
                })
                .map(|other| (declaring, other)),
        );
    }
    found
}

/// The first method in the supertypes that the method overrides.
pub fn super_method<'c>(context: &'c Context, origin: &ClassInfo, method: &Method) -> Option<(&'c ClassInfo, &'c Method)> {
    super_methods(context.resolver.index, origin, method).into_iter().next()
}

pub fn simple_name(class: &str) -> &str {
    let last = class.rsplit('.').next().unwrap_or(class);
    if last.starts_with(|first: char| first.is_ascii_digit()) { last.trim_start_matches(|digit: char| digit.is_ascii_digit()) } else { last }
}

pub fn annotation_names<'f>(context: &'f Context, declaration: Node) -> Vec<&'f str> {
    crate::java::helpers::modifiers(declaration)
        .map(children)
        .unwrap_or_default()
        .into_iter()
        .filter(|part| matches!(part.kind(), "annotation" | "marker_annotation"))
        .filter_map(|annotation| annotation.child_by_field_name("name"))
        .map(|name| context.text(name))
        .collect()
}

pub fn has_annotation(context: &Context, declaration: Node, simple: &str) -> bool {
    annotation_names(context, declaration).iter().any(|name| name.rsplit('.').next() == Some(simple))
}
