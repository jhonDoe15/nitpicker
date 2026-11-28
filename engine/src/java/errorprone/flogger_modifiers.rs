//! FloggerRequiredModifiers: class-level `FluentLogger` fields are private static final, and `forEnclosingClass` is called there.
use super::Context;
use super::call_match::static_on_class;
use super::fix_helpers::{add_modifiers, remove_modifiers};
use super::fixes::Fix;
use super::lookup::field_of;
use super::shape::{arguments, is_class, preferred};
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::model::{Type, flag};
use crate::java::types::scope::enclosing_types;
use tree_sitter::Node;

const NAME: &str = "FloggerRequiredModifiers";
const MESSAGE: &str = "FluentLogger.forEnclosingClass should always be saved to a private static final field.";
const LOGGER: &str = "com.google.common.flogger.FluentLogger";
const NAMES: [&str; 4] = ["logger", "flogger", "googleLogger", "myLogger"];
const NESTED_FIELD: &str = "Private.logger";
const NESTED_DEFINITION: &str = "/** Do not use. Exists only to hide implementation details of this interface. */\npublic static final class Private {\n  private Private() {}\n  private static final FluentLogger logger = FluentLogger.forEnclosingClass();\n}";

/// The logger a rewritten reference points at, kept for the rest of the file.
struct LocalLogger {
    present: bool,
    symbol: Option<(String, String)>,
    name: String,
}

fn is_type_logger(kind: &Option<Type>) -> bool {
    matches!(kind, Some(Type::Class(name, _)) if name == LOGGER)
}

fn is_class_container(node: Node) -> bool {
    is_class(node) || (node.kind() == "class_body" && parent(node).is_some_and(|holder| matches!(holder.kind(), "object_creation_expression" | "enum_constant")))
}

fn is_interface(node: Node) -> bool {
    matches!(node.kind(), "interface_declaration" | "annotation_type_declaration")
}

fn enclosing_container(node: Node) -> Option<Node> {
    std::iter::successors(parent(node), |at| parent(*at)).find(|at| is_class_container(*at))
}

fn outermost_class(node: Node) -> Option<Node> {
    std::iter::successors(parent(node), |at| parent(*at)).filter(|at| is_class(*at)).last()
}

fn is_init_logger(context: &Context, call: Node) -> bool {
    call.kind() == "method_invocation" && arguments(call).is_empty() && static_on_class(context, call, LOGGER, &["forEnclosingClass"])
}

fn contains_init_logger(context: &Context, tree: Node) -> bool {
    let mut found = false;
    walk(tree, |node| found |= is_init_logger(context, node));
    found
}

/// `canHaveStaticFields`: a top-level class, or a member class that is static.
fn can_have_static_fields(class: Node) -> bool {
    if class.kind() == "class_body" {
        return false;
    }
    match parent(class) {
        Some(holder) if holder.kind() == "program" => true,
        Some(body) if matches!(body.kind(), "class_body" | "interface_body" | "annotation_type_body" | "enum_body_declarations") => {
            let outer = enclosing_container(class);
            has_modifier(class, "static") || !matches!(class.kind(), "class_declaration") || outer.is_some_and(is_interface)
        }
        _ => false,
    }
}

fn field_declarators(declaration: Node) -> Vec<Node> {
    children(declaration).into_iter().filter(|part| part.kind() == "variable_declarator").collect()
}

fn declarator_name<'a>(context: &'a Context, declarator: Node) -> &'a str {
    declarator.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

fn is_constant_logger(context: &Context, initializer: Node, class: Node) -> bool {
    if initializer.kind() == "method_invocation" {
        let owner = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, class);
        let known = context.resolver.resolve_call(initializer).is_some_and(|resolved| {
            resolved.method.is_static && owner.as_deref() == Some(resolved.declaring.as_str()) && resolved.method.returns == Type::class(LOGGER)
        });
        if known {
            return true;
        }
    }
    contains_init_logger(context, initializer)
}

fn fix_modifiers(context: &Context, declaration: Node, declarator: Node, class: Node) {
    let all = ["private", "static", "final"].iter().all(|word| has_modifier(declaration, word));
    if all {
        return;
    }
    let mut fix = add_modifiers(Fix::new(), declaration, &["private"]);
    fix = remove_modifiers(fix, declaration, &["public", "protected"]);
    let mut more = vec!["final"];
    if has_modifier(declaration, "final") && can_have_static_fields(class) {
        more.push("static");
    }
    fix = add_modifiers(fix, declaration, &more);
    if fix.is_empty() {
        return;
    }
    let at = declarator.child_by_field_name("name").map_or(declarator.start_byte(), |name| name.start_byte());
    context.report_fixed(NAME, declaration, at, MESSAGE, &[fix]);
}

fn variable(context: &Context, declaration: Node) {
    let Some(class) = enclosing_container(declaration) else { return };
    for declarator in field_declarators(declaration) {
        if !is_type_logger(&context.resolver.declared_type(declaration, Some(declarator))) {
            continue;
        }
        let matched = match declarator.child_by_field_name("value") {
            None => has_modifier(declaration, "static"),
            Some(initializer) => is_constant_logger(context, initializer, class) && !is_interface(class),
        };
        if matched {
            fix_modifiers(context, declaration, declarator, class);
        }
    }
}

fn nearest_owner(node: Node) -> Option<Node> {
    std::iter::successors(parent(node), |at| parent(*at))
        .find(|at| is_class_container(*at) || matches!(at.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "variable_declarator" | "resource"))
}

fn enclosing_method(node: Node) -> Option<Node> {
    std::iter::successors(parent(node), |at| parent(*at)).find(|at| matches!(at.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration"))
}

fn is_field_logger(context: &Context, owner: Node) -> bool {
    let Some(declaration) = parent(owner).filter(|holder| owner.kind() == "variable_declarator" && matches!(holder.kind(), "field_declaration" | "constant_declaration")) else { return false };
    is_type_logger(&context.resolver.declared_type(declaration, Some(owner)))
}

struct Walk<'c, 'a> {
    context: &'c Context<'a>,
    local: Option<LocalLogger>,
}

impl<'c, 'a> Walk<'c, 'a> {
    fn invocation(&mut self, call: Node<'a>) {
        if !is_init_logger(self.context, call) {
            return;
        }
        let Some(owner) = nearest_owner(call) else { return };
        if is_field_logger(self.context, owner) {
            return;
        }
        let returns_logger = enclosing_method(call).is_some_and(|method| {
            method.kind() == "method_declaration" && method.child_by_field_name("type").is_some_and(|kind| is_type_logger(&self.context.resolver.type_node(kind)))
        });
        if returns_logger {
            return;
        }
        self.replace(call);
    }

    fn rehome(&mut self, node: Node<'a>) {
        let Some((owner, field)) = field_of(self.context, node) else { return };
        if field.kind != Type::class(LOGGER) || !(field.flags & flag::STATIC != 0 || node.kind() == "identifier") {
            return;
        }
        let index = self.context.resolver.index;
        let mut outermost = owner.name.clone();
        while let Some((above, _)) = outermost.rsplit_once('.') {
            if !index.has(above) {
                break;
            }
            outermost = above.to_string();
        }
        let inside = enclosing_types(self.context.resolver.scope, node).contains(&outermost);
        if inside && !owner.is_interface {
            return;
        }
        self.replace(node);
    }

    fn compute(&self, expr: Node<'a>, fix: &mut Fix) -> Option<LocalLogger> {
        let context = self.context;
        let top = outermost_class(expr)?;
        let body = top.child_by_field_name("body")?;
        let ignored = std::iter::successors(parent(expr), |at| parent(*at)).find(|at| at.kind() == "variable_declarator" || is_class_container(*at)).filter(|at| at.kind() == "variable_declarator");
        let members: Vec<Node> = named_children(body).into_iter().flat_map(|member| if member.kind() == "enum_body_declarations" { named_children(member) } else { vec![member] }).collect();
        for member in &members {
            if !matches!(member.kind(), "field_declaration" | "constant_declaration") {
                continue;
            }
            for declarator in field_declarators(*member) {
                if is_type_logger(&context.resolver.declared_type(*member, Some(declarator))) && ignored.is_none_or(|skip| skip.id() != declarator.id()) {
                    if !is_interface(top) {
                        let class = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, top)?;
                        return Some(LocalLogger { present: true, symbol: Some((class, declarator_name(context, declarator).to_string())), name: declarator_name(context, declarator).to_string() });
                    }
                    *fix = std::mem::take(fix).delete(member.start_byte(), member.end_byte());
                    return Some(self.nested(top, fix));
                }
            }
        }
        *fix = std::mem::take(fix).with_imports();
        if is_interface(top) {
            return Some(self.nested(top, fix));
        }
        let info = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, top).and_then(|name| context.resolver.index.get(&name))?;
        let taken = |name: &str| {
            info.fields.iter().any(|field| field.name == name)
                || info.methods.iter().any(|method| method.name == name)
                || context.resolver.index.has(&format!("{}.{name}", info.name))
        };
        let name = NAMES.iter().find(|name| !taken(name))?;
        let text = format!("\n\nprivate static final FluentLogger {name} = FluentLogger.forEnclosingClass();\n");
        let at = members.iter().find(|member| member.kind() != ";" && !member.kind().ends_with("comment")).map_or(body.end_byte() - 1, |_| body.start_byte() + 1);
        *fix = std::mem::take(fix).insert(at, text);
        Some(LocalLogger { present: false, symbol: None, name: (*name).to_string() })
    }

    fn nested(&self, top: Node, fix: &mut Fix) -> LocalLogger {
        let at = top.end_byte() - 1;
        *fix = std::mem::take(fix).insert(at, format!("\n\n{NESTED_DEFINITION}\n"));
        LocalLogger { present: false, symbol: None, name: NESTED_FIELD.to_string() }
    }

    fn self_assignment(&self, expr: Node, target: &(String, String)) -> bool {
        let mut current = Some(expr);
        while let Some(at) = current {
            if !at.kind().ends_with("_expression") && at.kind() != "method_reference" {
                break;
            }
            if at.kind() == "assignment_expression" {
                let same = at.child_by_field_name("left").and_then(|left| field_of(self.context, left)).is_some_and(|(owner, field)| owner.name == target.0 && field.name == target.1);
                if same {
                    return true;
                }
            }
            current = parent(at);
        }
        false
    }

    fn replace(&mut self, expr: Node<'a>) {
        let context = self.context;
        let mut fix = Fix::new();
        if self.local.is_none() {
            let Some(found) = self.compute(expr, &mut fix) else { return };
            self.local = Some(found);
        }
        let Some(logger) = self.local.as_ref() else { return };
        if logger.present {
            if let Some(target) = &logger.symbol {
                if self.self_assignment(expr, target) {
                    return;
                }
            }
        }
        let name = logger.name.clone();
        let holder = parent(expr).filter(|holder| holder.kind() == "variable_declarator" && declarator_name(context, *holder) == name);
        if let Some(holder) = holder {
            let statement = parent(holder).filter(|statement| statement.kind() == "local_variable_declaration" && field_declarators(*statement).len() == 1).unwrap_or(holder);
            fix = fix.delete(statement.start_byte(), statement.end_byte());
            return context.report_fixed(NAME, expr, preferred(expr), MESSAGE, &[fix]);
        }
        if name == context.text(expr) {
            if fix.is_empty() {
                return;
            }
            return context.report_fixed(NAME, expr, preferred(expr), MESSAGE, &[fix]);
        }
        let fix = fix.and(expr.start_byte(), expr.end_byte(), name);
        context.report_fixed(NAME, expr, preferred(expr), MESSAGE, &[fix]);
    }
}

fn expression_identifier(node: Node) -> bool {
    let Some(holder) = parent(node) else { return false };
    let named = |field: &str| holder.child_by_field_name(field).is_some_and(|part| part.id() == node.id());
    match holder.kind() {
        "method_invocation" => !named("name"),
        "field_access" => !named("field"),
        "variable_declarator" | "formal_parameter" | "spread_parameter" | "catch_formal_parameter" | "enum_constant" | "method_declaration" | "constructor_declaration" | "labeled_statement" | "break_statement" | "continue_statement" | "scoped_identifier" | "import_declaration" | "package_declaration" | "method_reference" | "element_value_pair" | "annotation" | "marker_annotation" | "inferred_parameters" | "lambda_expression" => {
            holder.kind() == "variable_declarator" && !named("name") || (holder.kind() == "lambda_expression" && !named("parameters"))
        }
        _ => true,
    }
}

pub fn flogger_required_modifiers(context: &Context, root: Node) {
    if !context.resolver.index.has(LOGGER) {
        return;
    }
    let mut state = Walk { context, local: None };
    walk(root, |node| match node.kind() {
        "field_declaration" | "constant_declaration" => variable(context, node),
        "method_invocation" => state.invocation(node),
        "identifier" if expression_identifier(node) => state.rehome(node),
        "field_access" => state.rehome(node),
        _ => {}
    });
}
