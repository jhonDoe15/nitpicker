use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::testing_library::nodes::string_literal;
use std::cmp::Reverse;

const MESSAGE: &str = "Every hover behavior needs a keyboard equivalent. Add a test that tabs to the element (`await user.tab()`) and asserts the same state.";
const HOVER_EVENTS: &[&str] = &["mouseEnter", "mouseOver"];
const KEYBOARD: &str = "keyboard";
const KEYBOARD_ACTIONS: &[&str] = &["tab", KEYBOARD, "focus", "press", "down", "up"];
const KEYBOARD_EVENTS: &[&str] = &["keyDown", "keyUp", "keyPress", "focusIn"];

fn chain_has_keyboard(object: Node) -> bool {
    let mut current = object;
    loop {
        if current.is("Identifier") {
            return current.name().as_deref() == Some(KEYBOARD);
        }
        if !current.is("MemberExpression") {
            return false;
        }
        if !current.flag("computed") && current.node("property").and_then(|property| property.name()).as_deref() == Some(KEYBOARD) {
            return true;
        }
        let Some(next) = current.node("object") else { return false };
        current = next;
    }
}

fn is_fire_event(object: Node) -> bool {
    object.is("Identifier") && object.name().as_deref() == Some("fireEvent")
}

fn has_key(action: Node, name: &str) -> bool {
    action.nodes("properties").into_iter().any(|property| {
        let key = property.node("key").filter(|_| property.is("Property") && !property.flag("computed"));
        let found = key.and_then(|key| if key.is("Identifier") { key.name().map(|name| name.into_owned()) } else { string_literal(Some(key)) });
        found.as_deref() == Some(name)
    })
}

fn is_pointer_hover(call: Node) -> bool {
    let arguments = call.list("arguments");
    let actions = arguments.iter().flatten().flat_map(|argument| if argument.is("ArrayExpression") { argument.list("elements") } else { vec![Some(*argument)] });
    actions.flatten().any(|action| action.is("ObjectExpression") && has_key(action, "target") && !has_key(action, "keys"))
}

/// `/\{[^{}]+\}/`: a brace pair around text without braces.
fn has_key_token(text: &str) -> bool {
    text.split('{').skip(1).any(|rest| rest.find('}').is_some_and(|close| close > 0))
}

fn types_key_tokens(call: Node) -> bool {
    call.list("arguments").into_iter().flatten().any(|argument| {
        if argument.is("Literal") {
            return string_literal(Some(argument)).is_some_and(|text| has_key_token(&text));
        }
        argument.is("TemplateLiteral")
            && argument.nodes("quasis").into_iter().any(|quasi| match quasi.get("value") {
                Value::Node(index) => quasi.view.at(index).text("cooked").is_some_and(|cooked| has_key_token(&cooked)),
                _ => false,
            })
    })
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    if !context.react_test_scope().is_some_and(|scope| scope.inside) {
        return;
    }
    let mut hovers = Vec::new();
    for call in view.nodes().filter(|node| node.is("CallExpression")) {
        let Some(callee) = call.node("callee").filter(|callee| callee.is("MemberExpression") && !callee.flag("computed")) else { continue };
        let (Some(object), Some(name)) = (callee.node("object"), callee.node("property").and_then(|property| property.name())) else { continue };
        let name = name.as_ref();
        if KEYBOARD_ACTIONS.contains(&name) || chain_has_keyboard(object) || (is_fire_event(object) && KEYBOARD_EVENTS.contains(&name)) || (name == "type" && types_key_tokens(call)) {
            return;
        }
        if name == "hover" || (is_fire_event(object) && HOVER_EVENTS.contains(&name)) || (name == "pointer" && is_pointer_hover(call)) {
            hovers.push(call);
        }
    }
    if let Some(first) = hovers.into_iter().min_by_key(|call| (call.start(), Reverse(call.end()))) {
        context.report_range("hover-test-needs-keyboard", first.start(), Some(first.end()), MESSAGE.to_string());
    }
}
