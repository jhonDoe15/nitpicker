//! PatternMatchingInstanceof: an `instanceof` followed by casts of the same value that a pattern variable can replace.
use super::Context;
use super::already_pure::Constants;
use super::fixes::Fix;
use super::idents::all_idents;
use super::naming::fix_initialisms;
use super::nodes::position;
use super::reach::can_complete_normally;
use crate::engine::source::{named_children, parent, walk};
use crate::java::helpers::declarators;
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

const KEYWORDS: [&str; 54] = [
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "default", "do", "double", "else",
    "enum", "extends", "final", "finally", "float", "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long",
    "native", "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized",
    "this", "throw", "throws", "transient", "try", "void", "volatile", "while", "true", "false", "null", "_",
];

fn operator<'c>(context: &'c Context, node: Node) -> &'c str {
    node.child_by_field_name("operator").map_or("", |operator| context.text(operator))
}

/// The code that runs only when the `instanceof` is true, as Error Prone's `findImpliedStatements` collects it.
fn implied<'t>(context: &Context, instanceof: Node<'t>) -> Vec<Node<'t>> {
    let mut found = Vec::new();
    let mut last = instanceof;
    let mut negated = false;
    let mut current = parent(instanceof);
    while let Some(at) = current {
        match at.kind() {
            "binary_expression" if matches!(operator(context, at), "&&" | "||") => {
                if negated == (operator(context, at) == "&&") {
                    return found;
                }
                if at.child_by_field_name("left").is_some_and(|left| left.id() == last.id()) {
                    found.extend(at.child_by_field_name("right"));
                }
            }
            "parenthesized_expression" => {}
            "unary_expression" if operator(context, at) == "!" => negated = !negated,
            "if_statement" => {
                if at.child_by_field_name("condition").is_none_or(|condition| condition.id() != last.id()) {
                    return found;
                }
                let (positive, negative) = if negated { ("alternative", "consequence") } else { ("consequence", "alternative") };
                found.extend(at.child_by_field_name(positive));
                if let Some(other) = at.child_by_field_name(negative) {
                    if !can_complete_normally(context, other) {
                        if let Some(block) = parent(at).filter(|block| matches!(block.kind(), "block" | "constructor_body")) {
                            let statements: Vec<Node> = named_children(block).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
                            if let Some(index) = statements.iter().position(|statement| statement.id() == at.id()) {
                                found.extend(statements[index + 1..].iter().copied());
                            }
                        }
                    }
                }
                return found;
            }
            "ternary_expression" => {
                found.extend(at.child_by_field_name(if negated { "alternative" } else { "consequence" }));
                return found;
            }
            _ => return found,
        }
        last = at;
        current = parent(at);
    }
    found
}

/// Whether the parentheses around a cast stay when the cast is replaced by a name.
fn keeps_parentheses(parens: Node) -> bool {
    let Some(above) = parent(parens) else { return true };
    !matches!(above.kind(), "field_access" | "method_invocation" | "array_access" | "parenthesized_expression" | "object_creation_expression" | "method_reference" | "argument_list")
}

fn usage(cast: Node) -> Node {
    match parent(cast) {
        Some(parens) if parens.kind() == "parenthesized_expression" && !keeps_parentheses(parens) => parens,
        _ => cast,
    }
}

fn is_raw(context: &Context, kind: &Type) -> bool {
    match kind {
        Type::Class(name, arguments) => arguments.is_empty() && context.resolver.index.get(name).is_some_and(|info| !info.type_parameters.is_empty()),
        _ => false,
    }
}

/// For a written type of an inner class of a generic class, the outer class's type arguments as javac reads them:
/// none for `Outer.Inner` or `Inner` outside `Outer`, the written ones for `Outer<..>.Inner`, and `Outer`'s own
/// type variables for `Inner` inside `Outer`.
fn outer_arguments(context: &Context, written: Node) -> Option<String> {
    let index = context.resolver.index;
    let Some(Type::Class(name, _)) = context.resolver.type_node(written) else { return None };
    let info = index.get(&name)?;
    if info.flags & (flag::STATIC | flag::ENUM | flag::RECORD) != 0 || info.is_interface {
        return None;
    }
    let (outer, simple) = name.rsplit_once(['.', '$'])?;
    let owner = index.get(outer).filter(|owner| !owner.type_parameters.is_empty() && !owner.is_interface)?;
    let own = || format!("<{}>", owner.type_parameters.iter().map(|(variable, _)| variable.as_str()).collect::<Vec<_>>().join(","));
    match written.kind() {
        "scoped_type_identifier" => {
            let scope = written.named_child(0)?;
            let arguments = scope.child_by_field_name("type_arguments").or_else(|| named_children(scope).into_iter().find(|part| part.kind() == "type_arguments"));
            Some(arguments.map_or(String::new(), |arguments| context.text(arguments).split_whitespace().collect()))
        }
        "type_identifier" if context.text(written) == simple => {
            let short = owner.name.rsplit(['.', '$']).next().unwrap_or_default();
            let inside = std::iter::successors(parent(written), |at| parent(*at))
                .any(|at| at.kind() == "class_declaration" && at.child_by_field_name("name").is_some_and(|named| context.text(named) == short));
            Some(if inside { own() } else { String::new() })
        }
        _ => None,
    }
}

fn variable_type(context: &Context, declaration: Node, declarator: Node) -> Option<Type> {
    let written = declaration.child_by_field_name("type")?;
    if context.text(written) == "var" {
        return context.resolver.type_of(declarator.child_by_field_name("value")?);
    }
    context.resolver.declared_type(declaration, Some(declarator))
}

/// The local a cast is assigned to on its own: `Foo foo = (Foo) o;` with the type the `instanceof` names, as the
/// declarator and the range javac's variable tree covers.
fn assigned_local<'t>(context: &Context, used: Node<'t>, target: &Type) -> Option<(Node<'t>, usize, usize)> {
    let mut above = parent(used)?;
    while above.kind() == "parenthesized_expression" {
        above = parent(above)?;
    }
    if above.kind() != "variable_declarator" {
        return None;
    }
    let declaration = parent(above).filter(|declaration| declaration.kind() == "local_variable_declaration")?;
    let all = declarators(declaration);
    let range = if all.len() == 1 {
        (declaration.start_byte(), declaration.end_byte())
    } else if all.first().is_some_and(|first| first.id() == above.id()) {
        (declaration.start_byte(), above.end_byte())
    } else {
        (above.start_byte(), above.end_byte())
    };
    (variable_type(context, declaration, above).as_ref() == Some(target)).then_some((above, range.0, range.1))
}

/// The simple name of a class, without the number javac puts before the name of a local class.
fn simple_name(name: &str) -> &str {
    name.rsplit(['.', '$']).next().unwrap_or(name).trim_start_matches(|character: char| character.is_ascii_digit())
}

fn variable_name(context: &Context, instanceof: Node, target: &Type) -> String {
    let simple = if matches!(target, Type::Array(_)) { "Array".to_string() } else { fix_initialisms(simple_name(&target.name())) };
    let mut chars = simple.chars();
    let first = chars.next().map(|first| first.to_ascii_lowercase().to_string()).unwrap_or_default();
    let camel = format!("{first}{}", chars.as_str());
    let boxed = matches!(target, Type::Class(..)) && !matches!(target.clone().unboxed_or_same(), Type::Class(..));
    let wanted = if KEYWORDS.contains(&camel.as_str()) || boxed { first } else { camel };
    let taken = all_idents(context, instanceof);
    (1..).map(|number| if number == 1 { wanted.clone() } else { format!("{wanted}{number}") }).find(|name| !taken.contains(name)).unwrap_or(wanted)
}

pub fn pattern_matching_instanceof(context: &Context, node: Node) {
    if node.kind() != "instanceof_expression" || context.resolver.index.source_level < 16 {
        return;
    }
    if node.child_by_field_name("name").is_some() || node.child_by_field_name("pattern").is_some() {
        return;
    }
    let (Some(value), Some(written)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    if written.kind() == "generic_type" {
        return;
    }
    let trees = implied(context, node);
    if trees.is_empty() {
        return;
    }
    let constants = Constants::new(context);
    let Some(constant) = constants.expression(value) else { return };
    let Some(target) = context.resolver.type_node(written) else { return };
    let mut casts: Vec<Node> = Vec::new();
    for tree in &trees {
        walk(*tree, |inner| {
            if inner.kind() != "cast_expression" {
                return;
            }
            let (Some(kind), Some(castee)) = (inner.child_by_field_name("type"), inner.child_by_field_name("value")) else { return };
            if constants.expression(castee).is_some_and(|found| found.key == constant.key) && context.resolver.type_node(kind).as_ref() == Some(&target)
                && outer_arguments(context, kind) == outer_arguments(context, written)
            {
                let used = usage(inner);
                if !casts.iter().any(|seen| seen.id() == used.id()) {
                    casts.push(used);
                }
            }
        });
    }
    let parameters = match &target {
        Type::Class(name, _) => context.resolver.index.get(name).map_or(0, |info| info.type_parameters.len()),
        _ => 0,
    };
    if parameters != 0 && casts.iter().any(|cast| super::targets::target_type(context, *cast).is_some_and(|kind| !is_raw(context, &kind))) {
        return;
    }
    let mut fix = Fix::new();
    let mut name = None;
    if let Some(at) = casts.iter().position(|cast| assigned_local(context, *cast, &target).is_some()) {
        let (declarator, start, end) = assigned_local(context, casts[at], &target).unwrap();
        fix = fix.delete(start, end);
        name = declarator.child_by_field_name("name").map(|named| context.text(named).to_string());
        casts.remove(at);
    }
    if casts.is_empty() && fix.is_empty() {
        return;
    }
    let name = name.unwrap_or_else(|| variable_name(context, node, &target));
    if parameters != 0 && written.kind() != "generic_type" {
        fix = fix.insert(written.end_byte(), format!("<{}>", vec!["?"; parameters].join(",")));
    }
    fix = fix.insert(node.end_byte(), format!(" {name}"));
    for cast in &casts {
        fix = fix.and(cast.start_byte(), cast.end_byte(), name.clone());
    }
    context.report_fixed("PatternMatchingInstanceof", node, position(node), "This code can be simplified to use a pattern-matching instanceof.", &[fix]);
}
