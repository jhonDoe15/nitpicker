//! `no-union-order-dependence`: a result that depends on the order the compiler lists union or intersection
//! members in, or on the text it prints a union as.
use super::member_picks::ordered_pick;
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::{Node, Value};

const RULE: &str = "no-union-order-dependence";
const PICK_MESSAGE: &str = "{form} picks a union or intersection member by its place in the list (for a map, the last entry with the same key wins), and the compiler does not promise that order: TypeScript 6 lists members in the order their types were created, TypeScript 7 sorts them, so the same source gives a different result. Choose by something the source decides (the declaration's file and position, or a name), or compare all members. An exception fits only when every member that can be picked gives the same result.";
const TEXT_MESSAGE: &str = "Comparing `typeToString` text with union text depends on the order the compiler prints union members in, which differs between compiler versions (`A | B` or `B | A`). Compare the types with `checker.isTypeAssignableTo` or by symbol instead.";
const EQUALITY: [&str; 4] = ["===", "!==", "==", "!="];
const UNION_TEXT: &str = " | ";

fn is_type_text(node: Node) -> bool {
    let call = if node.is("ChainExpression") { node.node("expression") } else { Some(node) };
    let Some(call) = call.filter(|call| call.is("CallExpression")) else { return false };
    call.node("callee").is_some_and(|callee| {
        callee.is("MemberExpression")
            && !callee.flag("computed")
            && callee.node("property").is_some_and(|property| property.is("Identifier") && property.name().as_deref() == Some("typeToString"))
    })
}

fn is_union_text(node: Node) -> bool {
    match node.kind() {
        "Literal" => node.text("value").is_some_and(|text| text.contains(UNION_TEXT)),
        "TemplateLiteral" => node.nodes("quasis").into_iter().any(|quasi| match quasi.get("value") {
            Value::Node(index) => quasi.view.at(index).text("cooked").is_some_and(|cooked| cooked.contains(UNION_TEXT)),
            _ => false,
        }),
        _ => false,
    }
}

fn compares_type_text(node: Node) -> bool {
    let (Some(left), Some(right)) = (node.node("left"), node.node("right")) else { return false };
    node.text("operator").is_some_and(|operator| EQUALITY.contains(&&*operator)) && ((is_type_text(left) && is_union_text(right)) || (is_type_text(right) && is_union_text(left)))
}

pub fn check(context: &mut Context) {
    let (Some((view, _)), Some(types)) = (context.estree, context.types) else { return };
    let mut found: Vec<(u32, Option<u32>, String)> = Vec::new();
    for node in view.nodes() {
        match node.kind() {
            "MemberExpression" => {
                let Some(object) = node.node("object").filter(|_| !node.flag("computed")) else { continue };
                if !node.node("property").is_some_and(|property| property.is("Identifier") && property.name().as_deref() == Some("types")) {
                    continue;
                }
                let listed = types.borrow_mut().is_member_list(object.start(), object.end());
                match listed {
                    Some(true) => {}
                    Some(false) => continue,
                    None => {
                        types.borrow_mut().refuse("no type for a members list");
                        return;
                    }
                }
                if let Some(pick) = ordered_pick(context, node) {
                    found.push((pick.node.start(), Some(pick.node.end()), PICK_MESSAGE.replace("{form}", &pick.form)));
                }
            }
            "BinaryExpression" if compares_type_text(node) => found.push((node.start(), Some(node.end()), TEXT_MESSAGE.to_string())),
            _ => {}
        }
        if types.borrow().refused.is_some() {
            return;
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, end, message);
    }
}
