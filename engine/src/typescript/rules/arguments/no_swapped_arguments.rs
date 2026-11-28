//! `no-swapped-arguments`: a call passes an argument named like a different parameter of the project function
//! the compiler resolves the call to.
use super::swapped_names::find_swaps;
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::parse_handle;
use crate::typescript::types::tables::kind;

const RULE: &str = "no-swapped-arguments";

fn message(passed: &str, slot: &str, other: &str, other_slot: &str) -> String {
    format!(
        "`{passed}` is passed as `{slot}` and `{other}` as `{other_slot}`; did you swap them? Pass the arguments in the order of the parameters."
    )
}

fn argument_name(node: Node) -> Option<String> {
    if node.is("Identifier") {
        return node.name().map(|name| name.into_owned());
    }
    let object = node.node("object")?;
    let property = node.node("property")?;
    let plain = node.is("MemberExpression") && !node.flag("computed") && object.is("ThisExpression") && property.is("Identifier");
    plain.then(|| property.name().map(|name| name.into_owned())).flatten()
}

fn given_names(call: Node) -> Vec<Option<String>> {
    call.nodes("arguments").into_iter().take_while(|argument| !argument.is("SpreadElement")).map(argument_name).collect()
}

fn is_recursive(types: &mut Types, call: Node, declaration: &str, file: &str) -> bool {
    let Some((index, _, path)) = parse_handle(declaration) else { return false };
    if path != file {
        return false;
    }
    call.ancestors().any(|ancestor| {
        let handle = types.handle_at(None, ancestor.start(), ancestor.end());
        handle.as_deref().and_then(parse_handle).is_some_and(|(found, _, _)| found == index)
    })
}

fn check_call(types: &mut Types, call: Node, file: &str) -> Vec<String> {
    let given = given_names(call);
    if given.len() < 2 || given.iter().all(Option::is_none) {
        return Vec::new();
    }
    let compiler_kind = if call.is("NewExpression") { kind::NEW_EXPRESSION } else { kind::CALL_EXPRESSION };
    let Some(declaration) = types.resolved_declaration(compiler_kind, call.start(), call.end()) else { return Vec::new() };
    let Some(parameters) = types.leading_parameters(&declaration) else { return Vec::new() };
    let recursive = is_recursive(types, call, &declaration, file);
    let text = |names: &[Option<String>], at: usize| names.get(at).cloned().flatten().unwrap_or_default();
    let slot = |at: usize| parameters.get(at).cloned().unwrap_or_default();
    find_swaps(&parameters, &given, recursive)
        .into_iter()
        .map(|swap| message(&text(&given, swap.index), &slot(swap.index), &text(&given, swap.other), &slot(swap.other)))
        .collect()
}

pub fn check(context: &mut Context) {
    let (Some((view, _)), Some(types)) = (context.estree, context.types) else { return };
    let mut found = Vec::new();
    for call in view.nodes().filter(|node| node.is("CallExpression") || node.is("NewExpression")) {
        let mut types = types.borrow_mut();
        let file = types.file().to_string();
        let messages = check_call(&mut types, call, &file);
        if types.refused.is_some() {
            return;
        }
        found.extend(messages.into_iter().map(|message| (call.start(), call.end(), message)));
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
