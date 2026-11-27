//! RC_REF_COMPARISON_BAD_PRACTICE_BOOLEAN: `==` or `!=` between two `Boolean` objects, or a `Boolean` and an
//! object of one of its supertypes, with types as the compiled code has them; priority 2, named after the method
//! around (the lambda's own method in a lambda, each constructor for an instance initializer). SpotBugs notes the
//! compared values, the right one first: the first-declared local holding the value, else the field it was read
//! from or the method that returned it. A final `Boolean` field (`Boolean.TRUE`, a captured `val$x`) is the only
//! value noted, the left one when both are. A value known to be null is never reported. Comparisons of one method
//! with the same notes are one finding, on the first one's line.
mod eval;
mod flow;
mod lines;
mod reach;
mod values;

use super::{Context, names, place};
use crate::engine::source::parent;
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_types;
use std::collections::{HashMap, HashSet};
use crate::engine::source::{children, named_children};
use crate::java::types::expr::Call;
use tree_sitter::Node;
use values::{BOOLEAN, Frame, Note};

const PATTERN: &str = "RC_REF_COMPARISON_BAD_PRACTICE_BOOLEAN";
const MEMBERS: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "static_initializer", "field_declaration", "constant_declaration", "enum_constant"];

#[derive(PartialEq)]
enum Fit {
    Boolean,
    Wider,
    /// A parameter typed with a type variable: compared only with a `Boolean`.
    Generic,
}

fn fit(context: &Context, kind: &Option<Type>) -> Option<Fit> {
    match kind {
        Some(Type::Variable(_)) => Some(Fit::Generic),
        Some(Type::Class(name, _)) if name == BOOLEAN => Some(Fit::Boolean),
        Some(Type::Class(name, _)) => context.resolver.index.is_subtype(BOOLEAN, name).then_some(Fit::Wider),
        _ => None,
    }
}

fn wider(context: &Context, kind: &Option<Type>) -> Option<bool> {
    fit(context, kind).map(|fit| fit == Fit::Boolean)
}

/// Whether one side is a `Boolean` and the other a `Boolean`, one of its supertypes or a type variable.
pub fn boolean_pair(context: &Context, left: &Option<Type>, right: &Option<Type>) -> bool {
    matches!((fit(context, left), fit(context, right)), (Some(one), Some(two)) if one == Fit::Boolean || two == Fit::Boolean)
}

/// The type of values meeting from two branches: a `String` among them makes it a `String` comparison, values
/// that may both be a `Boolean` meet in a supertype of it.
pub fn merged(context: &Context, first: &Option<Type>, second: &Option<Type>) -> Option<Type> {
    let known = |kind: &Option<Type>| kind.clone().filter(|kind| *kind != Type::Null);
    let text = |kind: &Option<Type>| kind.as_ref().is_some_and(|kind| kind.name() == values::STRING);
    let boxable = |kind: &Option<Type>| matches!(kind, Some(Type::Primitive("boolean"))) || wider(context, kind).is_some();
    match (known(first), known(second)) {
        _ if text(first) || text(second) => Some(Type::class(values::STRING)),
        (Some(one), Some(two)) if one.name() == two.name() => Some(one),
        (Some(one), None) | (None, Some(one)) => Some(one),
        (one, two) if boxable(&one) && boxable(&two) => Some(Type::class("java.lang.Object")),
        _ => None,
    }
}

/// The member of a named class whose code holds a node: walking it covers lambdas and classes inside.
fn member_of<'t>(node: Node<'t>) -> Option<Node<'t>> {
    let mut found = None;
    let mut at = parent(node);
    while let Some(current) = at {
        let block = current.kind() == "block" && parent(current).is_some_and(|holder| matches!(holder.kind(), "class_body" | "enum_body_declarations"));
        if MEMBERS.contains(&current.kind()) || block {
            found = Some(current);
        }
        at = parent(current);
    }
    found
}

pub fn ref_comparisons(context: &Context) {
    if !context.wants(&[PATTERN]) {
        return;
    }
    let mut wanted = HashSet::new();
    let mut members: Vec<Node> = Vec::new();
    crate::engine::source::walk(context.file.tree.root_node(), |node| {
        if node.kind() != "binary_expression" || !node.child_by_field_name("operator").is_some_and(|operator| matches!(operator.kind(), "==" | "!=")) {
            return;
        }
        let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
        let (left, right) = (context.resolver.type_of(left), context.resolver.type_of(right));
        let typed = |kind: &Option<Type>| wider(context, kind).is_some() || matches!(kind, Some(Type::Variable(_)));
        if !typed(&left) || !typed(&right) || reach::idle(context, node) || reach::dead(context, node) || reach::unreached(node) {
            return;
        }
        wanted.insert(node.id());
        if let Some(member) = member_of(node).filter(|member| !members.iter().any(|known| known.id() == member.id())) {
            members.push(member);
        }
    });
    if wanted.is_empty() {
        return;
    }
    let mut walk = values::Walk { context, origins: vec![values::Origin::Plain], env: Default::default(), frame: values::Frame::Method, wanted: &wanted, found: Vec::new() };
    for member in members {
        walk.env = Default::default();
        walk.frame = values::Frame::Method;
        walk.member(member);
    }
    report(context, walk.found);
}

/// Initializers run in each constructor before its body: they come first there.
fn order(node: Node) -> (bool, usize) {
    let mut at = parent(node);
    while let Some(current) = at {
        if matches!(current.kind(), "constructor_declaration" | "method_declaration" | "lambda_expression") {
            return (true, node.start_byte());
        }
        if matches!(current.kind(), "field_declaration" | "block") && parent(current).is_some_and(|holder| holder.kind() == "class_body") {
            return (false, node.start_byte());
        }
        at = parent(current);
    }
    (true, node.start_byte())
}

fn report(context: &Context, mut found: Vec<(Node, Vec<values::Note>)>) {
    found.sort_by_key(|(node, _)| order(*node));
    let mut seen: HashMap<String, HashSet<Vec<values::Note>>> = HashMap::new();
    for (node, notes) in found {
        let Some(class) = enclosing_types(context.resolver.scope, node).into_iter().next() else { continue };
        let own = names::binary(context, &class);
        let line = lines::line(context, node);
        let mut labels = place::methods(context, node);
        if labels.is_empty() {
            labels.extend(constant_body(context, node, &own));
        }
        for label in labels {
            if !seen.entry(label.clone()).or_default().insert(notes.clone()) {
                continue;
            }
            let found = place_of(&own, &label, &notes);
            let message = format!("Suspicious comparison of Boolean references in {label}");
            context.report_listed(PATTERN, node, line, message, found, 2, vec![label]);
        }
    }
}

/// The constructor javac gives the class of an enum constant's body, where that body's initializers run: the
/// enum's constructor the constant calls, under the body's own class name.
fn constant_body(context: &Context, node: Node, own: &str) -> Option<String> {
    let constant = crate::engine::source::ancestor(node, &["class_body"]).and_then(parent).filter(|holder| holder.kind() == "enum_constant")?;
    let declaration = crate::engine::source::ancestor(constant, &["enum_declaration"])?;
    let enum_name = context.resolver.scope.names.get(&declaration.id())?;
    let count = constant.child_by_field_name("arguments").map_or(0, |arguments| named_children(arguments).len());
    let body = declaration.child_by_field_name("body")?;
    let constructors: Vec<Node> = place::members(body).into_iter().filter(|member| member.kind() == "constructor_declaration").collect();
    let called = constructors.into_iter().find(|constructor| {
        constructor.child_by_field_name("parameters").is_some_and(|parameters| named_children(parameters).iter().filter(|part| part.kind().ends_with("parameter")).count() == count)
    });
    let label = names::method(context, enum_name, called.unwrap_or(declaration), None);
    let prefix = format!("new {}(", names::binary(context, enum_name));
    label.strip_prefix(&prefix).map(|rest| format!("new {own}({rest}"))
}

/// A class as SARIF names it: `java.lang` classes and classes of the package `own` is in without their package.
fn shown(class: &str, own: &str) -> String {
    let package = names::package_of(class);
    if package == "java.lang" || package == names::package_of(own) {
        return class.get(package.len() + usize::from(!package.is_empty())..).unwrap_or(class).to_string();
    }
    class.to_string()
}

/// A called method: the class of the value it is called on, else the class that declares it.
pub fn called(context: &Context, call: Node, found: &Call) -> Option<String> {
    let owner = match call.child_by_field_name("object") {
        Some(object) if object.kind() != "super" => found.receiver.erased().name(),
        _ => found.declaring.clone(),
    };
    let binary = names::binary(context, &owner);
    let package = names::package_of(&binary);
    let written = if package == "java.lang" { binary[package.len() + 1..].to_string() } else { binary };
    let parameters: Vec<String> = found.method.parameters.iter().map(|kind| names::simple(context, kind)).collect();
    Some(format!("{written}.{}({})", found.method.name, parameters.join(", ")))
}

/// The SARIF place: the last local noted, in the last method noted (else the method around); else the last
/// field, in the class around; else the last method; else the method around. `|` gives the package of the file, `@` the name SARIF shows.
pub fn place_of(own: &str, label: &str, notes: &[Note]) -> String {
    let method = notes.iter().rev().find_map(|note| if let Note::Method(method) = note { Some(method.as_str()) } else { None });
    let local = notes.iter().rev().find_map(|note| match note {
        Note::Local(name) | Note::Named(name) => Some(name),
        _ => None,
    });
    let field = notes.iter().rev().find_map(|note| if let Note::Field(name, declaring) = note { Some((name, declaring)) } else { None });
    let package = names::package_of(own);
    let written = format!("|{package}");
    match (local, field, method) {
        (Some(name), _, _) => format!("{}{written}", place::variable(method.unwrap_or(label), name)),
        (None, Some((name, declaring)), _) => format!("member:{own}.{name}{written}@{}.{name}", shown(declaring, own)),
        (None, None, Some(method)) => format!("function:{method}{written}@{method}"),
        _ => format!("{}{written}", place::function(label)),
    }
}

const CLASSES: &[&str] = &["class_declaration", "record_declaration", "enum_declaration", "interface_declaration", "local_class_declaration"];

impl<'c, 'a> values::Walk<'c, 'a> {
    /// The members of a class declared in code: each method on its own, locals around read from `val$` fields.
    pub fn class_body(&mut self, body: Node<'a>) {
        let saved = (std::mem::take(&mut self.env), self.frame);
        for member in named_children(body) {
            self.env = Default::default();
            self.frame = Frame::Captured;
            self.member(member);
        }
        (self.env, self.frame) = saved;
    }

    /// One member: parameters first, then its code.
    pub fn member(&mut self, member: Node<'a>) {
        let context = self.context;
        match member.kind() {
            "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" => {
                if let Some(parameters) = member.child_by_field_name("parameters") {
                    for parameter in named_children(parameters) {
                        let named = parameter.child_by_field_name("name").or_else(|| {
                            children(parameter).into_iter().find(|child| child.kind() == "variable_declarator").and_then(|declarator| declarator.child_by_field_name("name"))
                        });
                        let Some(name) = named else { continue };
                        let generic = super::observed::generic_parameter(context, name, context.text(name));
                        let kind = match context.resolver.binding(name, context.text(name)) {
                            Some(crate::java::types::expr::Binding::Local(_)) if generic => Some(crate::java::types::model::Type::Variable(String::new())),
                            Some(crate::java::types::expr::Binding::Local(kind)) => kind,
                            _ => None,
                        };
                        let value = self.plain(kind.clone());
                        self.declare(context.text(name), value, kind);
                    }
                }
                if let Some(body) = member.child_by_field_name("body") {
                    self.statement(body);
                }
            }
            "block" => {
                self.statement(member);
            }
            "static_initializer" => {
                for block in named_children(member).into_iter().filter(|child| child.kind() == "block") {
                    self.statement(block);
                }
            }
            "field_declaration" | "constant_declaration" => {
                for declarator in crate::java::helpers::declarators(member) {
                    if let Some(value) = declarator.child_by_field_name("value") {
                        self.env = Default::default();
                        self.eval(value);
                    }
                }
            }
            "enum_constant" => {
                for child in named_children(member) {
                    self.env = Default::default();
                    self.eval(child);
                }
            }
            "enum_body_declarations" => {
                for inner in named_children(member) {
                    self.env = Default::default();
                    self.member(inner);
                }
            }
            kind if CLASSES.contains(&kind) => {
                if let Some(body) = member.child_by_field_name("body") {
                    self.class_body(body);
                }
            }
            _ => {}
        }
    }
}
