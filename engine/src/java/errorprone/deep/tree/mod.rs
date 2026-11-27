//! The slots of javac's attributed tree, built from the parse: the compilation unit, classes and their members, with
//! the constructors and `super()` calls javac adds, modifiers and annotations.
mod annotations;
mod constructors;
mod members;
mod statements;

use super::super::Context;
use super::{CHECK, Slot};
use crate::engine::source::{children, named_children};
use tree_sitter::Node;

pub struct Build<'c, 't> {
    pub context: &'c Context<'c>,
    pub slots: Vec<Slot<'t>>,
    /// The parse holds a tree the engine does not model.
    pub unsure: bool,
    /// The source line of the engine where it gave up, for the dump.
    pub why: u32,
    /// The `@Target` element types a record component's annotations must allow to stay on the tree javac copies them
    /// to (`TYPE_USE` always does), or 0 outside a component.
    pub applicable: u16,
}

/// The named children without comments.
pub fn parts(node: Node) -> Vec<Node> {
    named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

/// The statements of a block or a switch group: the named children and the `;` of empty statements.
pub fn statements(node: Node) -> Vec<Node> {
    children(node).into_iter().filter(|part| (part.is_named() && !part.kind().ends_with("comment")) || part.kind() == ";").collect()
}

/// The type of a parameter or a record component; a `...` one has no `type` field.
pub fn written_type(holder: Node) -> Option<Node> {
    let skipped = ["variable_declarator", "identifier", "modifiers", "annotation", "marker_annotation"];
    holder.child_by_field_name("type").or_else(|| parts(holder).into_iter().find(|part| !skipped.contains(&part.kind())))
}

/// The first token child with this text.
pub fn token(node: Node, text: &str) -> Option<usize> {
    children(node).into_iter().find(|part| !part.is_named() && part.kind() == text).map(|part| part.start_byte())
}

pub const CLASSES: [&str; 5] = ["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

/// Where a variable's type comes from.
pub enum Typed<'t> {
    /// A written type, with the bracket groups written after it (`int x[]`, `int f()[]`) and a `...`.
    Written(Node<'t>, Vec<Node<'t>>, Option<Node<'t>>),
    /// A type javac makes up, at a position, of a depth within the span.
    Made(Option<usize>, (usize, usize)),
}

impl<'c, 't> Build<'c, 't> {
    pub fn new(context: &'c Context<'c>) -> Self {
        Build { context, slots: Vec::new(), unsure: false, why: 0, applicable: 0 }
    }
    pub fn text(&self, node: Node) -> &'c str {
        &self.context.file.text[node.byte_range()]
    }
    pub fn give_up(&mut self, line: u32) {
        if !self.unsure {
            self.why = line;
        }
        self.unsure = true;
    }
    pub fn push(&mut self, level: usize, kind: &'static str, pos: Option<usize>, node: Option<Node<'t>>) {
        self.slots.push(Slot { level, kind, pos, node, span: (0, 0), cut: false });
    }
    pub fn null(&mut self, level: usize) {
        self.push(level, "NULL", None, None);
    }
    pub fn made(&mut self, level: usize, pos: Option<usize>, span: (usize, usize)) {
        self.slots.push(Slot { level, kind: "?", pos, node: None, span, cut: false });
    }
    /// Error Prone's scan skips what a `@SuppressWarnings` on a declaration turns off, after the depth test.
    pub fn suppressed(&mut self, declaration: Node) -> bool {
        let cut = self.context.suppressed(CHECK, declaration);
        if let Some(last) = self.slots.last_mut().filter(|_| cut) {
            last.cut = true;
        }
        cut
    }

    /// javac reads unicode escapes before it parses; the parse does not, outside literals and comments.
    pub fn escaped(&self, root: Node<'t>) -> bool {
        let text = &self.context.file.text;
        if text.contains("\\uu") {
            return true;
        }
        let mut found = false;
        crate::engine::source::walk(root, |node| {
            let literal = matches!(node.kind(), "string_fragment" | "escape_sequence" | "multiline_string_fragment" | "character_literal") || node.kind().ends_with("comment");
            if node.child_count() == 0 && !literal && text[node.byte_range()].contains("\\u") {
                found = true;
            }
        });
        found
    }

    pub fn unit(&mut self, root: Node<'t>) {
        if self.escaped(root) {
            self.give_up(line!());
            return;
        }
        let all: Vec<Node<'t>> = children(root).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
        let last_import = all.iter().rposition(|part| part.kind() == "import_declaration").unwrap_or(0);
        let items: Vec<Node<'t>> = all.iter().enumerate().filter(|(index, part)| part.kind() != ";" || *index > last_import).map(|(_, part)| *part).collect();
        self.push(0, "COMPILATION_UNIT", Some(all.first().map_or(self.context.file.text.len(), |first| first.start_byte())), Some(root));
        match items.iter().find(|part| part.kind() == "package_declaration") {
            Some(package) => {
                self.push(1, "PACKAGE", token(*package, "package"), Some(*package));
                for part in parts(*package) {
                    match part.kind() {
                        "annotation" | "marker_annotation" => self.annotation(part, 2, "ANNOTATION"),
                        _ => self.name(part, 2),
                    }
                }
            }
            None => self.null(1),
        }
        for part in items.iter().filter(|part| part.kind() != "package_declaration") {
            match part.kind() {
                kind if CLASSES.contains(&kind) => self.class(*part, 1, None),
                "import_declaration" => self.import(*part),
                ";" => self.push(1, "EMPTY_STATEMENT", Some(part.start_byte()), Some(*part)),
                _ => self.give_up(line!()),
            }
        }
        self.null(1);
    }

    pub fn import(&mut self, import: Node<'t>) {
        self.push(1, "IMPORT", Some(import.start_byte()), Some(import));
        let found = parts(import);
        let Some(name) = found.iter().find(|part| part.kind() != "asterisk") else { return };
        if found.iter().any(|part| part.kind() == "asterisk") {
            let dot = children(import).into_iter().filter(|part| part.kind() == ".").last().map(|part| part.start_byte());
            self.push(2, "MEMBER_SELECT", dot, Some(import));
            self.name(*name, 3);
        } else {
            self.name(*name, 2);
        }
    }

    /// A dotted name: an identifier, or a member select of the name before the last dot.
    pub fn name(&mut self, name: Node<'t>, level: usize) {
        match name.kind() {
            "scoped_identifier" => {
                self.push(level, "MEMBER_SELECT", token(name, "."), Some(name));
                if let Some(scope) = name.child_by_field_name("scope") {
                    self.name(scope, level + 1);
                }
            }
            _ => self.push(level, "IDENTIFIER", Some(name.start_byte()), Some(name)),
        }
    }

    pub fn type_parameter(&mut self, parameter: Node<'t>, level: usize) {
        self.push(level, "TYPE_PARAMETER", Some(parameter.start_byte()), Some(parameter));
        for part in parts(parameter) {
            match part.kind() {
                "annotation" | "marker_annotation" => self.annotation(part, level + 1, "TYPE_ANNOTATION"),
                "type_bound" => {
                    for bound in parts(part) {
                        self.ty(bound, level + 1);
                    }
                }
                _ => {}
            }
        }
    }

    /// A variable: modifiers, type, an empty name slot and the initializer.
    pub fn variable(&mut self, declaration: Node<'t>, pos: Option<usize>, level: usize, typed: Typed<'t>, init: Option<Node<'t>>) {
        self.push(level, "VARIABLE", pos, Some(declaration));
        if self.suppressed(declaration) {
            return;
        }
        self.modifiers(declaration, level + 1, None, &[]);
        match typed {
            Typed::Written(written, groups, ellipsis) => self.typed(written, &groups, ellipsis, level + 1),
            Typed::Made(at, span) => self.made(level + 1, at, span),
        }
        self.null(level + 1);
        match init {
            Some(value) if value.kind() == "array_initializer" => self.expr(value, level + 1),
            Some(value) => self.expr(value, level + 1),
            None => self.null(level + 1),
        }
    }

    /// The members of a class body, with what javac adds: a default constructor, a record's fields and constructor.
    pub fn members(&mut self, class: Node<'t>, level: usize, at: Option<usize>, anonymous: Option<Node<'t>>) {
        let body = if class.kind() == "class_body" { Some(class) } else { class.child_by_field_name("body") };
        let mut items: Vec<Node<'t>> = body.map(parts).unwrap_or_default();
        if let Some(position) = items.iter().position(|part| part.kind() == "enum_body_declarations") {
            let tail = parts(items.remove(position));
            items.extend(tail);
        }
        let constructors = items.iter().any(|part| matches!(part.kind(), "constructor_declaration" | "compact_constructor_declaration"));
        match class.kind() {
            "class_declaration" | "enum_declaration" if !constructors => self.default_constructor(level, at, &[]),
            "class_body" => self.anonymous_constructor(level, at, anonymous),
            "record_declaration" => self.record_members(class, level, at, &items),
            _ => {}
        }
        let enum_name = (class.kind() == "enum_declaration").then(|| class.child_by_field_name("name")).flatten();
        for item in items {
            self.member(item, level, enum_name);
        }
    }

    pub fn member(&mut self, item: Node<'t>, level: usize, enum_name: Option<Node<'t>>) {
        match item.kind() {
            "field_declaration" | "constant_declaration" => self.fields(item, level),
            "method_declaration" | "constructor_declaration" | "annotation_type_element_declaration" => self.method(item, level),
            "compact_constructor_declaration" => self.compact_constructor(item, level),
            "block" => self.statement(item, level),
            "static_initializer" => {
                self.push(level, "BLOCK", Some(item.start_byte()), Some(item));
                for block in parts(item) {
                    for statement in statements(block) {
                        self.statement(statement, level + 1);
                    }
                }
            }
            "enum_constant" => self.enum_constant(item, level, enum_name),
            kind if CLASSES.contains(&kind) => self.class(item, level, None),
            _ => self.give_up(line!()),
        }
    }

    pub fn fields(&mut self, declaration: Node<'t>, level: usize) {
        let Some(written) = declaration.child_by_field_name("type") else { return };
        let mut cursor = declaration.walk();
        let declarators: Vec<Node<'t>> = declaration.children_by_field_name("declarator", &mut cursor).collect();
        for declarator in declarators {
            let name = declarator.child_by_field_name("name").map(|name| name.start_byte());
            let groups: Vec<Node<'t>> = declarator.child_by_field_name("dimensions").into_iter().collect();
            let typed = if self.text(written) == "var" && groups.is_empty() {
                self.local_type(declarator)
            } else {
                Typed::Written(written, groups, None)
            };
            self.variable(declaration, name, level, typed, declarator.child_by_field_name("value"));
        }
    }
}
