//! EI_EXPOSE_REP, EI_EXPOSE_REP2, EI_EXPOSE_STATIC_REP2 and MS_EXPOSE_REP: a public method of a public class hands
//! out a mutable object it keeps in a field, or keeps a mutable object a caller handed in.
use super::flow::{FieldRef, Item, Trace, trace};
use super::mutable::mutable;
use super::fields::widened;
use super::stores::fixed_of;
use super::{Context, names};
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::Binding;
use crate::java::types::model::{Type, flag};
use crate::java::types::scope::enclosing_types;
use std::collections::HashSet;
use tree_sitter::Node;

const RETURNING: &str = "may expose internal representation by returning";
const STORING: &str = "may expose internal representation by storing an externally mutable object into";
const STORING_STATIC: &str = "may expose internal static state by storing a mutable object into a static field";

/// Whether the class file of a declaration is public: `protected` member classes are, and so are members of interfaces.
fn class_public(class: Node) -> bool {
    match parent(class).map(|holder| holder.kind()) {
        Some("program") => has_modifier(class, "public"),
        Some("class_body" | "enum_body_declarations") => has_modifier(class, "public") || has_modifier(class, "protected"),
        Some("interface_body" | "annotation_type_body") => true,
        _ => false,
    }
}

/// A member class that holds an instance of the class around it.
fn inner(class: Node) -> bool {
    class.kind() == "class_declaration" && !has_modifier(class, "static") && parent(class).is_some_and(|holder| holder.kind() == "class_body")
}

fn members(class: Node) -> Vec<Node> {
    let Some(body) = class.child_by_field_name("body") else { return Vec::new() };
    let mut found = children(body);
    found.extend(children(body).into_iter().filter(|part| part.kind() == "enum_body_declarations").flat_map(children));
    found
}

struct Site<'c, 'a, 't> {
    context: &'c Context<'a>,
    class: &'c str,
    /// The class and the classes around it.
    nest: Vec<String>,
    method: Node<'t>,
    label: String,
    is_static: bool,
}

impl Site<'_, '_, '_> {
    fn exposes(&self, field: &FieldRef) -> bool {
        let index = self.context.resolver.index;
        !field.is_public()
            && !field.name.contains("EMPTY")
            && (mutable(index, &field.kind) || widened(self.context).contains(&(field.declaring.clone(), field.name.clone())))
            && self.nest.iter().any(|class| *class == field.via)
            && !fixed_of(self.context, &field.declaring).contains(&field.name)
    }

    fn returned(&self, at: Node, line: usize, field: &FieldRef) {
        if !self.exposes(field) {
            return;
        }
        let shown = names::field(self.context, self.class, &field.declaring, &field.name);
        if self.is_static {
            self.context.report("MS_EXPOSE_REP", at, line, format!("Public static {} {RETURNING} {shown}", self.label));
        } else {
            self.context.report("EI_EXPOSE_REP", at, line, format!("{} {RETURNING} {shown}", self.label));
        }
    }

    fn stored(&self, at: Node, line: usize, field: &FieldRef) {
        let index = self.context.resolver.index;
        if field.is_public() || !mutable(index, &field.kind) || field.is_static() != self.is_static {
            return;
        }
        if self.is_static {
            let shown = format!("{}.{}", names::binary(self.context, &field.via), field.name);
            self.context.report("EI_EXPOSE_STATIC_REP2", at, line, format!("{} {STORING_STATIC} {shown}", self.label));
        } else {
            let shown = names::field(self.context, self.class, &field.via, &field.name);
            self.context.report("EI_EXPOSE_REP2", at, line, format!("{} {STORING} {shown}", self.label));
        }
    }

    fn check(&self, found: &Trace) {
        let mut seen = HashSet::new();
        for (node, item) in &found.returns {
            if let Item::Field(field) = item {
                if seen.insert((field.declaring.clone(), field.name.clone())) {
                    self.returned(self.method, self.context.line(*node), field);
                }
            }
        }
        let mut kept = HashSet::new();
        for store in &found.stores {
            let Item::Param(place) = store.item else { continue };
            if (store.own || self.is_static) && kept.insert((store.field.declaring.clone(), store.field.name.clone(), place)) {
                self.stored(self.method, self.context.line(store.node), &store.field);
            }
        }
    }
}

/// The name of a parameter or record component; a variable arity one keeps it one level down.
pub fn parameter_name(parameter: Node) -> Option<Node> {
    match parameter.kind() {
        "spread_parameter" => children(parameter).into_iter().find(|part| part.kind() == "variable_declarator")?.child_by_field_name("name"),
        _ => parameter.child_by_field_name("name"),
    }
}

fn parameters(declaration: Node) -> Vec<Node> {
    declaration.child_by_field_name("parameters").map(named_children).unwrap_or_default()
}

/// Whether an inner class keeps the hidden field for its outer instance: the compiler drops it unless code outside
/// the constructors reaches for the outer instance, or the class is serializable.
fn keeps_outer(context: &Context, class: Node, own: &str, outer: &str) -> bool {
    let index = context.resolver.index;
    if index.is_subtype(own, "java.io.Serializable") {
        return true;
    }
    let uses = |node: Node| match node.kind() {
        "identifier" => {
            let above = parent(node);
            let role = above.map(|above| above.kind()).unwrap_or_default();
            let name = context.text(node);
            if role == "method_invocation" && above.is_some_and(|call| call.child_by_field_name("name") == Some(node)) {
                let bare = above.is_some_and(|call| call.child_by_field_name("object").is_none());
                bare && index.methods(own, name).is_empty() && index.methods(outer, name).iter().any(|(_, method)| !method.is_static)
            } else if role == "field_access" && above.is_some_and(|access| access.child_by_field_name("field") == Some(node)) {
                false
            } else {
                matches!(context.resolver.binding(node, name), Some(Binding::Field(owner, _, field)) if owner.name() == outer && field.flags & flag::STATIC == 0)
            }
        }
        "field_access" => node.child_by_field_name("field").is_some_and(|field| field.kind() == "this"),
        "object_creation_expression" => {
            let made = node.child_by_field_name("type").and_then(|written| context.resolver.type_node(written));
            let info = made.as_ref().and_then(|made| index.get(&made.name()));
            let inner = |flags: u16| flags & (flag::STATIC | flag::ENUM | flag::RECORD) == 0;
            let unqualified = children(node).first().is_some_and(|first| first.kind() == "new");
            unqualified && info.is_some_and(|info| !info.is_interface && inner(info.flags) && info.name.rsplit_once('.').is_some_and(|(holder, _)| holder == outer))
        }
        _ => false,
    };
    let mut open = vec![class];
    while let Some(node) = open.pop() {
        for part in children(node) {
            if part.kind() == "constructor_declaration" && parent(part).and_then(parent) == Some(class) {
                continue;
            }
            if uses(part) {
                return true;
            }
            open.push(part);
        }
    }
    false
}

/// A public constructor of an inner class stores the outer instance it is given, which is a mutable object too.
fn inner_constructors(context: &Context, class: Node, own: &str, nest: &[String]) {
    if class.kind() != "class_declaration" || has_modifier(class, "static") || parent(class).is_none_or(|holder| holder.kind() != "class_body") {
        return;
    }
    let Some(outer) = nest.get(1) else { return };
    if context.classes.get(outer).is_none_or(|holder| holder.kind() == "interface_declaration") {
        return;
    }
    let index = context.resolver.index;
    if !mutable(index, &Type::class(outer)) || !keeps_outer(context, class, own, outer) {
        return;
    }
    let shown = format!("{}.{}", names::short(&names::binary(context, own)), names::outer_field(context, nest));
    let explicit: Vec<Node> = members(class).into_iter().filter(|member| member.kind() == "constructor_declaration").collect();
    if explicit.is_empty() && has_modifier(class, "public") {
        let line = class.child_by_field_name("name").map_or(context.line(class), |name| context.line(name));
        context.report("EI_EXPOSE_REP2", class, line, format!("{} {STORING} {shown}", names::method(context, own, class, Some(outer))));
    }
    for constructor in explicit {
        let delegates = constructor.child_by_field_name("body").and_then(|body| named_children(body).into_iter().find(|part| !part.kind().ends_with("comment"))).is_some_and(|first| {
            first.kind() == "explicit_constructor_invocation" && first.child_by_field_name("constructor").is_some_and(|called| called.kind() == "this")
        });
        if has_modifier(constructor, "public") && !delegates {
            let line = constructor.child_by_field_name("body").map_or(context.line(constructor), |body| context.line(body));
            context.report("EI_EXPOSE_REP2", constructor, line, format!("{} {STORING} {shown}", names::method(context, own, constructor, Some(outer))));
        }
    }
}

fn record_members(context: &Context, class: Node, own: &str, nest: &[String]) {
    let index = context.resolver.index;
    let components = parameters(class);
    let listed = members(class);
    let (erased, _, _) = context.resolver.parameters(class.child_by_field_name("parameters"));
    let canonical = listed.iter().any(|member| match member.kind() {
        "compact_constructor_declaration" => true,
        "constructor_declaration" => context.resolver.parameters(member.child_by_field_name("parameters")).0 == erased,
        _ => false,
    });
    let field_of = |component: Node| {
        let name = context.text(parameter_name(component)?);
        let (declaring, field) = index.field(own, name)?;
        Some(FieldRef { declaring: declaring.name.clone(), name: name.to_string(), via: own.to_string(), kind: field.kind.clone(), flags: field.flags })
    };
    let name_line = class.child_by_field_name("name").map_or(context.line(class), |name| context.line(name));
    for component in &components {
        let Some(field) = field_of(*component) else { continue };
        let explicit = listed.iter().any(|member| {
            member.kind() == "method_declaration"
                && member.child_by_field_name("name").is_some_and(|name| context.text(name) == field.name)
                && parameters(*member).is_empty()
        });
        let site = Site { context, class: own, nest: nest.to_vec(), method: class, label: format!("{}.{}()", names::binary(context, own), field.name), is_static: false };
        if !explicit {
            site.returned(class, context.line(class), &field);
        }
        let open = has_modifier(class, "public") || parent(class).is_some_and(|holder| holder.kind() == "interface_body");
        if !canonical && open && component.kind() != "spread_parameter" {
            let site = Site { label: names::method(context, own, class, None), ..site };
            site.stored(class, name_line, &field);
        }
    }
}

pub fn exposed_representation(context: &Context, class: Node) {
    if !matches!(class.kind(), "class_declaration" | "enum_declaration" | "record_declaration") || !class_public(class) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let nest = enclosing_types(context.resolver.scope, class);
    for member in members(class) {
        let kind = member.kind();
        if !matches!(kind, "method_declaration" | "constructor_declaration" | "compact_constructor_declaration") || !has_modifier(member, "public") {
            continue;
        }
        let Some(body) = member.child_by_field_name("body") else { continue };
        let formals = if kind == "compact_constructor_declaration" { parameters(class) } else { parameters(member) };
        let found = trace(context, &formals, body);
        let label = if kind == "compact_constructor_declaration" { names::method(context, &own, class, None) } else { names::method(context, &own, member, None) };
        let outer = nest.get(1).filter(|_| kind == "constructor_declaration" && inner(class)).map(String::as_str);
        let label = if outer.is_some() { names::method(context, &own, member, outer) } else { label };
        let site = Site { context, class: &own, nest: nest.clone(), method: member, label, is_static: has_modifier(member, "static") };
        site.check(&found);
        if let (true, Some(end)) = (kind == "compact_constructor_declaration", &found.end) {
            for component in parameters(class) {
                let Some(name) = component.child_by_field_name("name").map(|name| context.text(name)) else { continue };
                let Some((declaring, field)) = context.resolver.index.field(&own, name) else { continue };
                if matches!(end.get(name), Some(Item::Param(_))) {
                    let field = FieldRef { declaring: declaring.name.clone(), name: name.to_string(), via: own.clone(), kind: field.kind.clone(), flags: field.flags };
                    site.stored(member, context.line(member), &field);
                }
            }
        }
    }
    if class.kind() == "record_declaration" {
        record_members(context, class, &own, &nest);
    }
    inner_constructors(context, class, &own, &nest);
}
