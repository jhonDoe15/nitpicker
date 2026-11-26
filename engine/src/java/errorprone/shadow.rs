//! VariableNameSameAsType, TypeParameterShadowing and ClassNamedLikeTypeParameter.
use super::fixes::Fix;
use super::nodes::{class_position, name_position, token};
use super::typevars::{rename, valid_name};
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::{has_modifier, in_interface_or_annotation};
use crate::java::types::expr::Binding;
use crate::java::types::model::Type;
use tree_sitter::Node;

fn simple(name: &str) -> &str {
    name.rsplit('.').next().unwrap_or(name)
}

/// The type as `SuggestedFixes.prettyType` prints it without a state: simple names, `, ` between type arguments.
fn pretty(kind: &Type) -> String {
    match kind {
        Type::Class(name, arguments) if arguments.is_empty() => simple(name).to_string(),
        Type::Class(name, arguments) => format!("{}<{}>", simple(name), arguments.iter().map(pretty).collect::<Vec<_>>().join(", ")),
        Type::Array(element) => format!("{}[]", pretty(element)),
        Type::Variable(name) => name.clone(),
        Type::Primitive(name) => (*name).to_string(),
        Type::Wildcard => "?".to_string(),
        Type::Bounded(lower, bound) => format!("? {} {}", if *lower { "super" } else { "extends" }, pretty(bound)),
        Type::Null => "null".to_string(),
    }
}

fn bounded<'t>(parts: &[Node<'t>]) -> Option<Node<'t>> {
    parts.iter().rev().find(|part| !part.kind().ends_with("annotation") && !part.kind().ends_with("comment")).copied()
}

/// The simple name of the class a written type stands for and the type as printed; `None` for what has no class name.
fn written(context: &Context, node: Node) -> Option<(String, String)> {
    let parts = named_children(node);
    match node.kind() {
        "type_identifier" => Some((context.text(node).to_string(), context.text(node).to_string())),
        "scoped_type_identifier" => {
            let last = bounded(&parts)?;
            Some((context.text(last).to_string(), context.text(last).to_string()))
        }
        "generic_type" => {
            let base = parts.iter().find(|part| matches!(part.kind(), "type_identifier" | "scoped_type_identifier"))?;
            let (name, _) = written(context, *base)?;
            let given = parts.iter().find(|part| part.kind() == "type_arguments").map(|list| named_children(*list)).unwrap_or_default();
            let shown: Vec<String> = given.into_iter().filter(|part| !part.kind().ends_with("comment")).filter_map(|part| argument(context, part)).collect();
            Some((name.clone(), format!("{name}<{}>", shown.join(", "))))
        }
        "annotated_type" => written(context, bounded(&parts)?),
        "integral_type" | "floating_point_type" | "boolean_type" => Some((context.text(node).to_string(), context.text(node).to_string())),
        _ => None,
    }
}

fn argument(context: &Context, node: Node) -> Option<String> {
    match node.kind() {
        "wildcard" => {
            let bound = bounded(&named_children(node));
            let word = if token(node, "super").is_some() { "super" } else { "extends" };
            Some(bound.and_then(|bound| argument(context, bound)).map_or("?".to_string(), |bound| format!("? {word} {bound}")))
        }
        "array_type" => {
            let element = argument(context, node.child_by_field_name("element")?)?;
            let count = node.child_by_field_name("dimensions").map_or(1, |dimensions| context.text(dimensions).matches('[').count());
            Some(format!("{element}{}", "[]".repeat(count)))
        }
        _ => written(context, node).map(|(_, shown)| shown),
    }
}

/// The class name and the printed type of a variable with the type written in front of it.
fn written_variable(context: &Context, kind: Node, dimensions: usize) -> Option<(String, String)> {
    if dimensions > 0 {
        let (_, shown) = written(context, kind).or_else(|| argument(context, kind).map(|shown| (String::new(), shown)))?;
        return Some(("Array".to_string(), format!("{shown}{}", "[]".repeat(dimensions))));
    }
    if kind.kind() == "array_type" {
        let shown = argument(context, kind)?;
        return Some(("Array".to_string(), shown));
    }
    written(context, kind)
}

fn dimension_count(context: &Context, holder: Node) -> usize {
    holder.child_by_field_name("dimensions").map_or(0, |dimensions| context.text(dimensions).matches('[').count())
}

fn inferred(context: &Context, name: Node) -> Option<(String, String)> {
    let kind = context.resolver.binding(name, context.text(name)).and_then(|binding| match binding {
        Binding::Local(kind) => kind,
        Binding::Field(kind, _, _) => Some(kind),
    })?;
    match &kind {
        Type::Class(class, _) => Some((simple(class).to_string(), pretty(&kind))),
        Type::Array(_) => Some(("Array".to_string(), pretty(&kind))),
        _ => None,
    }
}

/// The class and printed type of a `var` variable, from what it is initialized with.
fn initializer_type(context: &Context, name: Node) -> Option<(String, String)> {
    let holder = parent(name)?;
    if !matches!(holder.kind(), "variable_declarator" | "resource") {
        return inferred(context, name);
    }
    let kind = context.resolver.type_of(holder.child_by_field_name("value")?)?;
    match &kind {
        Type::Class(class, _) => Some((simple(class).to_string(), pretty(&kind))),
        Type::Array(_) => Some(("Array".to_string(), pretty(&kind))),
        _ => None,
    }
}

fn check_variable(context: &Context, declaration: Node, name: Node, kind: Option<(String, String)>) {
    let Some((class, shown)) = kind else { return };
    let variable = context.text(name);
    if class != variable {
        return;
    }
    let message = format!("Variable named {variable} has the type {shown}. Calling methods using \"{variable}.something\" are difficult to distinguish between static and instance methods.");
    context.report_fixed("VariableNameSameAsType", declaration, name.start_byte(), &message, &[]);
}

fn typed(context: &Context, declaration: Node, name: Node, kind: Option<Node>, dimensions: usize) {
    let result = match kind {
        Some(kind) if context.text(kind) != "var" => written_variable(context, kind, dimensions),
        Some(_) => initializer_type(context, name),
        None => inferred(context, name),
    };
    check_variable(context, declaration, name, result);
}

pub fn variable_name_same_as_type(context: &Context, node: Node) {
    match node.kind() {
        "variable_declarator" => {
            let Some(holder) = parent(node).filter(|holder| matches!(holder.kind(), "field_declaration" | "local_variable_declaration" | "constant_declaration")) else { return };
            let (Some(name), kind) = (node.child_by_field_name("name"), holder.child_by_field_name("type")) else { return };
            typed(context, holder, name, kind, dimension_count(context, node));
        }
        "catch_formal_parameter" => {
            let Some(name) = node.child_by_field_name("name") else { return };
            let types: Vec<Node> = children(node).into_iter().find(|part| part.kind() == "catch_type").map(named_children).unwrap_or_default();
            let [only] = types.as_slice() else { return };
            typed(context, node, name, Some(*only), 0);
        }
        "formal_parameter" => {
            let (Some(name), kind) = (node.child_by_field_name("name"), node.child_by_field_name("type").or_else(|| named_children(node).into_iter().find(|part| part.kind().ends_with("type")))) else { return };
            typed(context, node, name, kind, dimension_count(context, node));
        }
        "spread_parameter" => {
            let Some(declarator) = children(node).into_iter().find(|part| part.kind() == "variable_declarator") else { return };
            let Some(name) = declarator.child_by_field_name("name") else { return };
            let kind = named_children(node).into_iter().find(|part| !matches!(part.kind(), "modifiers" | "variable_declarator") && !part.kind().ends_with("annotation"));
            typed(context, node, name, kind, 1 + dimension_count(context, declarator));
        }
        "enhanced_for_statement" => {
            let Some(name) = node.child_by_field_name("name") else { return };
            typed(context, node, name, node.child_by_field_name("type"), dimension_count(context, node));
        }
        "resource" => {
            let Some(name) = node.child_by_field_name("name") else { return };
            typed(context, node, name, node.child_by_field_name("type"), dimension_count(context, node));
        }
        "enum_constant" => {
            let Some(name) = node.child_by_field_name("name") else { return };
            let Some(class) = parent(node).and_then(parent).and_then(|body| body.child_by_field_name("name")) else { return };
            let shown = context.text(class).to_string();
            check_variable(context, node, name, Some((shown.clone(), shown)));
        }
        "instanceof_expression" => {
            let (Some(name), Some(kind)) = (node.child_by_field_name("name"), node.child_by_field_name("right")) else { return };
            typed(context, node, name, Some(kind), 0);
        }
        "lambda_expression" => {
            let Some(parameters) = node.child_by_field_name("parameters") else { return };
            match parameters.kind() {
                "identifier" => typed(context, node, parameters, None, 0),
                "inferred_parameters" => {
                    for name in named_children(parameters).into_iter().filter(|part| part.kind() == "identifier") {
                        typed(context, node, name, None, 0);
                    }
                }
                _ => {}
            }
        }
        _ => {}
    }
}

pub fn class_named_like_type_parameter(context: &Context, node: Node) {
    if !matches!(node.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration") {
        return;
    }
    let Some(name) = node.child_by_field_name("name") else { return };
    if valid_name(context.text(name)) {
        context.report_fixed("ClassNamedLikeTypeParameter", node, class_position(node), "This class's name looks like a Type Parameter.", &[]);
    }
}

const CLASS_LIKE: &[&str] = &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];
const METHOD_LIKE: &[&str] = &["method_declaration", "constructor_declaration"];

fn parameters_of<'t>(context: &Context, declaration: Node<'t>) -> Vec<(String, Node<'t>)> {
    let list = declaration.child_by_field_name("type_parameters").or_else(|| token(declaration, "type_parameters"));
    let all = list.map(children).unwrap_or_default();
    all.into_iter()
        .filter(|part| part.kind() == "type_parameter")
        .filter_map(|part| children(part).into_iter().find(|name| matches!(name.kind(), "type_identifier" | "identifier")).map(|name| (context.text(name).to_string(), part)))
        .collect()
}

fn is_static(declaration: Node) -> bool {
    if has_modifier(declaration, "static") {
        return true;
    }
    CLASS_LIKE.contains(&declaration.kind()) && (declaration.kind() != "class_declaration" || in_interface_or_annotation(declaration)) && parent(declaration).is_some_and(|holder| holder.kind() != "program")
}

fn owner_name(context: &Context, owner: Node) -> String {
    if METHOD_LIKE.contains(&owner.kind()) {
        return if owner.kind() == "constructor_declaration" { "<init>".to_string() } else { owner.child_by_field_name("name").map(|name| context.text(name).to_string()).unwrap_or_default() };
    }
    owner.child_by_field_name("name").map(|name| context.text(name).to_string()).unwrap_or_default()
}

/// The type variables of the owners around a declaration that its code can still use, innermost owner first, with the owner's name.
fn enclosing_variables(context: &Context, declaration: Node) -> Vec<(String, String)> {
    let mut found = Vec::new();
    if is_static(declaration) {
        return found;
    }
    let mut current = declaration;
    loop {
        let mut above = parent(current);
        let owner = loop {
            let Some(node) = above else { break None };
            let class_body = node.kind() == "object_creation_expression" && token(node, "class_body").is_some();
            match node.kind() {
                kind if CLASS_LIKE.contains(&kind) || METHOD_LIKE.contains(&kind) => break Some(node),
                _ if class_body => break Some(node),
                "field_declaration" | "constant_declaration" if has_modifier(node, "static") || node.kind() == "constant_declaration" || in_interface_or_annotation(node) => return found,
                "static_initializer" | "compact_constructor_declaration" => return found,
                _ => above = parent(node),
            }
        };
        let Some(owner) = owner else { break };
        let label = owner_name(context, owner);
        found.extend(parameters_of(context, owner).into_iter().map(|(name, _)| (name, label.clone())));
        if is_static(owner) {
            break;
        }
        current = owner;
    }
    found
}

fn replacement(name: &str, in_scope: &[String]) -> String {
    let digits = name.len() - name.trim_end_matches(|letter: char| letter.is_ascii_digit()).len();
    let (base, mut number) = if digits > 0 && digits < name.len() {
        (&name[..name.len() - digits], name[name.len() - digits..].parse::<u64>().map_or(2, |given| given + 1))
    } else {
        (name, 2)
    };
    while in_scope.iter().any(|taken| *taken == format!("{base}{number}")) {
        number += 1;
    }
    format!("{base}{number}")
}

pub fn type_parameter_shadowing(context: &Context, node: Node) {
    if !CLASS_LIKE.contains(&node.kind()) && !METHOD_LIKE.contains(&node.kind()) {
        return;
    }
    let own = parameters_of(context, node);
    if own.is_empty() {
        return;
    }
    let enclosing = enclosing_variables(context, node);
    let conflicts: Vec<&(String, String)> = own.iter().filter_map(|(name, _)| enclosing.iter().find(|(known, _)| known == name)).collect();
    if conflicts.is_empty() {
        return;
    }
    let message = format!("Found aliased type parameters: {}", conflicts.iter().map(|(name, owner)| format!("{name} declared in {owner}")).collect::<Vec<_>>().join("\n"));
    let in_scope: Vec<String> = enclosing.iter().map(|(name, _)| name.clone()).chain(own.iter().map(|(name, _)| name.clone())).collect();
    let mut fix = Fix::new();
    for (name, _) in &conflicts {
        let Some((_, declared)) = own.iter().find(|(known, _)| known == name) else { continue };
        fix = fix.merged(rename(context, node, *declared, name, &replacement(name, &in_scope)));
    }
    let at = if CLASS_LIKE.contains(&node.kind()) { class_position(node) } else { name_position(node) };
    context.report_fixed("TypeParameterShadowing", node, at, &message, &[fix]);
}
