//! `InlinabilityResult.forMethod`: whether a method's body can be inlined at its callers, and the reason when not.
use super::super::Context;
use super::super::javac_print::printed;
use super::sym::{self, Kind, Visibility};
use super::tree::{Event, Parent, ident_parent, scan};
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::has_modifier;
use crate::java::javac::locals::{Found, Scopes, declaration};
use tree_sitter::Node;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Reason {
    NoBody,
    NotExactlyOneStatement,
    ComplexStatement,
    CallsDeprecatedOrPrivateApis,
    ApiIsPrivate,
    BodyWouldEvaluateDifferently,
    MethodCanBeOverriddenAndCantBeFixed,
    MethodCanBeOverriddenButCanBeFixed,
    VarargsUsedUnsafely,
    EmptyVoid,
    ReuseOfArguments,
    ParamNamesAreNamedArgN,
    NoSuperCalls,
}

impl Reason {
    pub fn message(self) -> &'static str {
        match self {
            Reason::NoBody => "InlineMe cannot be applied to abstract methods.",
            Reason::NotExactlyOneStatement => "InlineMe can only inline methods with exactly 1 statement.",
            Reason::ComplexStatement => "InlineMe cannot inline complex statements. Consider using a different refactoring tool",
            Reason::CallsDeprecatedOrPrivateApis => "InlineMe cannot be applied when the implementation references deprecated or less visible API elements:",
            Reason::ApiIsPrivate => "InlineMe cannot be applied to private APIs.",
            Reason::BodyWouldEvaluateDifferently => "Inlining this method will result in a change in evaluation timing for one or more arguments to this method.",
            Reason::MethodCanBeOverriddenAndCantBeFixed | Reason::MethodCanBeOverriddenButCanBeFixed => {
                "Methods that are inlined should not be overridable, as the implementation of an overriding method may be different than the inlining"
            }
            Reason::VarargsUsedUnsafely => "When using a varargs parameter, it must only be passed in the last position of a method call to another varargs method",
            Reason::EmptyVoid => "InlineMe cannot yet be applied to no-op void methods",
            Reason::ReuseOfArguments => "Implementations cannot use an argument more than once:",
            Reason::ParamNamesAreNamedArgN => "Method parameter names cannot match `arg[0-9]+`.",
            Reason::NoSuperCalls => "super(...) calls cannot be inlined.",
        }
    }
}

pub struct Failure {
    pub reason: Reason,
    pub extra: Option<String>,
}

impl Failure {
    pub fn message(&self) -> String {
        match &self.extra {
            Some(extra) => format!("{} {extra}", self.reason.message()),
            None => self.reason.message().to_string(),
        }
    }
}

fn fail<T>(reason: Reason) -> Result<T, Failure> {
    Err(Failure { reason, extra: None })
}

pub fn matches_arg_n(name: &str) -> bool {
    name.strip_prefix("arg").is_some_and(|digits| !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()))
}

/// The statements of a block, an empty statement `;` included.
fn statements(body: Node) -> Vec<Node> {
    children(body).into_iter().filter(|part| !part.kind().ends_with("comment") && (part.is_named() || part.kind() == ";")).collect()
}

/// The parameters of a method declaration, the variable arity one last.
pub fn parameters(method: Node) -> Vec<Node> {
    let Some(list) = method.child_by_field_name("parameters") else { return Vec::new() };
    named_children(list).into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter")).collect()
}

pub fn parameter_name<'t>(context: &'t Context, parameter: Node) -> &'t str {
    let name = parameter.child_by_field_name("name").or_else(|| {
        children(parameter).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|declarator| declarator.child_by_field_name("name"))
    });
    name.map_or("", |name| context.text(name))
}

/// The parameter of the method an identifier reads, by its position.
pub fn parameter_of(context: &Context, scopes: &Scopes, method: Node, node: Node) -> Option<usize> {
    if node.kind() != "identifier" {
        return None;
    }
    let Some(Found::Local(declared)) = declaration(context.resolver, scopes, node, context.text(node)) else { return None };
    parameters(method).iter().position(|parameter| parameter.start_byte() <= declared.start_byte() && declared.end_byte() <= parameter.end_byte())
}

/// The class declaration, `new` with a body or enum constant whose body declares the member.
pub fn owner_class(member: Node) -> Option<Node> {
    let mut current = parent(member);
    while let Some(node) = current {
        if !matches!(node.kind(), "class_body" | "interface_body" | "enum_body" | "enum_body_declarations" | "annotation_type_body") {
            return Some(node);
        }
        current = parent(node);
    }
    None
}

fn in_interface(method: Node) -> bool {
    owner_class(method).is_some_and(|holder| matches!(holder.kind(), "interface_declaration" | "annotation_type_declaration"))
}

/// The method's own access, implicit `public` in an interface included.
pub fn visibility(method: Node) -> Visibility {
    if has_modifier(method, "private") {
        Visibility::Private
    } else if has_modifier(method, "public") || in_interface(method) {
        Visibility::Public
    } else if has_modifier(method, "protected") {
        Visibility::Protected
    } else if method.kind() == "constructor_declaration" && owner_class(method).is_some_and(|holder| holder.kind() == "enum_declaration") {
        Visibility::Private
    } else {
        Visibility::Package
    }
}

/// The body's statements as javac's attributed tree holds them: a constructor without `this(...)` or `super(...)` first
/// gets an implicit `super()`.
fn statement_count(method: Node, body: Node) -> usize {
    let listed = statements(body);
    let implicit = matches!(method.kind(), "constructor_declaration" | "compact_constructor_declaration") && listed.first().is_none_or(|first| first.kind() != "explicit_constructor_invocation");
    listed.len() + usize::from(implicit)
}

/// `ASTHelpers.methodCanBeOverridden` for a method declaration of the sources.
fn can_be_overridden(method: Node) -> bool {
    if has_modifier(method, "abstract") {
        return true;
    }
    if method.kind() != "method_declaration" || has_modifier(method, "static") || has_modifier(method, "private") || has_modifier(method, "final") {
        return false;
    }
    let Some(class) = owner_class(method) else { return false };
    match class.kind() {
        "class_declaration" => !has_modifier(class, "final"),
        "interface_declaration" => true,
        "enum_declaration" => {
            let constants = class.child_by_field_name("body").map(named_children).unwrap_or_default();
            constants.iter().any(|constant| constant.kind() == "enum_constant" && constant.child_by_field_name("body").is_some())
        }
        _ => false,
    }
}

fn body_expression<'t>(statement: Node<'t>) -> Result<Node<'t>, Failure> {
    match statement.kind() {
        "expression_statement" => statement.named_child(0).ok_or(Failure { reason: Reason::ComplexStatement, extra: None }),
        "explicit_constructor_invocation" => Ok(statement),
        "return_statement" => named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")).ok_or(Failure { reason: Reason::EmptyVoid, extra: None }),
        _ => fail(Reason::ComplexStatement),
    }
}

fn varargs_used_poorly(context: &Context, scopes: &Scopes, method: Node, body: Node) -> bool {
    let last = parameters(method).len().saturating_sub(1);
    let mut poorly = false;
    scan(body, true, &mut |event| {
        let Event::Ident(node) = event else { return true };
        if parameter_of(context, scopes, method, node) != Some(last) {
            return true;
        }
        let call = parent(node).and_then(parent).filter(|_| ident_parent(node) == Parent::MethodInvocation);
        let Some(call) = call else {
            poorly = true;
            return true;
        };
        let arguments = call.child_by_field_name("arguments").map(named_children).unwrap_or_default();
        let arguments: Vec<Node> = arguments.into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
        if !sym::invoked(context, call).is_some_and(|called| called.varargs) || arguments.last() != Some(&node) {
            poorly = true;
        }
        true
    });
    poorly
}

fn reused_argument<'t>(context: &'t Context, scopes: &Scopes, method: Node, body: Node) -> Option<&'t str> {
    let mut used = Vec::new();
    let mut twice = None;
    let names: Vec<&str> = parameters(method).iter().map(|parameter| parameter_name(context, *parameter)).collect();
    scan(body, true, &mut |event| {
        if let Event::Ident(node) = event {
            if let Some(position) = parameter_of(context, scopes, method, node) {
                if used.contains(&position) {
                    twice = Some(names[position]);
                } else {
                    used.push(position);
                }
            }
        }
        true
    });
    twice
}

fn hidden_or_deprecated(context: &Context, scopes: &Scopes, body: Node, least: Visibility) -> Option<String> {
    let mut found = None;
    let flagged = |symbol: Option<sym::Sym>| symbol.is_some_and(|symbol| symbol.kind != Kind::Package && symbol.visibility < least || symbol.deprecated);
    scan(body, false, &mut |event| {
        let (node, symbol) = match event {
            Event::Ident(node) => {
                let symbol = sym::ident(context, scopes, node);
                if context.text(node) == "this" || symbol.as_ref().is_some_and(sym::Sym::is_local) {
                    return true;
                }
                (node, symbol)
            }
            Event::Select(node) => (node, sym::select(context, node)),
            Event::Invocation(node) => (node, sym::invoked(context, node)),
            Event::NewClass(node) => (node, sym::constructed(context, node)),
            Event::QualifiedSuper(node) => (node, Some(sym::qualified_super())),
        };
        if flagged(symbol) {
            found = Some(match event {
                Event::Select(node) if node.kind() == "method_invocation" => {
                    let end = node.child_by_field_name("name").map_or(node.end_byte(), |name| name.end_byte());
                    context.file.text[node.start_byte()..end].to_string()
                }
                Event::Invocation(node) | Event::NewClass(node) | Event::Select(node) | Event::Ident(node) | Event::QualifiedSuper(node) if node.kind() == "explicit_constructor_invocation" => {
                    let end = node.child_by_field_name("arguments").map_or(node.end_byte(), |arguments| arguments.end_byte());
                    context.file.text[node.start_byte()..end].to_string()
                }
                Event::QualifiedSuper(node) => {
                    let end = crate::engine::source::children(node).into_iter().find(|part| part.kind() == "super").map_or(node.end_byte(), |word| word.end_byte());
                    context.file.text[node.start_byte()..end].to_string()
                }
                _ => context.text(node).to_string(),
            });
            return false;
        }
        true
    });
    found
}

fn evaluated_later(context: &Context, scopes: &Scopes, method: Node, body: Node) -> bool {
    let mut later = false;
    scan(body, false, &mut |event| {
        if let Event::Ident(node) = event {
            if parameter_of(context, scopes, method, node).is_some() && deferred(node, body) {
                later = true;
            }
        }
        true
    });
    later
}

/// Inside a lambda's body, or a branch of a conditional expression, within the method body.
fn deferred(node: Node, body: Node) -> bool {
    let mut inner = node;
    let mut current = parent(node);
    while let Some(above) = current {
        if above.kind() == "lambda_expression" {
            return true;
        }
        if above.kind() == "ternary_expression" && above.child_by_field_name("condition") != Some(inner) {
            return true;
        }
        if above.id() == body.id() {
            return false;
        }
        inner = above;
        current = parent(above);
    }
    false
}

/// The expression the method's body inlines to, or why it cannot be inlined.
pub fn for_method<'t>(context: &Context, scopes: &Scopes, method: Node<'t>) -> Result<Node<'t>, Failure> {
    let Some(body) = method.child_by_field_name("body") else { return fail(Reason::NoBody) };
    if statement_count(method, body) != 1 {
        return fail(Reason::NotExactlyOneStatement);
    }
    if visibility(method) == Visibility::Private {
        return fail(Reason::ApiIsPrivate);
    }
    let Some(statement) = statements(body).into_iter().next() else { return fail(Reason::NoBody) };
    let expression = body_expression(statement)?;
    let failed = |reason: Reason, extra: Option<String>| Err(Failure { reason, extra });
    if expression.kind() == "explicit_constructor_invocation" && expression.child_by_field_name("constructor").is_some_and(|word| word.kind() == "super") {
        return fail(Reason::NoSuperCalls);
    }
    let listed = parameters(method);
    if listed.last().is_some_and(|last| last.kind() == "spread_parameter") && varargs_used_poorly(context, scopes, method, expression) {
        return fail(Reason::VarargsUsedUnsafely);
    }
    if listed.iter().any(|parameter| matches_arg_n(parameter_name(context, *parameter))) {
        return fail(Reason::ParamNamesAreNamedArgN);
    }
    if printed(context.file, expression).contains('{') || expression.kind() == "ternary_expression" {
        return fail(Reason::ComplexStatement);
    }
    if let Some(name) = reused_argument(context, scopes, method, expression) {
        return failed(Reason::ReuseOfArguments, Some(name.to_string()));
    }
    if let Some(source) = hidden_or_deprecated(context, scopes, expression, visibility(method)) {
        return failed(Reason::CallsDeprecatedOrPrivateApis, Some(source));
    }
    if evaluated_later(context, scopes, method, expression) {
        return fail(Reason::BodyWouldEvaluateDifferently);
    }
    if can_be_overridden(method) {
        let default = has_modifier(method, "default");
        return fail(if default { Reason::MethodCanBeOverriddenAndCantBeFixed } else { Reason::MethodCanBeOverriddenButCanBeFixed });
    }
    Ok(expression)
}
