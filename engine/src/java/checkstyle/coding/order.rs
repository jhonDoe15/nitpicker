use super::CODING;
use crate::engine::source::{SourceFile, children};
use crate::java::checkstyle::report::{Report, grouped};
use tree_sitter::Node;

pub fn check(file: &SourceFile, node: Node, report: &mut Report) {
    let mut members: Vec<Node> = match node.kind() {
        "class_body" | "interface_body" | "annotation_type_body" | "enum_body_declarations" => {
            children(node)
        }
        _ => return,
    };
    members.retain(|part| !matches!(part.kind(), "{" | "}" | "line_comment" | "block_comment"));
    if node.kind() == "enum_body_declarations"
        && members.first().is_some_and(|first| first.kind() == ";")
    {
        members.remove(0);
    }
    overloads(file, &members, report);
    constructors(&members, report);
}

fn line(node: Node) -> usize {
    node.start_position().row + 1
}

fn overloads(file: &SourceFile, members: &[Node], report: &mut Report) {
    let name = |member: &Node| {
        (member.kind() == "method_declaration")
            .then(|| member.child_by_field_name("name").map(|n| file.text_of(n)))
            .flatten()
    };
    let mut seen: Vec<(&str, usize)> = Vec::new();
    for (at, member) in members.iter().enumerate() {
        let Some(current) = name(member) else {
            continue;
        };
        let before = at
            .checked_sub(1)
            .and_then(|previous| name(&members[previous]));
        if let Some(known) = seen.iter_mut().find(|(known, _)| *known == current) {
            if before != Some(current) {
                let message = format!(
                    "All overloaded methods should be placed next to each other. Previous overloaded method located at \
                     line '{}'.",
                    grouped(known.1)
                );
                report.node(
                    *member,
                    &format!("{CODING}OverloadMethodsDeclarationOrderCheck"),
                    message,
                );
            }
            known.1 = line(*member);
        } else {
            seen.push((current, line(*member)));
        }
    }
}

fn constructors(members: &[Node], report: &mut Report) {
    let is_constructor = |member: &Node| {
        matches!(
            member.kind(),
            "constructor_declaration" | "compact_constructor_declaration"
        )
    };
    let Some(first) = members.iter().position(is_constructor) else {
        return;
    };
    let last = members[first..]
        .iter()
        .take_while(|member| is_constructor(member))
        .last()
        .copied();
    let Some(last) = last else { return };
    let group = members[first..]
        .iter()
        .take_while(|member| is_constructor(member))
        .count();
    for member in members[first + group..]
        .iter()
        .filter(|member| is_constructor(member))
    {
        let message = format!(
            "Constructors should be grouped together. The last grouped constructor is declared at line '{}'.",
            grouped(line(last))
        );
        report.node(
            *member,
            &format!("{CODING}ConstructorsDeclarationGroupingCheck"),
            message,
        );
    }
}
