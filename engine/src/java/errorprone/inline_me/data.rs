//! `InlineMeData`: the replacement and imports an `@InlineMe` annotation gives, and the ones Error Prone infers from a
//! method's body, printed the way its `GooglePrinter` prints a qualified copy of the body.
use super::super::Context;
use super::super::javac_print::{printed_google, quoted};
use super::sym::{self, Kind};
use super::tree::{Event, Parent, ident_parent, is_select, scan, selected};
use crate::engine::source::{children, named_children};
use crate::java::helpers::modifiers;
use crate::java::javac::locals::Scopes;
use crate::java::types::scope::enclosing_type;
use std::collections::{BTreeSet, HashMap};
use tree_sitter::Node;

#[derive(Debug, Clone)]
pub struct Data {
    pub replacement: String,
    /// In the annotation's order without repeats; sorted when inferred.
    pub imports: Vec<String>,
    pub static_imports: Vec<String>,
}

fn simple_name<'t>(context: &'t Context, annotation: Node) -> &'t str {
    let name = annotation.child_by_field_name("name").map_or("", |name| context.text(name));
    name.rsplit('.').next().unwrap_or(name).trim()
}

/// The annotations on a declaration whose simple name is the given one.
pub fn annotations_named<'t>(context: &Context, declaration: Node<'t>, name: &str) -> Vec<Node<'t>> {
    modifiers(declaration)
        .map(children)
        .unwrap_or_default()
        .into_iter()
        .filter(|part| matches!(part.kind(), "marker_annotation" | "annotation") && simple_name(context, *part) == name)
        .collect()
}

/// The value of an annotation element, when the annotation sets it.
pub fn element<'t>(context: &Context, annotation: Node<'t>, key: &str) -> Option<Node<'t>> {
    let arguments = annotation.child_by_field_name("arguments")?;
    let pairs = named_children(arguments);
    if key == "value" {
        if let [only] = pairs.iter().filter(|part| !part.kind().ends_with("comment")).collect::<Vec<_>>().as_slice() {
            if only.kind() != "element_value_pair" {
                return Some(**only);
            }
        }
    }
    pairs
        .into_iter()
        .filter(|pair| pair.kind() == "element_value_pair")
        .find(|pair| pair.child_by_field_name("key").is_some_and(|written| context.text(written) == key))
        .and_then(|pair| pair.child_by_field_name("value"))
}

/// `MoreAnnotations.asStrings`: the string constants of an element, one or an array of them.
pub fn strings(context: &Context, value: Option<Node>) -> Vec<String> {
    let Some(value) = value else { return Vec::new() };
    let listed = if value.kind() == "element_value_array_initializer" { named_children(value) } else { vec![value] };
    let mut found: Vec<String> = Vec::new();
    for item in listed.into_iter().filter(|part| !part.kind().ends_with("comment")) {
        if let Some(text) = context.resolver.constant_string(item) {
            if !found.contains(&text) {
                found.push(text);
            }
        }
    }
    found
}

/// `InlineMeData.createFromSymbol` for a declaration of the sources: its one annotation named `InlineMe`, with a
/// `replacement` string.
pub fn from_declaration<'t>(context: &Context, declaration: Node<'t>) -> Option<(Node<'t>, Data)> {
    let found = annotations_named(context, declaration, "InlineMe");
    let [annotation] = found.as_slice() else { return None };
    let replacement = context.resolver.constant_string(element(context, *annotation, "replacement")?)?;
    let imports = strings(context, element(context, *annotation, "imports"));
    let static_imports = strings(context, element(context, *annotation, "staticImports"));
    Some((*annotation, Data { replacement, imports, static_imports }))
}

fn listed(names: &[String]) -> String {
    let quoted = format!("\"{}\"", names.join("\", \""));
    if names.len() == 1 { quoted } else { format!("{{{quoted}}}") }
}

impl Data {
    /// `buildAnnotation`: the annotation as it is written into the source, with a line break after it.
    pub fn annotation(&self) -> String {
        let mut text = format!("@InlineMe(replacement = \"{}\"", quoted(&self.replacement));
        if !self.imports.is_empty() {
            text.push_str(&format!(", imports = {}", listed(&self.imports)));
        }
        if !self.static_imports.is_empty() {
            text.push_str(&format!(", staticImports = {}", listed(&self.static_imports)));
        }
        text.push_str(")\n");
        text
    }
}

/// `ImportAndQualificationFinder.addImport`.
fn add_import(imports: &mut BTreeSet<String>, name: &str) {
    if !name.is_empty() && !name.starts_with("java.lang") {
        imports.insert(name.to_string());
    }
}

fn no_qualification(parent: Parent) -> bool {
    matches!(parent, Parent::NewClass | Parent::MemberReference | Parent::TypeCast | Parent::NewArray)
}

/// `buildExpectedInlineMeAnnotation`: the replacement and imports Error Prone expects for the method's body.
pub fn expected(context: &Context, scopes: &Scopes, method: Node, body: Node) -> Data {
    let class = enclosing_type(context.file, context.resolver.scope, method).unwrap_or_default();
    let class_name = sym::javac_name(&class);
    let simple = class_name.rsplit('.').next().unwrap_or_default().to_string();
    let index = context.resolver.index;
    let mut imports = BTreeSet::new();
    let mut static_imports = BTreeSet::new();
    let mut qualified: HashMap<usize, String> = HashMap::new();
    scan(body, true, &mut |event| {
        match event {
            Event::Select(node) => {
                if !selected(node).is_some_and(is_select) {
                    if let Some(found) = sym::select(context, node).filter(|found| found.is_static) {
                        if let Some(owner) = &found.owner {
                            add_import(&mut imports, &sym::javac_name(owner));
                        }
                    }
                }
            }
            Event::Ident(node) => {
                let Some(found) = (context.text(node) != "this").then(|| sym::ident(context, scopes, node)).flatten() else { return true };
                let parent = ident_parent(node);
                if found.kind == Kind::Local || parent == Parent::MemberSelect {
                    return true;
                }
                let member = found.owner.as_deref().is_some_and(|owner| index.is_subtype(&class, owner)) && parent != Parent::NewClass;
                let plain = no_qualification(parent);
                if found.is_static {
                    if member {
                        add_import(&mut imports, &class_name);
                        if !plain {
                            qualified.insert(node.id(), simple.clone());
                        }
                    } else if parent == Parent::NewClass && crate::engine::source::parent(node).and_then(|up| up.child_by_field_name("type")) == Some(node) {
                        add_import(&mut imports, &found.qualified);
                    } else {
                        let owner = found.owner.as_deref().map(sym::javac_name).unwrap_or_default();
                        static_imports.insert(format!("{owner}.{}", found.qualified));
                    }
                } else if member {
                    if !plain {
                        qualified.insert(node.id(), "this".to_string());
                    }
                } else {
                    add_import(&mut imports, &found.qualified);
                }
            }
            Event::Invocation(_) | Event::NewClass(_) => {}
        }
        true
    });
    Data { replacement: printed_google(context.file, body, &qualified), imports: imports.into_iter().collect(), static_imports: static_imports.into_iter().collect() }
}
