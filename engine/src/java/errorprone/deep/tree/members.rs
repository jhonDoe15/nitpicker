//! Classes, methods, parameters and enum constants.
use super::{Build, CLASSES, Typed, parts, token, written_type};
use crate::engine::source::children;
use tree_sitter::Node;

pub fn kind_of(class: Node) -> &'static str {
    match class.kind() {
        "interface_declaration" => "INTERFACE",
        "enum_declaration" => "ENUM",
        "record_declaration" => "RECORD",
        "annotation_type_declaration" => "ANNOTATION_TYPE",
        _ => "CLASS",
    }
}

pub fn keyword(class: Node) -> Option<usize> {
    let word = match class.kind() {
        "annotation_type_declaration" => return children(class).into_iter().find(|part| part.kind() == "@interface").map(|part| part.start_byte() + 1),
        "interface_declaration" => "interface",
        "enum_declaration" => "enum",
        "record_declaration" => "record",
        _ => "class",
    };
    token(class, word)
}

/// The types of a type list field: `implements`, an interface's `extends`, `permits`.
pub fn listed<'t>(class: Node<'t>, kinds: &[&str]) -> Vec<Node<'t>> {
    children(class)
        .into_iter()
        .filter(|part| kinds.contains(&part.kind()))
        .flat_map(parts)
        .flat_map(|list| if list.kind() == "type_list" { parts(list) } else { vec![list] })
        .collect()
}

impl<'c, 't> Build<'c, 't> {
    pub fn class(&mut self, class: Node<'t>, level: usize, _outer: Option<Node<'t>>) {
        let at = keyword(class);
        self.push(level, kind_of(class), at, Some(class));
        if self.suppressed(class) {
            return;
        }
        let inner = level + 1;
        let at_sign = (class.kind() == "annotation_type_declaration").then(|| at.map(|at| at - 1)).flatten();
        self.modifiers(class, inner, at_sign, &[]);
        if let Some(list) = class.child_by_field_name("type_parameters") {
            for parameter in parts(list) {
                self.type_parameter(parameter, inner);
            }
        }
        match class.child_by_field_name("superclass").and_then(|clause| parts(clause).into_iter().next()) {
            Some(superclass) => self.ty(superclass, inner),
            None => self.null(inner),
        }
        for listed in listed(class, &["super_interfaces", "extends_interfaces"]) {
            self.ty(listed, inner);
        }
        for listed in listed(class, &["permits"]) {
            self.ty(listed, inner);
        }
        self.members(class, inner, at, None);
    }

    /// An anonymous class: javac's class tree repeats the type the `new` names as the class it extends.
    pub fn anonymous(&mut self, creation: Node<'t>, body: Node<'t>, level: usize, kind: &'static str, named: Option<Node<'t>>) {
        let at = if kind == "ENUM" { named.map(|name| name.start_byte()) } else { Some(body.start_byte()) };
        self.push(level, kind, at, Some(body));
        self.push(level + 1, "MODIFIERS", None, None);
        match named {
            Some(name) => self.push(level + 1, "IDENTIFIER", Some(name.start_byte()), Some(name)),
            None => {
                let Some(written) = creation.child_by_field_name("type") else { return };
                if self.is_interface(written) {
                    self.null(level + 1);
                }
                self.created(creation, written, level + 1);
            }
        }
        self.members(body, level + 1, at, Some(creation));
    }

    pub fn method(&mut self, method: Node<'t>, level: usize) {
        let name = method.child_by_field_name("name").map(|name| name.start_byte());
        self.push(level, "METHOD", name, Some(method));
        if self.suppressed(method) {
            return;
        }
        let inner = level + 1;
        let named = method.child_by_field_name("name").map_or(method.end_byte(), |name| name.start_byte());
        let loose: Vec<Node<'t>> = parts(method)
            .into_iter()
            .filter(|part| matches!(part.kind(), "annotation" | "marker_annotation") && part.end_byte() <= named)
            .collect();
        let fallback = method.child_by_field_name("type_parameters").map(|list| list.start_byte());
        self.modifiers(method, inner, fallback, &loose);
        match method.child_by_field_name("type") {
            Some(returned) => {
                let groups: Vec<Node<'t>> = method.child_by_field_name("dimensions").into_iter().collect();
                self.typed(returned, &groups, None, inner);
            }
            None => self.null(inner),
        }
        if let Some(list) = method.child_by_field_name("type_parameters") {
            for parameter in parts(list) {
                self.type_parameter(parameter, inner);
            }
        }
        let parameters = method.child_by_field_name("parameters").map(parts).unwrap_or_default();
        for parameter in parameters.iter().filter(|part| part.kind() != "receiver_parameter") {
            self.parameter(*parameter, inner);
        }
        match parameters.iter().find(|part| part.kind() == "receiver_parameter") {
            Some(receiver) => self.receiver(*receiver, inner),
            None => self.null(inner),
        }
        for thrown in children(method).into_iter().filter(|part| part.kind() == "throws").flat_map(parts) {
            self.ty(thrown, inner);
        }
        match method.child_by_field_name("body") {
            Some(body) if method.kind() == "constructor_declaration" => self.constructor_body(body, inner),
            Some(body) => self.statement(body, inner),
            None => self.null(inner),
        }
        match method.child_by_field_name("value") {
            Some(value) => self.annotation_value(value, inner),
            None => self.null(inner),
        }
    }

    pub fn receiver(&mut self, receiver: Node<'t>, level: usize) {
        let this = children(receiver).into_iter().find(|part| part.kind() == "this");
        let qualifier = parts(receiver).into_iter().find(|part| part.kind() == "identifier");
        self.push(level, "VARIABLE", qualifier.or(this).map(|name| name.start_byte()), Some(receiver));
        let annotations: Vec<Node<'t>> = parts(receiver).into_iter().filter(|part| part.kind().ends_with("annotation")).collect();
        self.modifiers(receiver, level + 1, annotations.first().map(|first| first.start_byte()), &annotations);
        let written = parts(receiver).into_iter().find(|part| !matches!(part.kind(), "identifier" | "this" | "annotation" | "marker_annotation" | "modifiers"));
        match written {
            Some(written) => self.ty(written, level + 1),
            None => self.give_up(line!()),
        }
        match qualifier {
            Some(outer) => {
                self.push(level + 1, "MEMBER_SELECT", token(receiver, "."), None);
                self.push(level + 2, "IDENTIFIER", Some(outer.start_byte()), Some(outer));
            }
            None => self.push(level + 1, "IDENTIFIER", this.map(|this| this.start_byte()), this),
        }
        self.null(level + 1);
    }

    /// A formal parameter or `T... name`.
    pub fn parameter(&mut self, parameter: Node<'t>, level: usize) {
        let Some(written) = written_type(parameter) else {
            self.give_up(line!());
            return;
        };
        let declarator = parts(parameter).into_iter().find(|part| part.kind() == "variable_declarator");
        let name = parameter.child_by_field_name("name").or_else(|| declarator.and_then(|found| found.child_by_field_name("name")));
        let ellipsis = children(parameter).into_iter().find(|part| part.kind() == "...");
        let groups: Vec<Node<'t>> = parameter.child_by_field_name("dimensions").into_iter().collect();
        let typed = if self.text(written) == "var" { self.lambda_type(parameter) } else { Typed::Written(written, groups, ellipsis) };
        self.variable(parameter, name.map(|name| name.start_byte()), level, typed, None);
    }

    pub fn enum_constant(&mut self, constant: Node<'t>, level: usize, enum_name: Option<Node<'t>>) {
        let name = constant.child_by_field_name("name");
        self.push(level, "VARIABLE", Some(constant.start_byte()), Some(constant));
        if self.suppressed(constant) {
            return;
        }
        self.modifiers(constant, level + 1, None, &[]);
        self.push(level + 1, "IDENTIFIER", name.map(|name| name.start_byte()), name);
        self.null(level + 1);
        let arguments = constant.child_by_field_name("arguments");
        let body = constant.child_by_field_name("body");
        let at = arguments.or(body).or(name).map(|found| found.start_byte());
        self.push(level + 1, "NEW_CLASS", at, Some(constant));
        self.null(level + 2);
        self.push(level + 2, "IDENTIFIER", name.map(|name| name.start_byte()), name);
        for argument in arguments.map(parts).unwrap_or_default() {
            self.expr(argument, level + 2);
        }
        match body {
            Some(body) => self.anonymous(constant, body, level + 2, "ENUM", name.or(enum_name).and(name)),
            None => self.null(level + 2),
        }
    }
}

pub fn is_class(node: Node) -> bool {
    CLASSES.contains(&node.kind())
}
