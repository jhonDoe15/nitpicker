//! Modifiers and annotations, and the annotations javac drops from what it copies from a record component.
use super::{Build, parts, token};
use crate::engine::source::children;
use crate::java::types::model::target;
use tree_sitter::Node;

impl<'c, 't> Build<'c, 't> {
    /// `MODIFIERS`, with the annotations among the modifiers and any written elsewhere on the declaration.
    pub fn modifiers(&mut self, holder: Node<'t>, level: usize, fallback: Option<usize>, more: &[Node<'t>]) {
        let modifiers = children(holder).into_iter().find(|part| part.kind() == "modifiers");
        let pos = modifiers.map(|found| found.start_byte()).or(fallback);
        self.push(level, "MODIFIERS", pos, modifiers);
        let mut annotations: Vec<Node<'t>> = modifiers.map(parts).unwrap_or_default();
        annotations.extend(more.iter().copied());
        for annotation in annotations.into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")) {
            if self.applies(annotation) {
                self.annotation(annotation, level + 1, "ANNOTATION");
            }
        }
    }

    /// javac drops a record component's annotation from a copy whose kind its `@Target` leaves out.
    pub fn applies(&mut self, annotation: Node<'t>) -> bool {
        if self.applicable == 0 {
            return true;
        }
        let resolver = &self.context.resolver;
        let class = annotation.child_by_field_name("name").and_then(|name| resolver.class_name(annotation, self.text(name)));
        match class.and_then(|class| resolver.index.get(&class)) {
            Some(info) => info.targets.is_none_or(|bits| bits & (self.applicable | target::bit("TYPE_USE")) != 0),
            None => {
                self.give_up(line!());
                true
            }
        }
    }

    pub fn annotation(&mut self, annotation: Node<'t>, level: usize, kind: &'static str) {
        self.push(level, kind, Some(annotation.start_byte()), Some(annotation));
        if let Some(name) = annotation.child_by_field_name("name") {
            self.name(name, level + 1);
        }
        let Some(list) = annotation.child_by_field_name("arguments") else { return };
        let values = parts(list);
        for value in &values {
            if value.kind() == "element_value_pair" {
                let equals = token(*value, "=");
                self.push(level + 1, "ASSIGNMENT", equals, Some(*value));
                if let Some(key) = value.child_by_field_name("key") {
                    self.push(level + 2, "IDENTIFIER", Some(key.start_byte()), Some(key));
                }
                if let Some(inner) = value.child_by_field_name("value") {
                    self.element_value(inner, level + 2);
                }
            } else {
                let at = self.pref(*value);
                self.push(level + 1, "ASSIGNMENT", Some(at), None);
                self.push(level + 2, "IDENTIFIER", Some(at), None);
                self.element_value(*value, level + 2);
            }
        }
    }

    pub fn element_value(&mut self, value: Node<'t>, level: usize) {
        match value.kind() {
            "element_value_array_initializer" => {
                self.push(level, "NEW_ARRAY", Some(value.start_byte()), Some(value));
                self.null(level + 1);
                for item in parts(value) {
                    self.element_value(item, level + 1);
                }
            }
            "annotation" | "marker_annotation" => self.annotation(value, level, "ANNOTATION"),
            _ => self.expr(value, level),
        }
    }

    pub fn annotation_value(&mut self, value: Node<'t>, level: usize) {
        match value.kind() {
            "element_value_array_initializer" => {
                self.push(level, "NEW_ARRAY", Some(value.start_byte()), Some(value));
                self.null(level + 1);
                for item in parts(value) {
                    self.annotation_value(item, level + 1);
                }
            }
            "annotation" | "marker_annotation" => self.annotation(value, level, "ANNOTATION"),
            _ => self.expr(value, level),
        }
    }
}
