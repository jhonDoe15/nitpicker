//! MultipleNullnessAnnotations, NullablePrimitive, NullablePrimitiveArray and NullableVoid on the declarations javac
//! makes a `VariableTree` or `MethodTree` for.
use super::Context;
use super::nodes::name_position;
use super::nullness_placement::{
    Mark, PRIMITIVES, annotations_in, brackets, conflicting, delete_all, element, is_annotation, primitive_found, relevant_ones, spread_marks, targets,
};
use crate::engine::source::{named_children, parent};
use crate::java::helpers::{declarators, modifiers};
use crate::java::types::model::target;
use tree_sitter::Node;

/// A declaration javac makes a `VariableTree` or `MethodTree` for: its annotations, written type and dimensions.
struct Declared<'t> {
    holder: Node<'t>,
    position: usize,
    annotations: Vec<Mark<'t>>,
    /// Annotations written after the type parameters of a method.
    late: Vec<Mark<'t>>,
    kind: Option<Node<'t>>,
    /// Brackets after the name, outermost first.
    name_dims: Vec<Vec<Mark<'t>>>,
    /// The annotations of the array a `...` declares.
    spread: Option<Vec<Mark<'t>>>,
    element_kind: &'static str,
}

fn declared<'t>(context: &Context, node: Node<'t>) -> Vec<Declared<'t>> {
    let annotations = modifiers(node).map(|found| annotations_in(context, found)).unwrap_or_default();
    let kind = node.child_by_field_name("type");
    let mut entries: Vec<(usize, Node, Option<Node>, &'static str)> = Vec::new();
    match node.kind() {
        "field_declaration" | "constant_declaration" | "local_variable_declaration" => {
            let element_kind = if node.kind() == "local_variable_declaration" { "LOCAL_VARIABLE" } else { "FIELD" };
            for declarator in declarators(node) {
                entries.push((name_position(declarator), node, declarator.child_by_field_name("dimensions"), element_kind));
            }
        }
        "formal_parameter" | "catch_formal_parameter" => {
            let element_kind = if parent(node).and_then(parent).is_some_and(|owner| owner.kind() == "record_declaration") { "RECORD_COMPONENT" } else { "PARAMETER" };
            entries.push((name_position(node), node, node.child_by_field_name("dimensions"), element_kind));
        }
        "resource" if node.child_by_field_name("name").is_some() => entries.push((name_position(node), node, None, "LOCAL_VARIABLE")),
        "enhanced_for_statement" => entries.push((name_position(node), node, node.child_by_field_name("dimensions"), "LOCAL_VARIABLE")),
        "spread_parameter" => {
            let declarator = named_children(node).into_iter().find(|part| part.kind() == "variable_declarator");
            let kind = named_children(node).into_iter().find(|part| !matches!(part.kind(), "modifiers" | "variable_declarator") && !is_annotation(*part));
            return declarator
                .map(|declarator| {
                    let spread = Some(spread_marks(context, node));
                    Declared { holder: node, position: name_position(declarator), annotations, late: Vec::new(), kind, name_dims: Vec::new(), spread, element_kind: "PARAMETER" }
                })
                .into_iter()
                .collect();
        }
        "enum_constant" => {
            return vec![Declared { holder: node, position: node.start_byte(), annotations, late: Vec::new(), kind: None, name_dims: Vec::new(), spread: None, element_kind: "FIELD" }];
        }
        "receiver_parameter" => {
            let annotations = annotations_in(context, node);
            let named = named_children(node).into_iter().filter(|part| !is_annotation(*part)).collect::<Vec<_>>();
            let (Some(kind), Some(name)) = (named.first().copied(), named.get(1).copied()) else { return Vec::new() };
            return vec![Declared { holder: node, position: name.start_byte(), annotations, late: Vec::new(), kind: Some(kind), name_dims: Vec::new(), spread: None, element_kind: "PARAMETER" }];
        }
        "method_declaration" | "constructor_declaration" | "annotation_type_element_declaration" => {
            let late = if node.kind() == "method_declaration" { annotations_in(context, node) } else { Vec::new() };
            let name_dims = brackets(context, node.child_by_field_name("dimensions"));
            return vec![Declared { holder: node, position: name_position(node), annotations, late, kind, name_dims, spread: None, element_kind: "METHOD" }];
        }
        _ => {}
    }
    entries
        .into_iter()
        .map(|(position, holder, dims, element_kind)| {
            let name_dims = brackets(context, dims);
            Declared { holder, position, annotations: annotations.clone(), late: Vec::new(), kind, name_dims, spread: None, element_kind }
        })
        .collect()
}

impl<'t> Declared<'t> {
    /// The brackets of the declared type in javac's order: those after the name, those of the type, then a `...`.
    fn all_brackets(&self, context: &Context) -> Vec<Vec<Mark<'t>>> {
        let mut all = self.name_dims.clone();
        if let Some(kind) = self.kind.filter(|kind| kind.kind() == "array_type") {
            all.extend(brackets(context, kind.child_by_field_name("dimensions")));
        }
        all.extend(self.spread.iter().cloned());
        all
    }

    /// The annotations javac keeps as modifiers: those before the type parameters and those after them.
    fn written(&self) -> Vec<Mark<'t>> {
        self.annotations.iter().chain(&self.late).cloned().collect()
    }

    fn element(&self) -> Option<Node<'t>> {
        self.kind.map(element)
    }

    fn is_void(&self) -> bool {
        self.holder.kind() == "constructor_declaration" || self.kind.is_some_and(|kind| kind.kind() == "void_type")
    }
}

fn declaration_annotation(bits: Option<u16>, element_kind: &str) -> bool {
    match bits {
        None => true,
        Some(bits) => bits & target::bit(element_kind) != 0 || (element_kind == "RECORD_COMPONENT" && bits & (target::bit("FIELD") | target::bit("PARAMETER") | target::bit("METHOD")) != 0),
    }
}

fn type_use(bits: Option<u16>) -> bool {
    bits.is_some_and(|bits| bits & target::bit("TYPE_USE") != 0)
}

fn multiple_on_declaration(context: &Context, declared: &Declared) {
    let mut listed: Vec<Mark> = declared.annotations.iter().filter(|annotation| declaration_annotation(targets(context, annotation), declared.element_kind)).cloned().collect();
    let all = declared.all_brackets(context);
    let named = declared.element().map(|kind| if kind.kind() == "generic_type" { kind.named_child(0).unwrap_or(kind) } else { kind });
    let scoped = named.filter(|kind| kind.kind() == "scoped_type_identifier").map(|kind| annotations_in(context, kind)).unwrap_or_default();
    if all.is_empty() {
        listed.extend(declared.annotations.iter().filter(|annotation| type_use(targets(context, annotation))).cloned());
        listed.extend(declared.late.iter().cloned());
        listed.extend(scoped);
    } else {
        listed.extend(all[0].iter().cloned());
    }
    conflicting(context, &listed, declared.holder, declared.position);
}

const ARRAY_MESSAGE: &str = "@Nullable type annotations should not be used for primitive types since they cannot be null";

fn primitive_array(context: &Context, declared: &Declared) {
    let all = declared.all_brackets(context);
    let Some(element) = declared.element() else { return };
    if all.is_empty() || !PRIMITIVES.contains(&element.kind()) {
        return;
    }
    let relevant = relevant_ones(&declared.annotations);
    let typed: Vec<Mark> = relevant
        .iter()
        .filter(|annotation| {
            targets(context, annotation).is_some_and(|bits| {
                let declaration = ["METHOD", "FIELD", "LOCAL_VARIABLE", "PARAMETER"].iter().any(|name| bits & target::bit(name) != 0);
                !declaration && bits & target::bit("TYPE_USE") != 0
            })
        })
        .cloned()
        .collect();
    let Some(first) = typed.first() else { return };
    let mut fix = delete_all(&typed);
    let dims_annotations: Vec<Mark> = if declared.late.is_empty() { all.iter().find(|group| !group.is_empty()).cloned().unwrap_or_default() } else { declared.late.clone() };
    let on_array = !relevant_ones(&dims_annotations).is_empty();
    if typed.len() == relevant.len() && !on_array {
        let shown: Vec<&str> = typed.iter().map(|annotation| annotation.shown(context)).collect();
        fix = fix.insert(element.end_byte(), format!(" {} ", shown.join(" ")));
    }
    context.report_fixed("NullablePrimitiveArray", declared.holder, first.start, ARRAY_MESSAGE, &[fix]);
}

/// A `var` whose inferred type is primitive.
fn inferred_primitive(context: &Context, declared: &Declared, kind: Node) -> bool {
    kind.kind() == "type_identifier"
        && context.text(kind) == "var"
        && matches!(
            context.resolver.declared_type(declared.holder, None).or_else(|| context.resolver.type_of(declared.holder.child_by_field_name("name")?)),
            Some(crate::java::types::model::Type::Primitive(_))
        )
}

pub fn declaration_checks(context: &Context, node: Node) {
    for declared in declared(context, node) {
        multiple_on_declaration(context, &declared);
        let primitive = declared.all_brackets(context).is_empty()
            && declared.element().is_some_and(|kind| PRIMITIVES.contains(&kind.kind()) || inferred_primitive(context, &declared, kind));
        if primitive {
            primitive_found(context, declared.holder, &declared.written());
        }
        primitive_array(context, &declared);
        if declared.element_kind == "METHOD" && declared.is_void() {
            let relevant = relevant_ones(&declared.written());
            if let Some(first) = relevant.first() {
                let message = "void-returning methods should not be annotated with nullness annotations, since they cannot return null";
                context.report_fixed("NullableVoid", declared.holder, first.start, message, &[delete_all(&relevant)]);
            }
        }
    }
}
