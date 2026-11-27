//! MultipleNullnessAnnotations, NullablePrimitive, NullableTypeParameter and NullableWildcard on annotated types: where
//! nullness annotations are written, as Error Prone's `NullnessAnnotations` reads their simple names.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::{children, named_children, parent};
use crate::java::annotations_run::{before_spread, Written};
use tree_sitter::Node;

pub(super) const PRIMITIVES: [&str; 3] = ["integral_type", "floating_point_type", "boolean_type"];

/// `NullnessAnnotations.ANNOTATION_RELEVANT_TO_NULLNESS`.
fn relevant(name: &str) -> bool {
    let bare = name.strip_prefix("Recently").unwrap_or(name);
    let decl_or_type = |rest: &str| matches!(rest, "" | "Decl" | "Type");
    bare.strip_prefix("NonNull").is_some_and(decl_or_type)
        || bare.strip_prefix("Nullable").is_some_and(decl_or_type)
        || matches!(name, "NotNull" | "Nonnull")
        || nullable_only(name)
}

/// The names of `NULLABLE_ANNOTATION` that do not start with `(Recently)?Nullable`.
fn nullable_only(name: &str) -> bool {
    matches!(
        name,
        "CheckForNull" | "PolyNull" | "MonotonicNonNull" | "MonotonicNonNullDecl" | "ProtoMethodMayReturnNull" | "ProtoMethodAcceptsNullParameter"
            | "ProtoPassThroughNullness"
    )
}

/// `NullnessAnnotations.NULLABLE_ANNOTATION`.
fn nullable(name: &str) -> bool {
    let bare = name.strip_prefix("Recently").unwrap_or(name);
    bare.strip_prefix("Nullable").is_some_and(|rest| matches!(rest, "" | "Decl" | "Type")) || nullable_only(name)
}

pub(super) fn is_annotation(node: Node) -> bool {
    matches!(node.kind(), "marker_annotation" | "annotation")
}

/// An annotation as written: a tree node, or text that the grammar masks before a `...` or after a multi-catch `|`.
#[derive(Clone)]
pub(super) struct Mark<'t> {
    pub(super) scope: Node<'t>,
    pub(super) start: usize,
    pub(super) end: usize,
    written: String,
}

impl<'t> Mark<'t> {
    fn of(context: &Context, annotation: Node<'t>) -> Self {
        let written = annotation.child_by_field_name("name").map_or("", |name| context.text(name)).to_string();
        Mark { scope: annotation, start: annotation.start_byte(), end: annotation.end_byte(), written }
    }

    fn written(context: &Context, scope: Node<'t>, written: &Written) -> Self {
        let text = &context.file.text;
        let name: String = text[written.name.0..written.name.1].chars().filter(|character| !character.is_whitespace()).collect();
        Mark { scope, start: written.start, end: written.end, written: name }
    }

    fn simple(&self) -> &str {
        self.written.rsplit('.').next().unwrap_or_default().trim()
    }

    pub(super) fn shown<'c>(&self, context: &'c Context) -> &'c str {
        &context.file.text[self.start..self.end]
    }
}

pub(super) fn annotations_in<'t>(context: &Context, node: Node<'t>) -> Vec<Mark<'t>> {
    children(node).into_iter().filter(|part| is_annotation(*part)).map(|part| Mark::of(context, part)).collect()
}

/// The annotations between the element type of a `...` parameter and the `...`, which the grammar masks.
pub(super) fn spread_marks<'t>(context: &Context, node: Node<'t>) -> Vec<Mark<'t>> {
    let parts = children(node);
    let Some(dots) = parts.iter().find(|part| part.kind() == "...") else { return Vec::new() };
    let Some(kind) = parts.iter().rev().find(|part| part.end_byte() <= dots.start_byte() && part.is_named() && part.kind() != "modifiers") else { return Vec::new() };
    let Some((found, _)) = before_spread(&context.file.text, kind.end_byte()) else { return Vec::new() };
    found.iter().map(|written| Mark::written(context, node, written)).collect()
}

pub(super) fn relevant_ones<'t>(annotations: &[Mark<'t>]) -> Vec<Mark<'t>> {
    annotations.iter().filter(|annotation| relevant(annotation.simple())).cloned().collect()
}

fn full_name(context: &Context, annotation: &Mark) -> String {
    context.resolver.class_name(annotation.scope, &annotation.written).unwrap_or_else(|| annotation.written.clone())
}

pub(super) fn targets(context: &Context, annotation: &Mark) -> Option<u16> {
    context.resolver.index.get(&full_name(context, annotation)).and_then(|info| info.targets)
}

pub(super) fn delete_all(annotations: &[Mark]) -> Fix {
    annotations.iter().fold(Fix::new(), |fix, annotation| fix.delete(annotation.start, annotation.end))
}

/// Annotations grouped by the bracket of the dimensions they stand before, outermost first.
fn bracket_groups(dimensions: Node) -> Vec<(Vec<Node>, Node)> {
    let mut groups = Vec::new();
    let mut current = Vec::new();
    for part in children(dimensions) {
        if is_annotation(part) {
            current.push(part);
        } else if part.kind() == "[" {
            groups.push((std::mem::take(&mut current), part));
        }
    }
    groups
}

pub(super) fn brackets<'t>(context: &Context, dimensions: Option<Node<'t>>) -> Vec<Vec<Mark<'t>>> {
    dimensions.map(bracket_groups).unwrap_or_default().into_iter().map(|(group, _)| group.into_iter().map(|part| Mark::of(context, part)).collect()).collect()
}

/// A javac `AnnotatedTypeTree`: where it starts, its annotations, and what it annotates.
struct Annotated<'t> {
    at: Node<'t>,
    offset: usize,
    annotations: Vec<Mark<'t>>,
    primitive: bool,
    wildcard: Option<Node<'t>>,
}

pub(super) fn element(node: Node) -> Node {
    if node.kind() == "array_type" { node.child_by_field_name("element").unwrap_or(node) } else { node }
}

fn annotated_types<'t>(context: &Context, node: Node<'t>) -> Vec<Annotated<'t>> {
    let mut found = Vec::new();
    match node.kind() {
        "annotated_type" => {
            let annotations = annotations_in(context, node);
            if let Some(kind) = named_children(node).into_iter().find(|part| !is_annotation(*part)) {
                found.push(Annotated { at: node, offset: node.start_byte(), annotations, primitive: PRIMITIVES.contains(&element(kind).kind()), wildcard: None });
            }
        }
        "wildcard" => {
            let annotations = annotations_in(context, node);
            if !annotations.is_empty() {
                found.push(Annotated { at: node, offset: node.start_byte(), annotations, primitive: false, wildcard: Some(node) });
            }
        }
        "dimensions" => {
            let first_at_annotation = parent(node).is_some_and(|owner| {
                matches!(owner.kind(), "array_type" | "array_creation_expression")
                    && owner.child_by_field_name(if owner.kind() == "array_type" { "element" } else { "type" }).is_some_and(|kind| !PRIMITIVES.contains(&kind.kind()))
            });
            let creation = parent(node).is_some_and(|owner| owner.kind() == "array_creation_expression");
            for (index, (group, bracket)) in bracket_groups(node).into_iter().enumerate() {
                if !group.is_empty() && !(creation && index == 0) {
                    let at = if index == 0 && first_at_annotation { group[0] } else { bracket };
                    let annotations = group.into_iter().map(|part| Mark::of(context, part)).collect();
                    found.push(Annotated { at, offset: at.start_byte(), annotations, primitive: false, wildcard: None });
                }
            }
        }
        "scoped_type_identifier" => {
            let annotations = annotations_in(context, node);
            if let Some(first) = annotations.first() {
                found.push(Annotated { at: node, offset: first.start, annotations, primitive: false, wildcard: None });
            }
        }
        "array_creation_expression" => {
            let annotations = annotations_in(context, node);
            if let (Some(first), Some(kind)) = (annotations.first(), node.child_by_field_name("type")) {
                let primitive = PRIMITIVES.contains(&kind.kind());
                let offset = if primitive { kind.start_byte() } else { first.start };
                found.push(Annotated { at: node, offset, annotations, primitive, wildcard: None });
            }
        }
        "catch_type" => {
            for (written, _) in crate::java::grammar::catches::alternative_annotations(&context.file.text, node) {
                let annotations: Vec<Mark> = written.iter().map(|written| Mark::written(context, node, written)).collect();
                found.push(Annotated { at: node, offset: written[0].start, annotations, primitive: false, wildcard: None });
            }
        }
        "spread_parameter" => {
            let annotations = spread_marks(context, node);
            if let Some(first) = annotations.first() {
                found.push(Annotated { at: node, offset: first.start, annotations, primitive: false, wildcard: None });
            }
        }
        _ => {}
    }
    found
}

pub(super) fn conflicting(context: &Context, annotations: &[Mark], node: Node, offset: usize) {
    let relevant = relevant_ones(annotations);
    let has_nullable = relevant.iter().any(|annotation| nullable(annotation.simple()));
    let has_other = relevant.iter().any(|annotation| !nullable(annotation.simple()));
    if !(has_nullable && has_other) {
        return;
    }
    let names: Vec<String> = relevant.iter().map(|annotation| full_name(context, annotation)).collect();
    let message = format!("This type use has conflicting nullness annotations: {}", names.join(", "));
    context.report_fixed("MultipleNullnessAnnotations", node, offset, &message, &[]);
}

const PRIMITIVE_MESSAGE: &str = "Nullness annotations should not be used for primitive types since they cannot be null";

pub(super) fn primitive_found(context: &Context, node: Node, annotations: &[Mark]) {
    let relevant = relevant_ones(annotations);
    if let Some(first) = relevant.first() {
        context.report_fixed("NullablePrimitive", node, first.start, PRIMITIVE_MESSAGE, &[delete_all(&relevant)]);
    }
}

pub fn annotated_type_checks(context: &Context, node: Node) {
    for annotated in annotated_types(context, node) {
        conflicting(context, &annotated.annotations, annotated.at, annotated.offset);
        if annotated.primitive {
            primitive_found(context, annotated.at, &annotated.annotations);
        }
        if let Some(wildcard) = annotated.wildcard {
            nullable_wildcard(context, &annotated, wildcard);
        }
    }
}

fn nullable_wildcard(context: &Context, annotated: &Annotated, wildcard: Node) {
    let relevant = relevant_ones(&annotated.annotations);
    if relevant.is_empty() {
        return;
    }
    let mut fixes = Vec::new();
    if let [only] = relevant.as_slice() {
        let shown = only.shown(context);
        let deleted = Fix::new().delete(only.start, only.end);
        let parts = children(wildcard);
        let bound = named_children(wildcard).into_iter().filter(|part| !is_annotation(*part)).last();
        if parts.iter().any(|part| part.kind() == "extends") {
            if let Some(bound) = bound {
                let annotated_bound = bound.kind() == "annotated_type" && !relevant_ones(&annotations_in(context, bound)).is_empty();
                if !annotated_bound {
                    fixes.push(deleted.insert(bound.start_byte(), format!("{shown} ")));
                }
            }
        } else if !parts.iter().any(|part| part.kind() == "super") {
            let question = parts.iter().find(|part| part.kind() == "?").map_or(wildcard.end_byte(), |mark| mark.end_byte());
            fixes.push(deleted.insert(question, format!(" extends {shown} Object")));
        }
    }
    context.report_fixed("NullableWildcard", annotated.at, annotated.at.start_byte(), "Nullness annotations directly on wildcard types are interpreted differently by different tools", &fixes);
}

pub fn nullable_type_parameter(context: &Context, node: Node) {
    if node.kind() != "type_parameter" {
        return;
    }
    let relevant = relevant_ones(&annotations_in(context, node));
    if relevant.is_empty() {
        return;
    }
    let mut fixes = Vec::new();
    if let [only] = relevant.as_slice() {
        let shown = only.shown(context);
        let deleted = Fix::new().delete(only.start, only.end);
        let bounds: Vec<Node> = children(node).into_iter().find(|part| part.kind() == "type_bound").map(named_children).unwrap_or_default();
        let annotated_bound = bounds.iter().any(|bound| bound.kind() == "annotated_type" && !relevant_ones(&annotations_in(context, *bound)).is_empty());
        if !annotated_bound {
            if bounds.is_empty() {
                fixes.push(deleted.insert(node.end_byte(), format!(" extends {shown} Object")));
            } else {
                fixes.push(bounds.iter().fold(deleted, |fix, bound| fix.insert(bound.start_byte(), format!("{shown} "))));
            }
        }
    }
    context.report_fixed("NullableTypeParameter", node, node.start_byte(), "Nullness annotations directly on type parameters are interpreted differently by different tools", &fixes);
}

