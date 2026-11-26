//! Checks on the shape of declarations and statements.
use super::Context;
use super::fix_helpers::{delete_with_leading_whitespace, remove_modifiers};
use super::fixes::Fix;
use super::members::printed_type;
use super::hierarchy::{declared_method, super_methods};
use super::members::{BODIES, is_method};
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::{declarators, has_modifier};
use tree_sitter::Node;

fn name_start(node: Node) -> usize {
    node.child_by_field_name("name").map_or(node.start_byte(), |name| name.start_byte())
}

pub fn multi_variable_declaration(context: &Context, node: Node) {
    let local = node.kind() == "local_variable_declaration";
    if !local && !matches!(node.kind(), "field_declaration" | "constant_declaration") {
        return;
    }
    let Some(holder) = parent(node) else { return };
    let listed = if local { matches!(holder.kind(), "block" | "constructor_body") } else { BODIES.contains(&holder.kind()) || holder.kind() == "enum_body_declarations" };
    let names = declarators(node);
    if !listed || names.len() < 2 {
        return;
    }
    let around = if local { holder } else { parent(holder).filter(|_| holder.kind() == "enum_body_declarations").unwrap_or(holder) };
    let fix = Fix::replace(node.start_byte(), node.end_byte(), names.iter().map(|name| pretty_variable(context, node, *name)).collect::<String>());
    context.report_fixed("MultiVariableDeclaration", around, name_start(names[0]), "Variable declarations should declare only one variable", &[fix]);
}

/// One variable of a declaration printed on its own, as javac prints a variable tree: annotations on lines of their own.
fn pretty_variable(context: &Context, declaration: Node, declarator: Node) -> String {
    let mut text = String::new();
    let mut flags = Vec::new();
    for part in crate::java::helpers::modifiers(declaration).map(children).unwrap_or_default() {
        if matches!(part.kind(), "annotation" | "marker_annotation") {
            let name = part.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
            let arguments = part.child_by_field_name("arguments").map(|list| context.text(list).to_string()).unwrap_or_default();
            text.push_str(&format!("@{name}{arguments}\n"));
        } else {
            flags.push(part.kind());
        }
    }
    for flag in flags {
        text.push_str(&format!("{flag} "));
    }
    let extra = declarator.child_by_field_name("dimensions").map_or(0, |dimensions| context.text(dimensions).matches('[').count());
    let kind = declaration.child_by_field_name("type").map(|kind| printed_type(context, kind)).unwrap_or_default();
    text.push_str(&format!("{kind}{} {}", "[]".repeat(extra), declarator.child_by_field_name("name").map_or("", |name| context.text(name))));
    if let Some(value) = declarator.child_by_field_name("value") {
        text.push_str(&format!(" = {}", printed_value(context, value)));
    }
    text.push(';');
    text
}

/// The initializer as javac prints it where that differs from the source: a cast has no space before its operand.
fn printed_value(context: &Context, value: Node) -> String {
    let mut gaps = Vec::new();
    crate::engine::source::walk(value, |node| {
        if node.kind() == "cast_expression" {
            let close = children(node).into_iter().find(|part| part.kind() == ")");
            if let (Some(close), Some(operand)) = (close, node.child_by_field_name("value")) {
                gaps.push((close.end_byte(), operand.start_byte()));
            }
        }
    });
    gaps.sort_unstable();
    let mut text = String::new();
    let mut at = value.start_byte();
    for (start, end) in gaps {
        text.push_str(&context.file.text[at..start]);
        at = end;
    }
    text.push_str(&context.file.text[at..value.end_byte()]);
    text
}

pub fn array_record_component(context: &Context, node: Node) {
    if node.kind() != "record_declaration" {
        return;
    }
    for component in node.child_by_field_name("parameters").map(named_children).unwrap_or_default() {
        let array = component.kind() == "spread_parameter"
            || component.child_by_field_name("type").is_some_and(|kind| kind.kind() == "array_type")
            || component.child_by_field_name("dimensions").is_some();
        if array && matches!(component.kind(), "formal_parameter" | "spread_parameter") {
            let at = match component.kind() {
                "spread_parameter" => declarators(component).first().map_or(component.start_byte(), |name| name_start(*name)),
                _ => name_start(component),
            };
            context.report("ArrayRecordComponent", component, at, "Record components should not be arrays.");
        }
    }
}

pub fn return_at_the_end_of_void_function(context: &Context, node: Node) {
    let void = match node.kind() {
        "method_declaration" => node.child_by_field_name("type").is_some_and(|kind| kind.kind() == "void_type"),
        "constructor_declaration" => true,
        _ => false,
    };
    let Some(body) = node.child_by_field_name("body").filter(|_| void) else { return };
    let last = named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).next_back();
    if let Some(last) = last.filter(|last| last.kind() == "return_statement") {
        let fix = Fix::replace(last.start_byte(), last.end_byte(), "");
        context.report_fixed("ReturnAtTheEndOfVoidFunction", node, name_start(node), "`return;` is unnecessary at the end of void methods and constructors.", &[fix]);
    }
}

pub fn assignment_expression(context: &Context, node: Node) {
    if node.kind() != "assignment_expression" {
        return;
    }
    let Some(operator) = node.child_by_field_name("operator").filter(|operator| operator.kind() == "=") else { return };
    let Some(holder) = parent(node) else { return };
    let plain = |assignment: Node| assignment.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "=");
    let own = node.child_by_field_name("left").filter(|left| left.kind() == "identifier").map(|left| context.text(left));
    let variable = |name: &str| node.child_by_field_name("left").is_some_and(|left| context.resolver.is_variable(left, name));
    let allowed = match holder.kind() {
        "expression_statement" | "lambda_expression" => true,
        "for_statement" => holder.child_by_field_name("condition") != Some(node),
        "parenthesized_expression" => parent(holder).is_some_and(|outer| outer.kind() == "binary_expression"),
        "assignment_expression" if plain(holder) => {
            let outer = holder.child_by_field_name("left").filter(|left| left.kind() == "identifier").map(|left| context.text(left));
            !(own.is_some() && own == outer && own.is_some_and(variable))
        }
        "variable_declarator" => false,
        _ => false,
    };
    if !allowed {
        context.report(
            "AssignmentExpression",
            node,
            operator.start_byte(),
            "The use of an assignment expression can be surprising and hard to read; consider factoring out the assignment to a separate statement.",
        );
    }
}

pub fn protected_members_in_final_class(context: &Context, node: Node) {
    const NAME: &str = "ProtectedMembersInFinalClass";
    if !(node.kind() == "record_declaration" || (node.kind() == "class_declaration" && has_modifier(node, "final"))) {
        return;
    }
    let Some(body) = node.child_by_field_name("body") else { return };
    let mut names: Vec<&str> = Vec::new();
    let mut first = None;
    let mut fix = Fix::new();
    for member in children(body) {
        let field = member.kind() == "field_declaration";
        if !(field || is_method(member)) || !has_modifier(member, "protected") || context.suppressed(NAME, member) {
            continue;
        }
        fix = remove_modifiers(fix, member, &["public", "protected", "private"]);
        if field {
            for declarator in declarators(member) {
                first.get_or_insert(name_start(declarator));
                names.extend(declarator.child_by_field_name("name").map(|name| context.text(name)));
            }
            continue;
        }
        let overrides = declared_method(context, member).is_some_and(|(origin, method)| !super_methods(context.resolver.index, origin, method).is_empty());
        if !overrides {
            first.get_or_insert(name_start(member));
            names.extend(member.child_by_field_name("name").map(|name| context.text(name)));
        }
    }
    if let Some(at) = first {
        context.report_fixed(NAME, node, at, &format!("Make members of final classes package-private: {}", names.join(", ")), &[fix]);
    }
}

const SEMICOLON: &str =
    "Unnecessary semicolons should be omitted. For empty block statements, prefer {}.";

fn member_place(member: Node) -> usize {
    match member.kind() {
        "field_declaration" | "constant_declaration" => declarators(member)
            .last()
            .map_or(member.start_byte(), |last| name_start(*last)),
        "class_declaration"
        | "interface_declaration"
        | "enum_declaration"
        | "record_declaration"
        | "annotation_type_declaration" => children(member)
            .into_iter()
            .find(|part| part.kind() != "modifiers")
            .map_or(member.start_byte(), |keyword| keyword.start_byte()),
        _ => name_start(member),
    }
}

fn semicolons_between_members(context: &Context, body: Node) {
    let record = parent(body).filter(|holder| holder.kind() == "record_declaration");
    let component = record
        .and_then(|record| record.child_by_field_name("parameters"))
        .and_then(|list| named_children(list).into_iter().next_back());
    let mut current: Option<(usize, bool)> =
        component.map(|component| (name_start(component), false));
    let mut waiting: Vec<usize> = Vec::new();
    let mut parts = Vec::new();
    for child in children(body) {
        if child.kind() == "enum_body_declarations" {
            parts.extend(children(child))
        } else {
            parts.push(child)
        }
    }
    for part in parts {
        if part.kind() == ";" {
            waiting.push(part.start_byte());
            continue;
        }
        if !part.is_named() || part.kind().ends_with("comment") {
            continue;
        }
        let constant = part.kind() == "enum_constant";
        if let Some((at, _)) = current.filter(|(_, before)| !(*before && !constant)) {
            semicolons(context, body, at, &waiting);
        }
        waiting.clear();
        current = Some((
            if constant {
                part.start_byte()
            } else {
                member_place(part)
            },
            constant,
        ));
    }
    if let Some((at, false)) = current {
        semicolons(context, body, at, &waiting);
    }
}

fn semicolons(context: &Context, body: Node, at: usize, places: &[usize]) {
    for place in places {
        let fix = delete_with_leading_whitespace(&context.file.text, *place, place + 1);
        context.report_fixed("UnnecessarySemicolon", body, at, SEMICOLON, &[fix]);
    }
}

pub fn unnecessary_semicolon(context: &Context, node: Node) {
    let empty: Vec<Node> = match node.kind() {
        "block" | "constructor_body" | "switch_block_statement_group" => children(node),
        "if_statement" => ["consequence", "alternative"]
            .iter()
            .filter_map(|field| node.child_by_field_name(field))
            .collect(),
        "while_statement" | "for_statement" | "enhanced_for_statement" | "do_statement" => {
            node.child_by_field_name("body").into_iter().collect()
        }
        "labeled_statement" => children(node).into_iter().next_back().into_iter().collect(),
        kind if BODIES.contains(&kind) => {
            semicolons_between_members(context, node);
            return;
        }
        _ => return,
    };
    for statement in empty
        .into_iter()
        .filter(|statement| statement.kind() == ";")
    {
        let (start, end) = (statement.start_byte(), statement.end_byte());
        let fix = if matches!(node.kind(), "block" | "constructor_body" | "switch_block_statement_group") {
            delete_with_leading_whitespace(&context.file.text, start, end)
        } else {
            Fix::replace(start, end, "{}")
        };
        context.report_fixed("UnnecessarySemicolon", node, start, SEMICOLON, &[fix]);
    }
}

fn join(on: &str, pieces: &[String]) -> String {
    if pieces.len() == 2 {
        return pieces.join(" and ");
    }
    let mut joined = String::new();
    for (place, piece) in pieces.iter().enumerate() {
        if place > 0 {
            joined.push_str(on);
            if place == pieces.len() - 1 {
                joined.push_str("and ");
            }
        }
        joined.push_str(piece);
    }
    joined
}

pub fn redundant_throws(context: &Context, node: Node) {
    if !matches!(
        node.kind(),
        "method_declaration" | "constructor_declaration"
    ) {
        return;
    }
    let Some(clause) = children(node)
        .into_iter()
        .find(|part| part.kind() == "throws")
    else {
        return;
    };
    let index = context.resolver.index;
    let thrown: Vec<(Node, Option<String>, Vec<String>)> = named_children(clause)
        .into_iter()
        .filter(|part| !part.kind().ends_with("comment"))
        .map(|written| {
            let variable = Some(written)
                .filter(|written| written.kind() == "type_identifier")
                .and_then(|written| {
                    crate::java::types::scope::type_parameter(
                        context.file,
                        written,
                        context.text(written),
                    )
                });
            if let Some(parameter) = variable {
                let bound = children(parameter)
                    .into_iter()
                    .find(|part| part.kind() == "type_bound")
                    .and_then(|bound| {
                        named_children(bound)
                            .into_iter()
                            .find_map(|first| context.resolver.type_node(first))
                    })
                    .map(|bound| bound.erased().name());
                return (
                    written,
                    None,
                    bound
                        .map(|bound| index.superclasses(&bound))
                        .unwrap_or_default(),
                );
            }
            match context.resolver.type_node(written) {
                Some(kind) => {
                    let name = kind.erased().name();
                    let above = index.superclasses(&name).split_off(1);
                    (written, Some(name), above)
                }
                None => (written, None, Vec::new()),
            }
        })
        .collect();
    let mut messages = Vec::new();
    let mut first: Option<Node> = None;
    let mut removed: Vec<usize> = Vec::new();
    for (_, name, _) in &thrown {
        let Some(name) = name else { continue };
        let below: Vec<usize> = thrown
            .iter()
            .enumerate()
            .filter(|(_, (_, _, above))| above.contains(name))
            .map(|(place, _)| place)
            .collect();
        if below.is_empty() {
            continue;
        }
        let texts: Vec<String> = below
            .iter()
            .map(|place| context.text(thrown[*place].0).to_string())
            .collect();
        let verb = if texts.len() == 1 {
            "is a subtype"
        } else {
            "are subtypes"
        };
        messages.push(format!(
            "{} {} of {}",
            join(", ", &texts),
            verb,
            super::hierarchy::simple_name(name)
        ));
        removed.extend(below);
    }
    if let Some(place) = removed.iter().min() {
        first = Some(thrown[*place].0);
    }
    let Some(first) = first else { return };
    let at = match first.kind() {
        "scoped_type_identifier" => children(first)
            .into_iter()
            .filter(|part| part.kind() == ".")
            .next_back()
            .map_or(first.start_byte(), |dot| dot.start_byte()),
        _ => first.start_byte(),
    };
    let fix = delete_exceptions(context, clause, &thrown.iter().map(|(written, _, _)| *written).collect::<Vec<_>>(), &removed);
    context.report_fixed("RedundantThrows", node, at, &format!("Redundant throws clause: {}", join("; ", &messages)), &[fix]);
}

/// Error Prone's `deleteExceptions`: the whole clause when every exception goes, else the clause rewritten without them.
fn delete_exceptions(context: &Context, clause: Node, listed: &[Node], removed: &[usize]) -> Fix {
    let end = listed[listed.len() - 1].end_byte();
    if (0..listed.len()).all(|place| removed.contains(&place)) {
        let keyword = children(clause).into_iter().find(|part| part.kind() == "throws").map_or(clause.start_byte(), |word| word.start_byte());
        return Fix::replace(keyword - 1, end, "");
    }
    let kept: Vec<&str> = (0..listed.len()).filter(|place| !removed.contains(place)).map(|place| context.text(listed[place])).collect();
    Fix::replace(listed[0].start_byte(), end, kept.join(", "))
}
