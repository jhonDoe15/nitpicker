//! MockNotUsedInProduction: a mock that is set up and verified but never handed to the code under test.
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::hierarchy::annotation_names;
use super::inject_checks::{annotation_class, annotations_of};
use super::symbol_key::{declared_key, reference_key, SymbolKey};
use super::Context;
use crate::engine::source::{children, parent, walk};
use tree_sitter::Node;

const CHECK: &str = "MockNotUsedInProduction";

struct Mock<'t> {
    reported: Node<'t>,
    at: usize,
    name: String,
    key: SymbolKey,
}

fn mock_call(context: &Context, node: Node) -> bool {
    node.kind() == "method_invocation" && static_on_class(context, node, "org.mockito.Mockito", &["mock", "spy"])
}

/// A field is eligible when it, or a class around it, is private, anonymous or local.
fn effectively_private(context: &Context, declarator: Node, private_member: bool) -> bool {
    if private_member {
        return true;
    }
    let mut current = parent(declarator);
    while let Some(at) = current {
        let is_class = at.kind().ends_with("_declaration") && matches!(at.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration");
        if is_class {
            let own = crate::java::helpers::has_modifier(at, "private");
            let local = parent(at).is_some_and(|holder| matches!(holder.kind(), "block" | "switch_block_statement_group" | "constructor_body"));
            if own || local {
                return true;
            }
        } else if at.kind() == "object_creation_expression" && children(at).iter().any(|part| part.kind() == "class_body") {
            return true;
        }
        current = parent(at);
    }
    false
}

fn only_mock_annotations(context: &Context, holder: Node) -> bool {
    annotation_names(context, holder).iter().all(|name| name.rsplit('.').next() == Some("Mock"))
}

fn annotated(context: &Context, holder: Node, wanted: &[&str]) -> bool {
    annotations_of(holder).into_iter().any(|annotation| annotation_class(context, annotation).is_some_and(|class| wanted.contains(&class.as_str())))
}

fn find_mocks<'t>(context: &Context<'t>) -> Vec<Mock<'t>> {
    let mut mocks: Vec<Mock<'t>> = Vec::new();
    let mut inject = false;
    walk(context.file.tree.root_node(), |part| {
        let (holder, declarator) = match part.kind() {
            "variable_declarator" => (parent(part).filter(|up| matches!(up.kind(), "field_declaration" | "local_variable_declaration" | "constant_declaration")), Some(part)),
            "formal_parameter" => (Some(part), None),
            "assignment_expression" => {
                assignment(context, part, &mut mocks);
                return;
            }
            _ => return,
        };
        let Some(holder) = holder else { return };
        if context.suppressed(CHECK, part) {
            return;
        }
        if annotated(context, holder, &["org.mockito.InjectMocks"]) {
            inject = true;
        }
        let field = holder.kind() == "field_declaration" || holder.kind() == "constant_declaration";
        let private = crate::java::helpers::has_modifier(holder, "private");
        let eligible = (!field || effectively_private(context, part, private)) && only_mock_annotations(context, holder);
        let initialized = declarator.and_then(|declarator| declarator.child_by_field_name("value")).is_some_and(|value| mock_call(context, value));
        if !(eligible && (annotated(context, holder, &["org.mockito.Mock", "org.mockito.Spy"]) || initialized)) {
            return;
        }
        let (Some(key), Some(name)) = (declared_key(context, part), part.child_by_field_name("name")) else { return };
        add(&mut mocks, Mock { reported: part, at: name.start_byte(), name: context.text(name).to_string(), key });
    });
    if inject { Vec::new() } else { mocks }
}

fn add<'t>(mocks: &mut Vec<Mock<'t>>, found: Mock<'t>) {
    match mocks.iter_mut().find(|mock| mock.key == found.key) {
        Some(existing) => *existing = found,
        None => mocks.push(found),
    }
}

fn assignment<'t>(context: &Context<'t>, node: Node<'t>, mocks: &mut Vec<Mock<'t>>) {
    let (Some(left), Some(right), Some(operator)) = (node.child_by_field_name("left"), node.child_by_field_name("right"), node.child_by_field_name("operator")) else { return };
    if context.text(operator) != "=" || !mock_call(context, right) || context.suppressed(CHECK, node) {
        return;
    }
    let Some(key) = reference_key(context, left) else { return };
    let field = super::lookup::field_of(context, left);
    let eligible = match field {
        Some((owner, found)) => found.is_private || owner_effectively_private(context, &owner.name),
        None => matches!(left.kind(), "identifier"),
    };
    if !eligible {
        return;
    }
    let name = context.text(left.child_by_field_name("field").unwrap_or(left)).to_string();
    add(mocks, Mock { reported: node, at: operator.start_byte(), name, key });
}

fn owner_effectively_private(context: &Context, class: &str) -> bool {
    let mut name = class;
    loop {
        let simple = name.rsplit('.').next().unwrap_or(name);
        let info = context.resolver.index.get(name);
        if simple.starts_with(|c: char| c.is_ascii_digit()) || info.is_some_and(|info| info.flags & crate::java::types::model::flag::PRIVATE != 0) {
            return true;
        }
        match name.rsplit_once('.') {
            Some((outer, _)) if context.resolver.index.get(outer).is_some() => name = outer,
            _ => return false,
        }
    }
}

fn when_or_verify(context: &Context, call: Node) -> bool {
    let name = call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    if !matches!(name, "when" | "verify") {
        return false;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return false };
    resolved.method.is_static
        || (name == "when" && context.resolver.index.is_subtype(&if call.child_by_field_name("object").is_some() { resolved.receiver.erased().name() } else { resolved.declaring }, "org.mockito.stubbing.Stubber"))
}

/// Whether an identifier child is a name being declared or selected, not a variable read.
fn names_something(node: Node, child: Node) -> bool {
    let field_is = |field: &str| node.child_by_field_name(field) == Some(child);
    match node.kind() {
        "method_invocation" | "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "enhanced_for_statement" | "resource" | "method_declaration" | "constructor_declaration"
        | "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "enum_constant" => field_is("name"),
        "element_value_pair" => field_is("key"),
        "field_access" => field_is("field"),
        "method_reference" => children(node).last() == Some(&child),
        "labeled_statement" | "break_statement" | "continue_statement" | "inferred_parameters" | "scoped_identifier" | "import_declaration" | "package_declaration" | "lambda_expression" => {
            node.kind() != "lambda_expression" || field_is("parameters")
        }
        _ => false,
    }
}

fn used_nodes<'t>(context: &Context<'t>, node: Node<'t>, out: &mut Vec<Node<'t>>) {
    match node.kind() {
        "identifier" => out.push(node),
        "field_access" => {
            out.push(node);
            if let Some(object) = node.child_by_field_name("object") {
                used_nodes(context, object, out);
            }
        }
        "method_invocation" if when_or_verify(context, node) => {
            if let Some(object) = node.child_by_field_name("object") {
                used_nodes(context, object, out);
            }
        }
        "assignment_expression" if node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=") => {
            if let Some(right) = node.child_by_field_name("right") {
                used_nodes(context, right, out);
            }
        }
        "import_declaration" | "package_declaration" => {}
        _ => {
            for child in children(node) {
                if child.kind() == "identifier" && names_something(node, child) {
                    continue;
                }
                used_nodes(context, child, out);
            }
        }
    }
}

fn deletion<'t>(node: Node<'t>) -> Option<(usize, usize)> {
    let mut current = Some(node);
    while let Some(at) = current {
        match at.kind() {
            "expression_statement" | "formal_parameter" | "spread_parameter" | "catch_formal_parameter" | "resource" => return Some((at.start_byte(), at.end_byte())),
            "variable_declarator" => {
                let holder = parent(at)?;
                let declarators = children(holder).iter().filter(|part| part.kind() == "variable_declarator").count();
                let last = children(holder).into_iter().rev().find(|part| part.kind() == "variable_declarator") == Some(at);
                return Some((holder.start_byte(), if last || declarators <= 1 { holder.end_byte() } else { at.end_byte() }));
            }
            _ => current = parent(at),
        }
    }
    None
}

fn generate_fix(context: &Context, mock: &Mock) -> Fix {
    let mut ranges: Vec<(usize, usize)> = Vec::new();
    let mut uses = Vec::new();
    used_all(context, context.file.tree.root_node(), &mut uses);
    for node in uses {
        let matches = match node.kind() {
            "variable_declarator" | "formal_parameter" => declared_key(context, node).is_some_and(|key| key == mock.key),
            _ => context.text(node.child_by_field_name("field").unwrap_or(node)) == mock.name && reference_key(context, node).is_some_and(|key| key == mock.key),
        };
        if let Some(range) = deletion(node).filter(|_| matches) {
            ranges.push(range);
        }
    }
    ranges.sort();
    let mut merged: Vec<(usize, usize)> = Vec::new();
    for (start, end) in ranges {
        match merged.last_mut() {
            Some(last) if start <= last.1 => last.1 = last.1.max(end),
            _ => merged.push((start, end)),
        }
    }
    merged.into_iter().fold(Fix::new(), |fix, (start, end)| fix.and(start, end, ""))
}

/// Every declaration, name and field access in the file: the trees whose symbol a fix may need to compare.
fn used_all<'t>(context: &Context<'t>, root: Node<'t>, out: &mut Vec<Node<'t>>) {
    walk(root, |part| match part.kind() {
        "identifier" => {
            if parent(part).is_none_or(|up| !names_something(up, part)) {
                out.push(part);
            }
        }
        "field_access" | "variable_declarator" | "formal_parameter" => out.push(part),
        _ => {}
    });
    let _ = context;
}

pub fn mock_not_used_in_production(context: &Context, root: Node) {
    let mocks = find_mocks(context);
    if mocks.is_empty() {
        return;
    }
    let mut seen = Vec::new();
    used_nodes(context, root, &mut seen);
    let mut used = vec![false; mocks.len()];
    for node in seen {
        let text = context.text(node.child_by_field_name("field").unwrap_or(node));
        for (at, mock) in mocks.iter().enumerate() {
            if !used[at] && mock.name == text && reference_key(context, node).is_some_and(|key| key == mock.key) {
                used[at] = true;
            }
        }
    }
    for (mock, used) in mocks.iter().zip(used) {
        if !used {
            let message = "This mock is instantiated and configured, but is never passed to production code. It should be either removed or used.";
            context.report_fixed(CHECK, mock.reported, mock.at, message, &[generate_fix(context, mock)]);
        }
    }
}
