//! Type trees: written ones, and the ones javac makes up for `var`, lambda parameters and an anonymous class's
//! constructor, whose depth the engine takes from the types it works out, within a span.
use super::tree::{Build, parts};
use crate::engine::source::children;
use tree_sitter::Node;

mod made;
pub use made::UNKNOWN;

pub const TYPES: [&str; 10] = [
    "type_identifier", "scoped_type_identifier", "generic_type", "array_type", "annotated_type", "integral_type",
    "floating_point_type", "boolean_type", "void_type", "wildcard",
];

/// An array layer of a type: where javac puts the outermost layer, its `[`, and the annotations.
type Layer<'t> = (usize, usize, Vec<Node<'t>>);

/// The bracket pairs of `dimensions` nodes. javac puts the outermost array type, and its annotated type, at the
/// annotations before the `[`, and after a primitive type at the `[`; the inner ones, and the ones written after a
/// name, at their `[`.
pub fn brackets<'t>(groups: &[Node<'t>], primitive: bool) -> Vec<Layer<'t>> {
    let mut found = Vec::new();
    for group in groups {
        let mut annotations: Vec<Node<'t>> = Vec::new();
        for part in children(*group) {
            match part.kind() {
                "annotation" | "marker_annotation" => annotations.push(part),
                "[" => {
                    let at = annotations.first().filter(|_| !primitive).map_or(part.start_byte(), |first| first.start_byte());
                    found.push((at, part.start_byte(), std::mem::take(&mut annotations)));
                }
                _ => {}
            }
        }
    }
    found
}

pub fn is_primitive(node: Option<Node>) -> bool {
    node.is_some_and(|node| matches!(node.kind(), "integral_type" | "floating_point_type" | "boolean_type" | "void_type"))
}

impl<'c, 't> Build<'c, 't> {
    pub fn is_type(&self, node: Node) -> bool {
        TYPES.contains(&node.kind())
    }

    /// Whether a written type names an interface.
    pub fn is_interface(&self, written: Node) -> bool {
        let resolver = self.context.resolver;
        resolver.type_node(written).and_then(|kind| resolver.index.get(&kind.erased().name())).is_some_and(|info| info.is_interface)
    }

    /// A type with array brackets around it: each group wraps the type before it, the first bracket of a group the
    /// outermost; javac makes the `...` the innermost array.
    pub fn typed(&mut self, written: Node<'t>, groups: &[Node<'t>], ellipsis: Option<Node<'t>>, level: usize) {
        let (base, own) = match written.kind() {
            "array_type" => (written.child_by_field_name("element"), written.child_by_field_name("dimensions")),
            _ => (Some(written), None),
        };
        let mut layers: Vec<Layer<'t>> = Vec::new();
        let primitive = is_primitive(base);
        for group in groups.iter().rev() {
            layers.extend(brackets(&[*group], primitive).into_iter().map(|(_, bracket, annotations)| (bracket, bracket, annotations)));
        }
        layers.extend(brackets(&own.into_iter().collect::<Vec<_>>(), primitive));
        if let Some(ellipsis) = ellipsis {
            if ellipsis.parent().is_none_or(|holder| self.masked(holder, written.end_byte(), ellipsis.start_byte())) {
                self.give_up(line!());
            }
            layers.push((ellipsis.start_byte(), ellipsis.start_byte(), Vec::new()));
        }
        let level = self.layers(layers, level, true);
        match base {
            Some(base) => self.ty(base, level),
            None => self.give_up(line!()),
        }
    }

    /// The grammar drops the annotations between a `...` parameter's type and the `...`, and on the alternatives of a
    /// multi-catch: whether the holder's text in the range has an `@` outside comments.
    pub fn masked(&self, holder: Node<'t>, from: usize, to: usize) -> bool {
        let mut comments: Vec<Node<'t>> = Vec::new();
        crate::engine::source::walk(holder, |part| {
            if part.kind().ends_with("comment") {
                comments.push(part);
            }
        });
        (from..to).any(|at| {
            self.context.file.text.as_bytes()[at] == b'@' && !comments.iter().any(|comment| comment.byte_range().contains(&at))
        })
    }

    /// Array layers, outermost first; the level of what they hold. In `new T[n][]` no empty layer is the outermost.
    pub fn layers(&mut self, layers: Vec<Layer<'t>>, level: usize, outer: bool) -> usize {
        let mut level = level;
        for (index, (outermost, bracket, annotations)) in layers.into_iter().enumerate() {
            let at = if index == 0 && outer { outermost } else { bracket };
            if !annotations.is_empty() {
                self.push(level, "ANNOTATED_TYPE", Some(at), None);
                for annotation in annotations {
                    self.annotation(annotation, level + 1, "TYPE_ANNOTATION");
                }
                level += 1;
            }
            self.push(level, "ARRAY_TYPE", Some(at), None);
            level += 1;
        }
        level
    }

    /// Annotations before a type: javac puts them on its innermost name, `@A x.Y` is a member select of `@A x`, and
    /// `@A L<T>` a parameterized type of `@A L`.
    pub fn annotated(&mut self, annotations: &[Node<'t>], base: Option<Node<'t>>, me: Option<Node<'t>>, level: usize) {
        if let Some(generic) = base.filter(|part| part.kind() == "generic_type") {
            let found = parts(generic);
            let arguments = found.iter().find(|part| part.kind() == "type_arguments").copied();
            self.push(level, "PARAMETERIZED_TYPE", arguments.map(|list| list.start_byte()), Some(generic));
            self.annotated(annotations, found.first().copied(), me, level + 1);
            for argument in arguments.map(parts).unwrap_or_default() {
                self.ty(argument, level + 1);
            }
            return;
        }
        let mut level = level;
        let mut base = base;
        while let Some(scoped) = base.filter(|part| part.kind() == "scoped_type_identifier") {
            let dot = children(scoped).into_iter().find(|part| part.kind() == ".").map(|part| part.start_byte());
            self.push(level, "MEMBER_SELECT", dot, Some(scoped));
            level += 1;
            base = parts(scoped).into_iter().next();
        }
        let at = if is_primitive(base) { base.map(|base| base.start_byte()) } else { annotations.first().map(|first| first.start_byte()) };
        self.push(level, "ANNOTATED_TYPE", at, me);
        for annotation in annotations {
            self.annotation(*annotation, level + 1, "TYPE_ANNOTATION");
        }
        match base {
            Some(base) => self.ty(base, level + 1),
            None => self.give_up(line!()),
        }
    }

    /// The type of a creation, after the annotations written after `new`.
    pub fn created(&mut self, creation: Node<'t>, written: Node<'t>, level: usize) {
        let annotations: Vec<Node<'t>> = parts(creation).into_iter().filter(|part| part.kind().ends_with("annotation")).collect();
        if annotations.is_empty() {
            self.ty(written, level);
        } else {
            self.annotated(&annotations, Some(written), None, level);
        }
    }

    pub fn ty(&mut self, written: Node<'t>, level: usize) {
        let me = Some(written);
        let at = Some(written.start_byte());
        match written.kind() {
            "type_identifier" | "identifier" => self.push(level, "IDENTIFIER", at, me),
            "integral_type" | "floating_point_type" | "boolean_type" | "void_type" => self.push(level, "PRIMITIVE_TYPE", at, me),
            "array_type" => self.typed(written, &[], None, level),
            "scoped_type_identifier" | "scoped_identifier" | "field_access" => {
                let found = parts(written);
                let annotations: Vec<Node<'t>> = found.iter().copied().filter(|part| part.kind().ends_with("annotation")).collect();
                let dot = children(written).into_iter().find(|part| part.kind() == ".").map(|part| part.start_byte());
                let mut level = level;
                if let Some(first) = annotations.first() {
                    self.push(level, "ANNOTATED_TYPE", Some(first.start_byte()), None);
                    for annotation in &annotations {
                        self.annotation(*annotation, level + 1, "TYPE_ANNOTATION");
                    }
                    level += 1;
                }
                self.push(level, "MEMBER_SELECT", dot, me);
                if let Some(left) = found.first() {
                    self.ty(*left, level + 1);
                }
            }
            "generic_type" => {
                let found = parts(written);
                let arguments = found.iter().find(|part| part.kind() == "type_arguments").copied();
                self.push(level, "PARAMETERIZED_TYPE", arguments.map(|list| list.start_byte()), me);
                if let Some(clazz) = found.first() {
                    self.ty(*clazz, level + 1);
                }
                for argument in arguments.map(parts).unwrap_or_default() {
                    self.ty(argument, level + 1);
                }
            }
            "annotated_type" => {
                let found = parts(written);
                if let Some(array) = found.iter().find(|part| part.kind() == "array_type") {
                    let element = array.child_by_field_name("element");
                    let layers = brackets(&array.child_by_field_name("dimensions").into_iter().collect::<Vec<_>>(), is_primitive(element));
                    let level = self.layers(layers, level, true);
                    self.push(level, "ANNOTATED_TYPE", at, me);
                    for part in &found {
                        if part.kind().ends_with("annotation") {
                            self.annotation(*part, level + 1, "TYPE_ANNOTATION");
                        }
                    }
                    match element {
                        Some(element) => self.ty(element, level + 1),
                        None => self.give_up(line!()),
                    }
                    return;
                }
                let annotations: Vec<Node<'t>> = found.iter().copied().filter(|part| part.kind().ends_with("annotation")).collect();
                let base = found.iter().copied().find(|part| !part.kind().ends_with("annotation"));
                self.annotated(&annotations, base, me, level);
            }
            "wildcard" => self.wildcard(written, level),
            "this" | "super" => self.push(level, "IDENTIFIER", at, me),
            _ => self.give_up(line!()),
        }
    }

    pub fn wildcard(&mut self, written: Node<'t>, level: usize) {
        let found = parts(written);
        let annotations: Vec<Node<'t>> = found.iter().copied().filter(|part| part.kind().ends_with("annotation")).collect();
        let mut level = level;
        if let Some(first) = annotations.first() {
            self.push(level, "ANNOTATED_TYPE", Some(first.start_byte()), None);
            for annotation in &annotations {
                self.annotation(*annotation, level + 1, "TYPE_ANNOTATION");
            }
            level += 1;
        }
        let question = children(written).into_iter().find(|part| part.kind() == "?").map(|part| part.start_byte());
        let bound = found.iter().find(|part| !part.kind().ends_with("annotation") && part.kind() != "super").copied();
        let kind = match bound {
            None => "UNBOUNDED_WILDCARD",
            Some(_) if children(written).iter().any(|part| part.kind() == "super") => "SUPER_WILDCARD",
            Some(_) => "EXTENDS_WILDCARD",
        };
        self.push(level, kind, question, Some(written));
        match bound {
            Some(bound) => self.ty(bound, level + 1),
            None => self.null(level + 1),
        }
    }

    /// `new T[n][]`: the element type holds the empty brackets; the annotations on sized brackets come last.
    pub fn new_array(&mut self, node: Node<'t>, level: usize) {
        self.push(level, "NEW_ARRAY", Some(self.pref(node)), Some(node));
        let value = node.child_by_field_name("value");
        let base = node.child_by_field_name("type");
        let mut cursor = node.walk();
        let dimensions: Vec<Node<'t>> = node.children_by_field_name("dimensions", &mut cursor).collect();
        let empty: Vec<Node<'t>> = dimensions.iter().copied().filter(|part| part.kind() == "dimensions").collect();
        let mut pairs = brackets(&empty, is_primitive(base));
        if value.is_some() && !pairs.is_empty() && !pairs.remove(0).2.is_empty() {
            self.give_up(line!());
        }
        let inner = self.layers(pairs, level + 1, false);
        match base {
            Some(base) => self.created(node, base, inner),
            None => self.give_up(line!()),
        }
        let sized: Vec<Node<'t>> = dimensions.iter().copied().filter(|part| part.kind() == "dimensions_expr").collect();
        for size in &sized {
            for expression in parts(*size).into_iter().filter(|part| !part.kind().ends_with("annotation")) {
                self.expr(expression, level + 1);
            }
        }
        for item in value.map(parts).unwrap_or_default() {
            self.expr(item, level + 1);
        }
        for annotation in sized.iter().flat_map(|size| parts(*size)).filter(|part| part.kind().ends_with("annotation")) {
            self.annotation(annotation, level + 1, "TYPE_ANNOTATION");
        }
    }

}
