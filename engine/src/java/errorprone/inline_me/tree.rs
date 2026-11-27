//! A walk of an expression's parse tree in the order javac's `TreeScanner` visits the javac trees it stands for,
//! naming the identifiers, member selects, calls and `new`s on the way, and the javac parent of an identifier.
use crate::engine::source::{named_children, parent};
use tree_sitter::Node;

#[derive(Clone, Copy)]
pub enum Event<'t> {
    /// A javac identifier: a name, a method name written without an object, a simple type name, `this` or `super`.
    Ident(Node<'t>),
    /// A member select: a field access, a qualified type name, a class literal, or the method part of a call (the
    /// `method_invocation` itself stands for it).
    Select(Node<'t>),
    /// A method call, or `this(...)` and `super(...)`.
    Invocation(Node<'t>),
    NewClass(Node<'t>),
    /// `X.super` in a call `X.super.m()`, which the `method_invocation` stands for.
    QualifiedSuper(Node<'t>),
}

/// The javac tree an identifier hangs from, as far as the InlineMe checks tell them apart.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Parent {
    MemberSelect,
    MethodInvocation,
    NewClass,
    MemberReference,
    TypeCast,
    NewArray,
    Other,
}

fn parts(node: Node) -> Vec<Node> {
    named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment") && !matches!(part.kind(), "marker_annotation" | "annotation")).collect()
}

/// The call or `new` an argument list belongs to.
fn holder_of_list(list: Node) -> Parent {
    match parent(list).map(|holder| holder.kind()) {
        Some("method_invocation" | "explicit_constructor_invocation") => Parent::MethodInvocation,
        Some("object_creation_expression") => Parent::NewClass,
        Some("method_reference") => Parent::MemberReference,
        _ => Parent::Other,
    }
}

pub fn ident_parent(node: Node) -> Parent {
    let Some(up) = parent(node) else { return Parent::Other };
    let field = |name: &str| up.child_by_field_name(name) == Some(node);
    match up.kind() {
        "field_access" | "class_literal" | "scoped_type_identifier" => Parent::MemberSelect,
        "method_invocation" if field("object") => Parent::MemberSelect,
        "method_invocation" | "explicit_constructor_invocation" => Parent::MethodInvocation,
        "argument_list" | "type_arguments" => holder_of_list(up),
        "object_creation_expression" => Parent::NewClass,
        "method_reference" => Parent::MemberReference,
        "cast_expression" => Parent::TypeCast,
        "array_creation_expression" => Parent::NewArray,
        "dimensions_expr" if parent(up).is_some_and(|holder| holder.kind() == "array_creation_expression") => Parent::NewArray,
        _ => Parent::Other,
    }
}

/// The expression a member select selects from.
pub fn selected(node: Node) -> Option<Node> {
    match node.kind() {
        "field_access" | "method_invocation" => node.child_by_field_name("object"),
        "scoped_type_identifier" | "class_literal" | "scoped_identifier" => parts(node).into_iter().next(),
        _ => None,
    }
}

pub fn is_select(node: Node) -> bool {
    match node.kind() {
        "field_access" | "scoped_type_identifier" | "class_literal" | "scoped_identifier" => true,
        "method_invocation" => node.child_by_field_name("object").is_some(),
        _ => false,
    }
}

/// A call `X.super.m()`: javac's method select selects from the member select `X.super`.
pub fn qualified_super(call: Node) -> bool {
    call.kind() == "method_invocation" && crate::engine::source::children(call).iter().any(|part| part.kind() == "super")
}

pub struct Walk<'v, 't> {
    /// Also visit the declared types of explicit lambda parameters; `TreePathScanner` does, the checks' own
    /// `visitLambdaExpression` overrides do not.
    pub lambda_parameters: bool,
    /// Called for each event; `false` leaves out what the tree holds.
    pub visit: &'v mut dyn FnMut(Event<'t>) -> bool,
}

impl<'t> Walk<'_, 't> {
    fn all(&mut self, nodes: impl IntoIterator<Item = Node<'t>>) {
        for node in nodes {
            self.scan(node);
        }
    }

    fn field(&mut self, node: Node<'t>, name: &str) {
        if let Some(part) = node.child_by_field_name(name) {
            self.scan(part);
        }
    }

    pub fn scan(&mut self, node: Node<'t>) {
        match node.kind() {
            kind if kind.ends_with("comment") => {}
            "identifier" | "type_identifier" | "this" | "super" => {
                (self.visit)(Event::Ident(node));
            }
            "field_access" | "scoped_type_identifier" | "class_literal" | "scoped_identifier" => {
                if (self.visit)(Event::Select(node)) {
                    if let Some(object) = selected(node) {
                        self.scan(object);
                    }
                }
            }
            "method_invocation" => {
                if !(self.visit)(Event::Invocation(node)) {
                    return;
                }
                self.field(node, "type_arguments");
                match node.child_by_field_name("object") {
                    Some(object) => {
                        if (self.visit)(Event::Select(node)) && (!qualified_super(node) || (self.visit)(Event::QualifiedSuper(node))) {
                            self.scan(object);
                        }
                    }
                    None => self.field(node, "name"),
                }
                self.field(node, "arguments");
            }
            "variable_declarator" => self.field(node, "value"),
            "method_declaration" | "constructor_declaration" => {
                if let Some(list) = node.child_by_field_name("parameters") {
                    for parameter in parts(list) {
                        self.field(parameter, "type");
                    }
                }
                self.field(node, "body");
            }
            "explicit_constructor_invocation" => {
                if !(self.visit)(Event::Invocation(node)) {
                    return;
                }
                self.field(node, "type_arguments");
                match node.child_by_field_name("object") {
                    Some(object) => self.scan(object),
                    None => self.field(node, "constructor"),
                }
                self.field(node, "arguments");
            }
            "object_creation_expression" => {
                if !(self.visit)(Event::NewClass(node)) {
                    return;
                }
                let bodies = self.lambda_parameters;
                let kept: Vec<Node> = parts(node).into_iter().filter(|part| bodies || part.kind() != "class_body").collect();
                self.all(kept);
            }
            "lambda_expression" => {
                if self.lambda_parameters {
                    if let Some(parameters) = node.child_by_field_name("parameters").filter(|list| list.kind() == "formal_parameters") {
                        for parameter in parts(parameters) {
                            self.field(parameter, "type");
                        }
                    }
                }
                self.field(node, "body");
            }
            "method_reference" => {
                let mut items = parts(node).into_iter();
                if let Some(first) = items.next() {
                    self.scan(first);
                }
                self.all(items.filter(|part| part.kind() == "type_arguments"));
            }
            "wildcard" => self.all(parts(node).into_iter().filter(|part| part.kind() != "super")),
            "instanceof_expression" => {
                self.field(node, "left");
                self.field(node, "right");
                self.field(node, "pattern");
            }
            _ => self.all(parts(node)),
        }
    }
}

pub fn scan<'t>(node: Node<'t>, lambda_parameters: bool, visit: &mut dyn FnMut(Event<'t>) -> bool) {
    Walk { lambda_parameters, visit }.scan(node);
}
