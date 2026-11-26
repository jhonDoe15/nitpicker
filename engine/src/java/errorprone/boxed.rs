//! UnnecessaryBoxedVariable: a variable of a wrapper type that is only ever used as its primitive.
use super::Context;
use super::fixes::Fix;
use super::boxed_fixes::{Edit, assignment_edits, cast_call_edit, null_check_edit, primitive_name, simple_call_edit, variable_fix};
use super::hierarchy::{formals, has_annotation};
use super::keep::{VARIABLES, should_keep};
use super::vars::{Named, named};
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::Type;
use std::collections::HashSet;
use tree_sitter::Node;

const NAME: &str = "UnnecessaryBoxedVariable";
const SUMMARY: &str = "It is unnecessary for this variable to be boxed. Use the primitive instead.";
const NULLABLE_FIELD: &str = "This field is assigned a primitive value, and not used in a boxed context. Prefer using the primitive type directly.";
const NULLABLE: &str = "All usages of this @Nullable variable would result in a NullPointerException when it actually is null. Use the primitive type if this variable should never be null, or else fix the code to avoid unboxing or invoking its instance methods.";
const WRAPPERS: [&str; 8] = [
    "java.lang.Integer", "java.lang.Long", "java.lang.Short", "java.lang.Byte", "java.lang.Character", "java.lang.Double", "java.lang.Float",
    "java.lang.Boolean",
];
const CASTS: [&str; 7] = ["byteValue", "shortValue", "intValue", "longValue", "floatValue", "doubleValue", "booleanValue"];
const TYPES: [&str; 5] = ["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

fn wrapper(kind: &Option<Type>) -> bool {
    matches!(kind, Some(Type::Class(name, _)) if WRAPPERS.contains(&name.as_str()))
}

fn primitive(kind: &Option<Type>) -> bool {
    matches!(kind, Some(Type::Primitive(name)) if *name != "void")
}

fn numeric(kind: &Option<Type>) -> bool {
    matches!(kind, Some(Type::Primitive(name)) if !matches!(*name, "void" | "boolean"))
}

/// Whether an identifier stands where an expression can stand.
fn is_value(node: Node) -> bool {
    let Some(holder) = parent(node) else { return false };
    let field = |name: &str| holder.child_by_field_name(name).is_some_and(|part| part.id() == node.id());
    match holder.kind() {
        "method_invocation" | "field_access" => field("object"),
        "variable_declarator" | "cast_expression" | "enhanced_for_statement" | "element_value_pair" => field("value"),
        "lambda_expression" => field("body"),
        "instanceof_expression" => field("left"),
        "resource" => field("value") || holder.child_by_field_name("name").is_none(),
        "argument_list" | "parenthesized_expression" | "binary_expression" | "unary_expression" | "update_expression" | "ternary_expression"
        | "return_statement" | "expression_statement" | "array_access" | "array_initializer" | "assignment_expression" | "throw_statement"
        | "yield_statement" | "for_statement" | "assert_statement" | "dimensions_expr" | "switch_rule" | "element_value_array_initializer" => true,
        _ => false,
    }
}

/// `Integer.valueOf(...)` and its like.
fn is_value_of(context: &Context, expression: Node) -> bool {
    expression.kind() == "method_invocation"
        && expression.child_by_field_name("name").is_some_and(|name| context.text(name) == "valueOf")
        && context.resolver.resolve_call(expression).is_some_and(|call| {
            let owner = if expression.child_by_field_name("object").is_some() { call.receiver.erased().name() } else { call.declaring.clone() };
            call.method.is_static && WRAPPERS.contains(&owner.as_str())
        })
}

struct Usages<'c, 'a, 't> {
    context: &'c Context<'a>,
    boxed: HashSet<usize>,
    dereferenced: HashSet<usize>,
    /// The body of each class of the file by its simple name.
    bodies: std::collections::HashMap<String, Node<'t>>,
    /// By declaration without a written type: whether its first use had a wrapper type.
    inferred: std::cell::RefCell<std::collections::HashMap<usize, bool>>,
    /// By declaration: the edits its uses need when it becomes a primitive.
    edits: std::collections::HashMap<usize, Vec<Edit>>,
}

/// The type of an expression; a conditional with a primitive branch and a primitive or wrapper branch is primitive.
fn kind_of(context: &Context, expression: Node) -> Option<Type> {
    let expression = crate::java::types::expr::unwrap(expression);
    if expression.kind() == "ternary_expression" {
        let first = expression.child_by_field_name("consequence").and_then(|branch| kind_of(context, branch));
        let second = expression.child_by_field_name("alternative").and_then(|branch| kind_of(context, branch));
        if (primitive(&first) && (primitive(&second) || wrapper(&second))) || (primitive(&second) && wrapper(&first)) {
            return first.map(Type::unboxed_or_same);
        }
    }
    context.resolver.type_of(expression)
}

fn field_of<'t>(usages: &Usages<'_, '_, 't>, access: Node<'t>) -> Option<Node<'t>> {
    let context = usages.context;
    let object = access.child_by_field_name("object")?;
    let name = context.text(access.child_by_field_name("field")?);
    let body = match object.kind() {
        "this" => std::iter::successors(parent(access), |at| parent(*at)).find(|at| at.kind().ends_with("_body") && at.kind() != "constructor_body")?,
        "identifier" => usages.bodies.get(context.text(object)).copied().filter(|_| named(context, object).is_none())?,
        _ => return None,
    };
    let mut members = children(body);
    if let Some(inner) = members.iter().find(|part| part.kind() == "enum_body_declarations").copied() {
        members = children(inner);
    }
    members
        .into_iter()
        .filter(|member| matches!(member.kind(), "field_declaration" | "constant_declaration"))
        .flat_map(declarators)
        .find(|declarator| declarator.child_by_field_name("name").is_some_and(|written| context.text(written) == name))
}

impl<'t> Usages<'_, '_, 't> {
    /// The declaration behind a name or field access, when it holds a wrapper.
    fn symbol(&self, node: Node<'t>) -> Option<usize> {
        let found = match node.kind() {
            "identifier" if is_value(node) => match named(self.context, node)? {
                Named::Variable(found) | Named::Other(found) => found,
            },
            "field_access" => field_of(self, node)?,
            _ => return None,
        };
        self.holds_wrapper(found, node).then_some(found.id())
    }

    /// Whether a declaration is written with a wrapper type; the type of the usage decides where none is written.
    fn holds_wrapper(&self, found: Node, usage: Node) -> bool {
        let holder = match found.kind() {
            "variable_declarator" => parent(found),
            "resource" | "formal_parameter" | "enhanced_for_statement" => Some(found),
            "catch_formal_parameter" | "spread_parameter" | "enum_constant" => return false,
            _ => None,
        };
        let written = holder.and_then(|holder| holder.child_by_field_name("type")).map(|kind| self.context.text(kind));
        match written {
            Some("var") | None => *self.inferred.borrow_mut().entry(found.id()).or_insert_with(|| wrapper(&self.context.resolver.type_of(usage))),
            Some(written) => {
                let simple = written.strip_prefix("java.lang.").unwrap_or(written);
                found.child_by_field_name("dimensions").is_none() && WRAPPERS.iter().any(|name| name.rsplit('.').next() == Some(simple))
            }
        }
    }

    fn value_of(&self, expression: Node) -> bool {
        is_value_of(self.context, expression)
    }

    /// Whether the place of the expression takes a primitive; `None` when the place takes no value at all.
    fn wants_primitive(&self, expression: Node) -> Option<bool> {
        let resolver = self.context.resolver;
        let mut inner = expression;
        let mut holder = parent(expression)?;
        while holder.kind() == "parenthesized_expression" {
            inner = holder;
            holder = parent(holder)?;
        }
        let field = |name: &str| holder.child_by_field_name(name).is_some_and(|part| part.id() == inner.id());
        let typed = |node: Option<Node>| node.and_then(|node| kind_of(self.context, node));
        let expected = || Some(primitive(&resolver.expected(expression)));
        match holder.kind() {
            "array_access" => Some(field("index")),
            "assert_statement" => Some(holder.named_child(0).is_some_and(|first| first.id() == inner.id())),
            "assignment_expression" => {
                let left = typed(holder.child_by_field_name("left"));
                match holder.child_by_field_name("operator").map(|operator| self.context.text(operator)) {
                    Some("=") => Some(primitive(&left)),
                    Some("<<=" | ">>=" | ">>>=") => Some(true),
                    Some("+=") => Some(!left.is_some_and(|kind| matches!(&kind, Type::Class(name, _) if resolver.index.is_subtype("java.lang.String", name)))),
                    _ => Some(true),
                }
            }
            "enhanced_for_statement" => field("value").then_some(false),
            "instanceof_expression" | "synchronized_statement" | "throw_statement" | "update_expression" | "field_access" => Some(false),
            "cast_expression" => Some(primitive(&holder.child_by_field_name("type").and_then(|kind| resolver.type_node(kind)))),
            "variable_declarator" => {
                let declaration = parent(holder)?;
                let written = declaration.child_by_field_name("type")?;
                let kind = if self.context.text(written) == "var" { typed(Some(inner)) } else { resolver.declared_type(declaration, Some(holder)) };
                Some(primitive(&kind))
            }
            "unary_expression" => Some(true),
            "binary_expression" => {
                let operator = self.context.text(holder.child_by_field_name("operator")?);
                let left = typed(holder.child_by_field_name("left"));
                let right = typed(holder.child_by_field_name("right"));
                let string = |kind: &Option<Type>| kind.as_ref().is_some_and(|kind| kind.name() == "java.lang.String");
                match operator {
                    "+" if string(&left) || string(&right) => Some(false),
                    "==" | "!=" => {
                        let open = |kind: &Option<Type>| kind.clone().map(Type::unboxed_or_same);
                        let boolean = |kind: &Option<Type>| matches!(kind, Some(Type::Primitive("boolean")));
                        let numbers = (numeric(&left) && numeric(&right)) || (numeric(&left) != numeric(&right) && (numeric(&open(&left)) || numeric(&open(&right))));
                        let booleans = (boolean(&left) && boolean(&right)) || (boolean(&left) != boolean(&right) && (boolean(&open(&left)) || boolean(&open(&right))));
                        Some(numbers || booleans)
                    }
                    _ => Some(true),
                }
            }
            "ternary_expression" => Some(field("condition") || primitive(&typed(Some(holder)))),
            "if_statement" | "while_statement" | "do_statement" | "switch_expression" => Some(true),
            "for_statement" => field("condition").then_some(true),
            "dimensions_expr" => Some(true),
            "lambda_expression" => field("body").then(expected).flatten(),
            "argument_list" | "return_statement" | "array_initializer" => expected(),
            "yield_statement" => {
                let switch = std::iter::successors(parent(holder), |at| parent(*at)).find(|at| at.kind() == "switch_expression");
                Some(primitive(&typed(switch)))
            }
            _ => None,
        }
    }

    fn identifier(&mut self, node: Node<'t>) {
        let Some(symbol) = self.symbol(node) else { return };
        self.dereferenced.insert(symbol);
        if self.wants_primitive(node) == Some(false) {
            self.boxed.insert(symbol);
        }
    }

    fn null_check(&self, call: Node) -> bool {
        let name = call.child_by_field_name("name").map(|name| self.context.text(name)).unwrap_or_default();
        let owner = match name {
            "checkNotNull" => "com.google.common.base.Preconditions",
            "verifyNonNull" => "com.google.common.base.Verify",
            "requireNonNull" => "java.util.Objects",
            _ => return false,
        };
        self.context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.is_static && resolved.declaring == owner)
    }

    fn call(&mut self, node: Node<'t>) -> bool {
        if self.null_check(node) {
            let first = node.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().find(|part| !part.kind().ends_with("comment"));
            if let Some(symbol) = first.map(crate::java::types::expr::unwrap).and_then(|first| self.symbol_of_argument(first)) {
                self.dereferenced.insert(symbol);
                self.edits.entry(symbol).or_default().extend(null_check_edit(self.context, node));
                return true;
            }
        }
        let Some(symbol) = node.child_by_field_name("object").and_then(|receiver| self.symbol(receiver)) else { return false };
        let name = node.child_by_field_name("name").map(|name| self.context.text(name)).unwrap_or_default();
        let fixable = matches!(name, "hashCode" | "toString") || CASTS.contains(&name);
        let instance = fixable && self.context.resolver.resolve_call(node).is_some_and(|resolved| !resolved.method.is_static);
        if !instance {
            self.boxed.insert(symbol);
        } else if let Some(receiver) = node.child_by_field_name("object") {
            let edit = if CASTS.contains(&name) { cast_call_edit(self.context, node, receiver) } else { simple_call_edit(self.context, node, receiver) };
            self.edits.entry(symbol).or_default().extend(edit);
        }
        true
    }

    fn symbol_of_argument(&self, argument: Node<'t>) -> Option<usize> {
        match argument.kind() {
            "identifier" => match named(self.context, argument)? {
                Named::Variable(found) | Named::Other(found) => self.holds_wrapper(found, argument).then_some(found.id()),
            },
            _ => self.symbol(argument),
        }
    }

    fn scan(&mut self, node: Node<'t>) {
        match node.kind() {
            "assignment_expression" => {
                let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
                if node.child_by_field_name("operator").is_none_or(|operator| self.context.text(operator) != "=") {
                    return self.scan(right);
                }
                if let Some(symbol) = self.symbol(left) {
                    let edits = assignment_edits(self.context, right, is_value_of(self.context, right));
                    self.edits.entry(symbol).or_default().extend(edits);
                    let kind = kind_of(self.context, right);
                    let plain = primitive(&kind) || (kind.is_some() && (self.value_of(right) || right.kind() == "object_creation_expression"));
                    if plain {
                        return self.scan(right);
                    }
                    self.boxed.insert(symbol);
                    return;
                }
            }
            "identifier" => return self.identifier(node),
            "field_access" => {
                if self.symbol(node).is_some_and(|symbol| self.boxed.contains(&symbol)) {
                    return;
                }
                self.identifier(node);
            }
            "variable_declarator" => {
                if self.boxed.contains(&node.id()) {
                    return;
                }
            }
            "method_invocation" => {
                if self.call(node) {
                    return;
                }
            }
            "method_reference" => {
                let symbol = children(node).first().filter(|first| first.kind() == "identifier").and_then(|first| self.symbol_of_argument(*first));
                if let Some(symbol) = symbol {
                    self.boxed.insert(symbol);
                    self.dereferenced.insert(symbol);
                    return;
                }
            }
            _ => {}
        }
        for child in children(node) {
            self.scan(child);
        }
    }
}

/// Written `private`, or the constructor of an enum, which is private without saying so.
pub fn is_private(declaration: Node) -> bool {
    let owner = std::iter::successors(parent(declaration), |at| parent(*at)).find(|at| TYPES.contains(&at.kind()));
    let enumerated = declaration.kind() == "constructor_declaration" && owner.is_some_and(|owner| owner.kind() == "enum_declaration");
    has_modifier(declaration, "private") || enumerated
}

pub fn effectively_private(declaration: Node) -> bool {
    if is_private(declaration) {
        return true;
    }
    let mut current = Some(declaration);
    while let Some(at) = current {
        match at.kind() {
            kind if TYPES.contains(&kind) => {
                let local = parent(at).is_some_and(|holder| matches!(holder.kind(), "block" | "constructor_body" | "switch_block_statement_group"));
                if has_modifier(at, "private") || local {
                    return true;
                }
            }
            "object_creation_expression" | "enum_constant" => return true,
            _ => {}
        }
        current = parent(at);
    }
    false
}

fn can_change_signature(context: &Context, method: Node) -> bool {
    if super::throws::can_be_overridden(method) {
        return false;
    }
    if parent(method).and_then(parent).is_some_and(|owner| owner.kind() == "record_declaration") && method.kind() != "method_declaration" {
        let components = parent(method).and_then(parent).and_then(|owner| owner.child_by_field_name("parameters")).map(named_children).unwrap_or_default();
        let types = |list: Vec<Node>| list.iter().map(|part| part.child_by_field_name("type").map(|kind| context.text(kind).to_string())).collect::<Vec<_>>();
        if method.kind() == "compact_constructor_declaration" || types(formals(method)) == types(components.into_iter().filter(|part| part.kind() == "formal_parameter").collect()) {
            return false;
        }
    }
    !super::hierarchy::overrides(context, method)
}

fn report(context: &Context, declaration: Node, name: Option<Node>, field: bool, fix: Fix) {
    let Some(name) = name else { return };
    let message = match (has_annotation(context, declaration, "Nullable"), field) {
        (false, _) => SUMMARY,
        (true, true) => NULLABLE_FIELD,
        (true, false) => NULLABLE,
    };
    context.report_fixed(NAME, name, name.start_byte(), message, &[fix]);
}

fn declared(context: &Context, declaration: Node, declarator: Option<Node>) -> Option<Type> {
    let written = declaration.child_by_field_name("type")?;
    if context.text(written) == "var" {
        return declarator.unwrap_or(declaration).child_by_field_name("value").and_then(|value| context.resolver.type_of(value));
    }
    context.resolver.declared_type(declaration, declarator)
}

pub fn unnecessary_boxed_variable(context: &Context, root: Node) {
    if root.kind() != "program" || !WRAPPERS.iter().any(|name| context.file.text.contains(name.rsplit('.').next().unwrap_or(name))) {
        return;
    }
    let mut bodies = std::collections::HashMap::new();
    walk(root, |part| {
        if TYPES.contains(&part.kind()) {
            if let (Some(name), Some(body)) = (part.child_by_field_name("name"), part.child_by_field_name("body")) {
                bodies.entry(context.text(name).to_string()).or_insert(body);
            }
        }
    });
    let mut usages = Usages { context, boxed: HashSet::new(), dereferenced: HashSet::new(), bodies, inferred: Default::default(), edits: Default::default() };
    usages.scan(root);
    let resolver = context.resolver;
    walk(root, |node| match node.kind() {
        "local_variable_declaration" | "field_declaration" | "constant_declaration" => {
            let field = node.kind() != "local_variable_declaration";
            for declarator in declarators(node) {
                if !wrapper(&declared(context, node, Some(declarator))) || usages.boxed.contains(&declarator.id()) {
                    continue;
                }
                let value = declarator.child_by_field_name("value");
                let kind = value.and_then(|value| kind_of(context, value));
                let fits = if field {
                    let fixed = node.kind() == "constant_declaration" || (has_modifier(node, "static") && has_modifier(node, "final"));
                    fixed && effectively_private(node) && primitive(&kind) && !should_keep(context, node, VARIABLES)
                } else {
                    value.is_none_or(|value| primitive(&kind) || (kind.is_some() && usages.value_of(value)))
                };
                if fits {
                    let unboxed = primitive_name(declared(context, node, Some(declarator))).unwrap_or_default();
                    let edits = usages.edits.get(&declarator.id()).map(Vec::as_slice).unwrap_or_default();
                    let fix = variable_fix(context, node, unboxed, value, value.is_some_and(|value| is_value_of(context, value)), edits);
                    report(context, node, declarator.child_by_field_name("name"), field, fix);
                }
            }
        }
        "enhanced_for_statement" => {
            let over = node.child_by_field_name("value").and_then(|value| resolver.type_of(value));
            let fits = matches!(&over, Some(Type::Array(element)) if matches!(**element, Type::Primitive(_)));
            if fits && wrapper(&declared(context, node, None)) && !usages.boxed.contains(&node.id()) {
                let unboxed = primitive_name(declared(context, node, None)).unwrap_or_default();
                let edits = usages.edits.get(&node.id()).map(Vec::as_slice).unwrap_or_default();
                report(context, node, node.child_by_field_name("name"), false, variable_fix(context, node, unboxed, None, false, edits));
            }
        }
        "formal_parameter" => {
            let Some(method) = parent(node).and_then(parent) else { return };
            if !matches!(method.kind(), "method_declaration" | "constructor_declaration") || !wrapper(&resolver.declared_type(node, None)) {
                return;
            }
            if usages.dereferenced.contains(&node.id()) && !usages.boxed.contains(&node.id()) && can_change_signature(context, method) {
                let unboxed = primitive_name(resolver.declared_type(node, None)).unwrap_or_default();
                let edits = usages.edits.get(&node.id()).map(Vec::as_slice).unwrap_or_default();
                report(context, node, node.child_by_field_name("name"), false, variable_fix(context, node, unboxed, None, false, edits));
            }
        }
        _ => {}
    });
}
