//! MustBeClosedChecker: calls of `@MustBeClosed` methods and constructors outside try-with-resources, with Error
//! Prone's combined per-method fix, and constructors that must carry the annotation too.
use super::Context;
use super::fixes::Fix;
use super::must_be_closed_fix::{self as fix, Change, Names};
use super::qualify::qualify;
use crate::engine::source::{children, named_children};
use crate::java::types::model::{Method, Type};
use tree_sitter::Node;

pub(super) const ANNOTATION: &str = "com.google.errorprone.annotations.MustBeClosed";
const AUTO_CLOSEABLE: &str = "java.lang.AutoCloseable";
const MESSAGE: &str = "This method returns a resource which must be managed carefully, not just left for garbage collection. If it is a constant that will persist for the lifetime of your program, move it to a private static final field. Otherwise, you should use it in a try-with-resources.";
const BLOCKS: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration"];

pub fn must_be_closed(context: &Context, root: Node) {
    if !context.resolver.index.has(ANNOTATION) {
        return;
    }
    crate::engine::source::walk(root, |node| inspect(context, node));
}

fn inspect(context: &Context, node: Node) {
    match node.kind() {
        "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" => method(context, node),
        "class_declaration" => {
            if let Some(name) = context.resolver.scope.names.get(&node.id()) {
                class(context, node, node.child_by_field_name("body"), name.clone(), node.child_by_field_name("name").map_or(node.start_byte(), |name| keyword_of(node, name)));
            }
        }
        "object_creation_expression" => {
            let Some(body) = children(node).into_iter().find(|part| part.kind() == "class_body") else { return };
            let Some(base) = node.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)) else { return };
            anonymous(context, node, body, &base.name());
        }
        _ => {}
    }
}

fn keyword_of(class: Node, name: Node) -> usize {
    children(class).into_iter().find(|part| !part.is_named() && part.kind() == "class" && part.end_byte() <= name.start_byte()).map_or(class.start_byte(), |part| part.start_byte())
}

pub(super) fn suppressed(context: &Context, node: Node) -> bool {
    context.suppressed("MustBeClosed", node) || context.suppressed("MustBeClosedChecker", node)
}

pub(super) fn annotated(method: &Method) -> bool {
    method.detail.annotations.iter().any(|name| name == ANNOTATION)
}

fn declared_annotated(context: &Context, declaration: Node) -> bool {
    context.resolver.annotation_names(declaration).iter().any(|name| name == ANNOTATION)
}

fn report(context: &Context, matched: Node, at: usize, message: &str, fixes: &[Fix]) {
    if !suppressed(context, matched) {
        context.report_fixed("MustBeClosedChecker", matched, at, message, fixes);
    }
}

fn closeable(context: &Context, class: &str) -> bool {
    context.resolver.index.is_subtype(class, AUTO_CLOSEABLE)
}

/// Whether a written type is a subtype of `AutoCloseable`; a type variable counts when one of its bounds is.
fn returns_closeable(context: &Context, written: Node) -> bool {
    match context.resolver.type_node(written) {
        Some(Type::Class(name, _)) => closeable(context, &name),
        Some(Type::Variable(name)) => crate::java::types::scope::type_parameter(context.file, written, &name).is_some_and(|parameter| {
            children(parameter).into_iter().filter(|part| part.kind() == "type_bound").flat_map(named_children).any(|bound| matches!(context.resolver.type_node(bound), Some(Type::Class(found, _)) if closeable(context, &found)))
        }),
        _ => false,
    }
}

fn method(context: &Context, method: Node) {
    if let Some(body) = method.child_by_field_name("body") {
        scan_method(context, body);
    }
    if !declared_annotated(context, method) {
        return;
    }
    let at = method.child_by_field_name("name").map_or(method.start_byte(), |name| name.start_byte());
    if method.kind() != "method_declaration" {
        let owner = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, method);
        if !owner.is_some_and(|owner| closeable(context, &owner)) {
            report(context, method, at, "MustBeClosed should only annotate constructors of AutoCloseables.", &[]);
        }
    } else if !method.child_by_field_name("type").is_some_and(|written| returns_closeable(context, written)) {
        report(context, method, at, "MustBeClosed should only annotate methods that return an AutoCloseable.", &[]);
    }
}

fn scan_method(context: &Context, body: Node) {
    let mut names = Names::default();
    let mut merged = Fix::new();
    let mut braces: Vec<(usize, usize)> = Vec::new();
    let mut first: Option<Node> = None;
    scan(context, body, &mut |call| {
        let Some(change) = check(context, call, &mut names) else { return };
        merged = std::mem::replace(&mut merged, Fix::new()).merged(change.fix);
        if let Some(end) = change.close_after {
            match braces.iter_mut().find(|(at, _)| *at == end) {
                Some((_, count)) => *count += 1,
                None => braces.push((end, 1)),
            }
        }
        first.get_or_insert(call);
    });
    let Some(call) = first else { return };
    for (end, count) in braces {
        merged = merged.insert(end, "}".repeat(count));
    }
    let at = call.child_by_field_name("arguments").filter(|_| call.kind() == "method_invocation").map_or(call.start_byte(), |list| list.start_byte());
    let at = if call.kind() == "object_creation_expression" { fix::new_keyword(call) } else { at };
    context.report_fixed("MustBeClosedChecker", call, at, MESSAGE, &[merged]);
}

/// Every call and creation of the body in tree order, outer before inner, not looking into nested methods.
fn scan<'t>(context: &Context, node: Node<'t>, visit: &mut impl FnMut(Node<'t>)) {
    for child in children(node) {
        if BLOCKS.contains(&child.kind()) {
            continue;
        }
        if matches!(child.kind(), "method_invocation" | "object_creation_expression") && !suppressed(context, child) {
            visit(child);
        }
        scan(context, child, visit);
    }
}

fn check(context: &Context, call: Node, names: &mut Names) -> Option<Change> {
    let resolved = match call.kind() {
        "method_invocation" => context.resolver.resolve_call(call)?,
        _ => {
            if children(call).into_iter().any(|part| part.kind() == "class_body") {
                return None;
            }
            context.resolver.resolve_constructor(call)?
        }
    };
    if !annotated(&resolved.method) || fix::in_static_initializer(context, call) {
        return None;
    }
    let change = fix::closed(context, call, names)?;
    if super::unused::exception_testing(context, call) || (call.kind() == "method_invocation" && super::unused::mocking(context, call)) || fix::inside_mockito_when(context, call) {
        return None;
    }
    Some(change)
}

fn class(context: &Context, tree: Node, body: Option<Node>, name: String, at: usize) {
    if !closeable(context, &name) {
        return;
    }
    let Some(body) = body else { return };
    let members: Vec<Node> = named_children(body).into_iter().filter(|part| part.kind() == "constructor_declaration").collect();
    if members.is_empty() {
        if let Some(superclass) = context.resolver.index.get(&name).and_then(|info| info.superclass.clone()) {
            if implicit_super_annotated(context, &superclass) {
                report(context, tree, at, "Implicitly invoked constructor is marked @MustBeClosed, so this class must have an explicit constructor with @MustBeClosed also.", &[]);
            }
        }
        return;
    }
    for constructor in members {
        if declared_annotated(context, constructor) || !invoked_constructor_annotated(context, constructor, &name) {
            continue;
        }
        let name_node = constructor.child_by_field_name("name").unwrap_or(constructor);
        let written = qualify(context, tree, ANNOTATION);
        let fix = Fix::new().insert(constructor.start_byte(), format!("@{written} "));
        report(context, tree, name_node.start_byte(), "Invoked constructor is marked @MustBeClosed, so this constructor must be marked @MustBeClosed too.", &[fix]);
    }
}

fn anonymous(context: &Context, creation: Node, body: Node, base: &str) {
    if !closeable(context, base) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_constructor(creation) else { return };
    if annotated(&resolved.method) {
        report(context, creation, body.start_byte(), "Implicitly invoked constructor is marked @MustBeClosed, so this class must have an explicit constructor with @MustBeClosed also.", &[]);
    }
}

/// The constructor reached by the `super()` javac adds to a constructor that does not start with `this` or `super`.
fn implicit_super_annotated(context: &Context, superclass: &str) -> bool {
    let Some(info) = context.resolver.index.get(superclass) else { return false };
    let mut candidates = info.methods.iter().filter(|method| method.name == "<init>");
    let pick = candidates.clone().find(|method| method.parameters.is_empty()).or_else(|| candidates.find(|method| method.varargs && method.parameters.len() == 1));
    pick.is_some_and(annotated)
}

fn invoked_constructor_annotated(context: &Context, constructor: Node, class: &str) -> bool {
    let Some(body) = constructor.child_by_field_name("body") else { return false };
    let explicit = named_children(body).into_iter().find(|part| part.kind() == "explicit_constructor_invocation");
    match explicit {
        Some(call) => {
            let keyword = call.child_by_field_name("constructor").map(|part| context.text(part));
            matches!(keyword, Some("this" | "super")) && context.resolver.call_formals(call).is_some_and(|(found, _)| annotated(&found.method))
        }
        None => context.resolver.index.get(class).and_then(|info| info.superclass.clone()).is_some_and(|superclass| implicit_super_annotated(context, &superclass)),
    }
}
