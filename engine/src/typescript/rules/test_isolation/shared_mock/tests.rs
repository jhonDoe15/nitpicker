//! `enclosingTests` of `no-uncleared-shared-mock`: the tests a use of a mock runs in, directly, through a shared
//! setup hook, or through a top-level helper a test calls by name.
use super::declared::FUNCTIONS;
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::{Node, View};
use crate::typescript::rules::test_quality::test_calls::callback_owner;
use crate::typescript::with_tokens;
use oxc_parser::Kind;
use std::collections::HashSet;

const SHARED_SETUP_HOOKS: [&str; 2] = ["beforeEach", "beforeAll"];
/// Words typescript-estree gives as `Keyword`, `Boolean` or `Null` tokens even where they name something.
const KEYWORDS: [&str; 36] = [
    "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "enum", "export",
    "extends", "false", "finally", "for", "function", "if", "import", "in", "instanceof", "new", "null", "return", "super",
    "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with",
];
/// Words typescript-estree gives as `Identifier` tokens only where they are a name.
const FUTURE_RESERVED: [&str; 9] = ["implements", "interface", "let", "package", "private", "protected", "public", "static", "yield"];

pub struct TestCall<'v> {
    pub call: Node<'v>,
    pub body: Node<'v>,
}

fn hook_call(node: Node) -> Option<Node> {
    let owner = callback_owner(Some(node).filter(|node| FUNCTIONS.contains(&node.kind())))?;
    let callee = owner.node("callee").filter(|callee| callee.is("Identifier"))?;
    callee.name().is_some_and(|name| SHARED_SETUP_HOOKS.contains(&name.as_ref())).then_some(owner)
}

fn container_of(call: Node) -> Option<Node> {
    call.parent().and_then(|parent| parent.parent()).filter(|container| container.is("Program") || container.is("BlockStatement"))
}

fn top_level_function_name(node: Node) -> Option<String> {
    let outer = node.ancestors().filter(|ancestor| FUNCTIONS.contains(&ancestor.kind())).last()?;
    if outer.is("FunctionDeclaration") && outer.parent().is_some_and(|parent| parent.is("Program")) {
        return outer.node("id").and_then(|id| id.name()).map(|name| name.into_owned());
    }
    let holder = outer.parent().filter(|holder| holder.is("VariableDeclarator"))?;
    let id = holder.node("id").filter(|id| id.is("Identifier"))?;
    let at_top = holder.parent().and_then(|declaration| declaration.parent()).is_some_and(|parent| parent.is("Program"));
    at_top.then(|| id.name().map(|name| name.into_owned())).flatten()
}

/// The start offsets of `Identifier` tokens, as typescript-estree types them, for the names helpers are called by.
pub struct IdentifierTokens {
    starts: Option<Vec<(u32, String)>>,
}

impl IdentifierTokens {
    pub fn new() -> IdentifierTokens {
        IdentifierTokens { starts: None }
    }

    fn lexed(&mut self, context: &Context, view: &View) -> &[(u32, String)] {
        self.starts.get_or_insert_with(|| {
            let jsx: HashSet<u32> = view.nodes().filter(|node| node.is("JSXIdentifier")).map(|node| node.start()).collect();
            let identifiers: HashSet<u32> = view.nodes().filter(|node| node.is("Identifier")).map(|node| node.start()).collect();
            with_tokens(context.file.path, context.file.text, |file| {
                file.tokens
                    .iter()
                    .filter(|token| token.kind() == Kind::Ident || token.kind().is_any_keyword())
                    .filter(|token| !jsx.contains(&token.start()))
                    .map(|token| (token.start(), file.slice(token.start(), token.end()).to_string()))
                    .filter(|(start, text)| {
                        !KEYWORDS.contains(&text.as_str()) && (!FUTURE_RESERVED.contains(&text.as_str()) || identifiers.contains(start))
                    })
                    .collect()
            })
        })
    }

    /// `callsNamed`: whether an `Identifier` token of the test body has the name.
    fn calls_named(&mut self, context: &Context, view: &View, test: &TestCall, name: &str) -> bool {
        let (start, end) = (test.body.start(), test.body.end());
        self.lexed(context, view).iter().any(|(at, text)| start <= *at && *at < end && text == name)
    }
}

/// `enclosingTests`, as indexes into `tests`.
pub fn enclosing_tests(context: &Context, view: &View, tokens: &mut IdentifierTokens, tests: &[TestCall], node: Node) -> Vec<usize> {
    let direct: Vec<usize> = (0..tests.len()).filter(|at| tests[*at].body.contains(node)).collect();
    if let Some(last) = direct.last() {
        return vec![*last];
    }
    let hook = node.ancestors().find_map(hook_call);
    if let Some(container) = hook.and_then(container_of) {
        return (0..tests.len()).filter(|at| container.contains(tests[*at].call)).collect();
    }
    let Some(helper) = top_level_function_name(node) else { return Vec::new() };
    (0..tests.len()).filter(|at| tokens.calls_named(context, view, &tests[*at], &helper)).collect()
}
