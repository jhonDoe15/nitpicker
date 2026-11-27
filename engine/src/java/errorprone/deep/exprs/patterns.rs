//! `instanceof`, patterns and lambdas.
use super::super::tree::{Build, parts, token};
use crate::engine::source::children;
use tree_sitter::Node;

impl<'c, 't> Build<'c, 't> {
    pub fn instance_of(&mut self, node: Node<'t>, level: usize) {
        self.push(level, "INSTANCE_OF", token(node, "instanceof"), Some(node));
        if let Some(left) = node.child_by_field_name("left") {
            self.expr(left, level + 1);
        }
        if let Some(pattern) = node.child_by_field_name("pattern") {
            self.pattern(pattern, level + 1);
            return;
        }
        let Some(right) = node.child_by_field_name("right") else { return };
        match node.child_by_field_name("name") {
            Some(name) => self.binding(node, right, Some(name), level + 1),
            None => self.ty(right, level + 1),
        }
    }

    /// A binding pattern: javac puts `final` and the annotations before the type among the variable's modifiers.
    pub fn binding(&mut self, holder: Node<'t>, written: Node<'t>, name: Option<Node<'t>>, level: usize) {
        let keyword = children(holder).into_iter().find(|part| part.kind() == "final").map(|part| part.start_byte());
        let (annotations, base) = if written.kind() == "annotated_type" {
            let found = parts(written);
            let base = found.iter().copied().find(|part| !part.kind().ends_with("annotation"));
            (found.into_iter().filter(|part| part.kind().ends_with("annotation")).collect(), base)
        } else {
            (Vec::new(), Some(written))
        };
        let modified = keyword.or(annotations.first().map(|first| first.start_byte()));
        self.push(level, "BINDING_PATTERN", Some(modified.unwrap_or(written.start_byte())), Some(holder));
        self.push(level + 1, "VARIABLE", name.map(|name| name.start_byte()), Some(holder));
        if self.suppressed(holder) {
            return;
        }
        self.push(level + 2, "MODIFIERS", modified, None);
        for annotation in annotations {
            self.annotation(annotation, level + 3, "ANNOTATION");
        }
        match base {
            Some(base) if self.text(base) == "var" => self.made(level + 2, None, super::super::types::UNKNOWN),
            Some(base) => self.ty(base, level + 2),
            None => self.give_up(line!()),
        }
        self.null(level + 2);
        self.null(level + 2);
    }

    pub fn pattern(&mut self, pattern: Node<'t>, level: usize) {
        match pattern.kind() {
            "pattern" => {
                for inner in parts(pattern) {
                    self.pattern(inner, level);
                }
            }
            "type_pattern" | "record_pattern_component" => {
                let found = parts(pattern);
                let name = found.iter().rev().find(|part| part.kind() == "identifier").copied();
                let written = found.iter().find(|part| !matches!(part.kind(), "identifier" | "modifiers")).copied();
                if found.iter().any(|part| matches!(part.kind(), "underscore_pattern" | "record_pattern")) {
                    for inner in found {
                        self.pattern(inner, level);
                    }
                    return;
                }
                match written {
                    Some(written) => self.binding(pattern, written, name, level),
                    None => self.give_up(line!()),
                }
            }
            "record_pattern" => {
                self.push(level, "DECONSTRUCTION_PATTERN", Some(pattern.start_byte()), Some(pattern));
                for part in parts(pattern) {
                    match part.kind() {
                        "record_pattern_body" => {
                            for inner in parts(part) {
                                self.pattern(inner, level + 1);
                            }
                        }
                        _ => self.ty(part, level + 1),
                    }
                }
            }
            _ => self.give_up(line!()),
        }
    }

    pub fn lambda(&mut self, node: Node<'t>, level: usize) {
        self.push(level, "LAMBDA_EXPRESSION", Some(node.start_byte()), Some(node));
        if let Some(parameters) = node.child_by_field_name("parameters") {
            match parameters.kind() {
                "identifier" => {
                    let typed = self.implicit_type(node, 0);
                    self.variable(parameters, Some(parameters.start_byte()), level + 1, typed, None);
                }
                "inferred_parameters" => {
                    for (index, name) in parts(parameters).into_iter().enumerate() {
                        let typed = self.implicit_type(node, index);
                        self.variable(name, Some(name.start_byte()), level + 1, typed, None);
                    }
                }
                _ => {
                    for parameter in parts(parameters) {
                        self.parameter(parameter, level + 1);
                    }
                }
            }
        }
        if let Some(body) = node.child_by_field_name("body") {
            if body.kind() == "block" { self.statement(body, level + 1) } else { self.expr(body, level + 1) }
        }
    }
}
