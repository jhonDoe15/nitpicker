//! The constructors javac adds or fills in: default, anonymous and record constructors, and `super()` calls.
use super::{Build, parts};
use crate::engine::source::children;
use crate::java::types::model::target;
use crate::java::types::model::Type;
use tree_sitter::Node;

impl<'c, 't> Build<'c, 't> {
    /// A constructor body: javac puts `super();` first when it does not start with `this(...)` or `super(...)`.
    pub fn constructor_body(&mut self, body: Node<'t>, level: usize) {
        self.push(level, "BLOCK", Some(body.start_byte()), Some(body));
        let statements = super::statements(body);
        if statements.first().is_none_or(|first| first.kind() != "explicit_constructor_invocation") {
            self.super_call(level + 1, Some(body.start_byte()), 0);
        }
        for statement in statements {
            self.statement(statement, level + 1);
        }
    }

    /// `super(x0, ..)` at a position, as javac writes it.
    pub fn super_call(&mut self, level: usize, at: Option<usize>, arguments: usize) {
        self.push(level, "EXPRESSION_STATEMENT", at, None);
        self.push(level + 1, "METHOD_INVOCATION", at, None);
        for _ in 0..=arguments {
            self.push(level + 2, "IDENTIFIER", at, None);
        }
    }

    /// A constructor javac writes: a method at the class with the parameters and a body calling `super`.
    pub fn made_constructor(&mut self, level: usize, at: Option<usize>, parameters: &[(usize, usize)], thrown: &[(usize, usize)]) {
        self.push(level, "METHOD", at, None);
        self.push(level + 1, "MODIFIERS", None, None);
        self.null(level + 1);
        for span in parameters {
            self.push(level + 1, "VARIABLE", at, None);
            self.push(level + 2, "MODIFIERS", None, None);
            self.made(level + 2, at, *span);
            self.null(level + 2);
            self.null(level + 2);
        }
        self.null(level + 1);
        for span in thrown {
            self.made(level + 1, Some(0), *span);
        }
        self.push(level + 1, "BLOCK", at, None);
        self.super_call(level + 2, at, parameters.len());
        self.null(level + 1);
    }

    pub fn default_constructor(&mut self, level: usize, at: Option<usize>, parameters: &[(usize, usize)]) {
        self.made_constructor(level, at, parameters, &[]);
    }

    pub fn anonymous_constructor(&mut self, level: usize, at: Option<usize>, creation: Option<Node<'t>>) {
        let Some(creation) = creation else { return };
        match self.anonymous_parameters(creation) {
            Some((parameters, thrown)) => self.made_constructor(level, at, &parameters, &thrown),
            None => self.give_up(line!()),
        }
    }

    pub fn components(&self, record: Node<'t>) -> Vec<Node<'t>> {
        record.child_by_field_name("parameters").map(parts).unwrap_or_default()
    }

    /// A record's members start with a field per component; a record without a canonical constructor gets one first.
    pub fn record_members(&mut self, record: Node<'t>, level: usize, at: Option<usize>, items: &[Node<'t>]) {
        let components = self.components(record);
        let mut declared = false;
        for item in items {
            match self.is_canonical(*item, &components) {
                Some(found) => declared |= found,
                None => self.give_up(line!()),
            }
        }
        if !declared {
            self.push(level, "METHOD", at, None);
            self.push(level + 1, "MODIFIERS", None, None);
            self.null(level + 1);
            for component in &components {
                self.copied_parameter(*component, at, None, level + 1);
            }
            self.null(level + 1);
            self.push(level + 1, "BLOCK", at, None);
            self.super_call(level + 2, at, 0);
            self.null(level + 1);
        }
        self.applicable = target::bit("FIELD");
        for component in &components {
            self.parameter(*component, level);
        }
        self.applicable = 0;
    }

    /// A parameter javac copies from a record component, at a position, with its modifiers at another.
    pub fn copied_parameter(&mut self, component: Node<'t>, at: Option<usize>, modifiers: Option<usize>, level: usize) {
        self.push(level, "VARIABLE", at, Some(component));
        self.applicable = target::bit("PARAMETER");
        self.modifiers(component, level + 1, None, &[]);
        self.applicable = 0;
        if let Some(last) = self.slots.iter_mut().rev().find(|slot| slot.level == level + 1) {
            last.pos = modifiers.filter(|_| last.node.is_some());
        }
        match super::written_type(component) {
            Some(written) => {
                let ellipsis = children(component).into_iter().find(|part| part.kind() == "...");
                self.typed(written, &[], ellipsis, level + 1);
            }
            None => self.give_up(line!()),
        }
        self.null(level + 1);
        self.null(level + 1);
    }

    /// Whether a member is the record's canonical constructor: its parameter types are the components' types. `None`
    /// where the engine cannot tell.
    pub fn is_canonical(&self, item: Node<'t>, components: &[Node<'t>]) -> Option<bool> {
        if item.kind() == "compact_constructor_declaration" {
            return Some(true);
        }
        let parameters = item.child_by_field_name("parameters").map(parts).unwrap_or_default();
        if item.kind() != "constructor_declaration" || parameters.len() != components.len() {
            return Some(false);
        }
        let shape = |node: Node| -> (Option<Type>, String) {
            let written = super::written_type(node);
            let mut brackets = node.child_by_field_name("dimensions").map_or(0, |found| self.text(found).matches('[').count());
            brackets += usize::from(children(node).iter().any(|part| part.kind() == "..."));
            let text: String = written.map_or("", |found| self.text(found)).split_whitespace().collect();
            let kind = written.and_then(|found| self.context.resolver.type_node(found));
            (kind.map(|kind| (0..brackets).fold(kind, |inner, _| Type::Array(Box::new(inner)))), format!("{text}{}", "[]".repeat(brackets)))
        };
        let mut same = true;
        for (one, other) in parameters.iter().zip(components) {
            match (shape(*one), shape(*other)) {
                ((Some(left), _), (Some(right), _)) => same &= left == right,
                ((_, left), (_, right)) if left == right => {}
                _ => return None,
            }
        }
        Some(same)
    }

    /// A compact constructor: javac gives it the components as parameters, at each component.
    pub fn compact_constructor(&mut self, method: Node<'t>, level: usize) {
        let name = method.child_by_field_name("name").map(|name| name.start_byte());
        self.push(level, "METHOD", name, Some(method));
        if self.suppressed(method) {
            return;
        }
        let record = crate::engine::source::ancestor(method, &["record_declaration"]);
        self.modifiers(method, level + 1, None, &[]);
        self.null(level + 1);
        for component in record.map(|record| self.components(record)).unwrap_or_default() {
            self.copied_parameter(component, Some(component.start_byte()), Some(component.start_byte()), level + 1);
        }
        self.null(level + 1);
        match method.child_by_field_name("body") {
            Some(body) => self.constructor_body(body, level + 1),
            None => self.null(level + 1),
        }
        self.null(level + 1);
    }
}
