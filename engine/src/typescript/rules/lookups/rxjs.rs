//! `rxjs-calls.mts`: the RxJS name a callee stands for, unlimited concurrency arguments, and the collection an
//! operator's pipe starts from (`from(list)`, `of(...list)`), unless an operator before it groups the elements.
use crate::typescript::rules::fan_out::resolve::{Env, is_function_node, member_name, name_of, skipped};
use crate::typescript::rules::support::scope::DefKind;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use std::cell::RefCell;

const RXJS_MODULES: [&str; 2] = ["rxjs", "rxjs/operators"];
const ARRAY_RESULTS: [&str; 14] =
    ["map", "filter", "flatMap", "flat", "slice", "concat", "toSorted", "toReversed", "sort", "reverse", "keys", "values", "entries", "from"];
const GROUPS: [&str; 20] = [
    "bufferCount", "bufferTime", "buffer", "bufferToggle", "bufferWhen", "toArray", "windowCount", "windowTime", "reduce", "first", "last",
    "single", "count", "min", "max", "every", "isEmpty", "find", "findIndex", "elementAt",
];
const WINDOWS: [&str; 2] = ["take", "takeLast"];
const SIZES: [&str; 2] = ["length", "size"];
const MAX_DEPTH: usize = 4;
const NAMESPACE: &str = "*";

enum Piped<'v> {
    Grouped,
    Source(Option<Node<'v>>),
}

pub struct Rxjs<'e, 's, 'a, 'v> {
    pub env: &'e Env<'s, 'a, 'v>,
    pub types: &'e RefCell<Types>,
}

impl<'v> Rxjs<'_, '_, '_, 'v> {
    fn binding_of(&self, identifier: Node<'v>) -> Option<String> {
        let definition = self.env.single_def(identifier).filter(|definition| definition.kind == DefKind::ImportBinding)?;
        let declaration = definition.node.parent().filter(|parent| parent.is("ImportDeclaration"))?;
        let source = declaration.node("source").and_then(|source| source.text("value"))?;
        if !RXJS_MODULES.contains(&source.as_ref()) {
            return None;
        }
        let specifier = definition.node;
        if specifier.is("ImportNamespaceSpecifier") {
            return Some(NAMESPACE.to_string());
        }
        if specifier.is("ImportSpecifier") { name_of(specifier.node("imported")) } else { None }
    }

    /// `rxjsName`.
    pub fn name(&self, callee: Node<'v>) -> Option<String> {
        let target = skipped(callee);
        if target.is("Identifier") {
            return self.binding_of(target).filter(|name| name != NAMESPACE);
        }
        if !target.is("MemberExpression") {
            return None;
        }
        let namespace = skipped(target.node("object")?);
        let imported = namespace.is("Identifier") && self.binding_of(namespace).as_deref() == Some(NAMESPACE);
        if imported { member_name(target) } else { None }
    }

    fn is_selector(&self, node: Node<'v>) -> bool {
        let target = skipped(node);
        is_function_node(target) || self.env.resolve_function(Some(target)).is_some()
    }

    fn is_undefined(&self, node: Node<'v>) -> bool {
        node.is("Identifier") && node.name().as_deref() == Some("undefined") && self.env.undeclared(node, "undefined")
    }

    /// `isUnlimited`: no argument, a selector function, `Infinity`, `undefined` or a constant that is infinite.
    pub fn is_unlimited(&self, node: Node<'v>) -> bool {
        if self.is_selector(node) {
            return true;
        }
        let Some(target) = self.env.resolve_constant(Some(skipped(node))).map(skipped) else { return false };
        let infinite = (target.is("Identifier") && target.name().as_deref() == Some("Infinity") && self.env.undeclared(target, "Infinity"))
            || (target.is("MemberExpression") && member_name(target).as_deref() == Some("POSITIVE_INFINITY"));
        infinite || self.is_undefined(target) || self.env.constant_number(Some(node)) == Some(f64::INFINITY)
    }

    fn is_collection(&self, node: Node<'v>) -> bool {
        let typed = self.types.borrow_mut().reactive_collection(node.start(), node.end());
        if let Some(typed) = typed {
            return typed;
        }
        let Some(target) = self.env.resolve_constant(Some(skipped(node))).map(skipped) else { return false };
        if target.is("ArrayExpression") {
            return true;
        }
        if target.is("CallExpression") {
            let callee = target.node("callee").map(skipped);
            return callee.is_some_and(|callee| callee.is("MemberExpression") && member_name(callee).is_some_and(|name| ARRAY_RESULTS.contains(&name.as_str())));
        }
        target.is("Identifier") || target.is("MemberExpression")
    }

    fn creation_source(&self, call: Node<'v>) -> Option<Node<'v>> {
        let name = self.name(call.node("callee")?);
        let arguments = call.nodes("arguments");
        let first = *arguments.first()?;
        if name.as_deref() == Some("from") && arguments.len() == 1 && self.is_collection(first) {
            return Some(first);
        }
        let spread = arguments.len() == 1 && first.is("SpreadElement");
        if name.as_deref() == Some("of") && spread { first.node("argument") } else { None }
    }

    fn groups(&self, operator: Node<'v>) -> bool {
        let name = operator.node("callee").and_then(|callee| self.name(callee)).unwrap_or_default();
        if WINDOWS.contains(&name.as_str()) {
            let arguments = operator.nodes("arguments");
            let reads_size = |node: &Node| node.descendants().into_iter().any(|child| child.is("MemberExpression") && member_name(child).is_some_and(|name| SIZES.contains(&name.as_str())));
            return !arguments.is_empty() && !arguments.iter().any(reads_size);
        }
        GROUPS.contains(&name.as_str())
    }

    fn piped(&self, call: Node<'v>, before: Option<usize>) -> Option<Piped<'v>> {
        let callee = skipped(call.node("callee")?);
        if !callee.is("MemberExpression") || member_name(callee).as_deref() != Some("pipe") {
            return None;
        }
        let arguments = call.nodes("arguments");
        let operators = &arguments[..before.unwrap_or(arguments.len()).min(arguments.len())];
        let grouped = operators.iter().any(|operator| operator.is("CallExpression") && self.groups(*operator));
        Some(if grouped { Piped::Grouped } else { Piped::Source(callee.node("object")) })
    }

    fn upstream(&self, first: Option<Piped<'v>>) -> Option<Node<'v>> {
        let mut step = first;
        for depth in 1.. {
            let source = match step {
                Some(Piped::Source(source)) if depth <= MAX_DEPTH => source,
                _ => return None,
            };
            let target = self.env.resolve_constant(source.map(skipped)).map(skipped);
            let call = target.filter(|target| target.is("CallExpression"))?;
            if let Some(collection) = self.creation_source(call) {
                return Some(collection);
            }
            step = self.piped(call, None);
        }
        None
    }

    /// `pipeSource`: the collection the pipe of an operator starts from.
    pub fn pipe_source(&self, operator: Node<'v>) -> Option<Node<'v>> {
        let pipe = operator.parent().filter(|pipe| pipe.is("CallExpression"))?;
        let index = pipe.nodes("arguments").iter().position(|argument| *argument == operator)?;
        self.upstream(self.piped(pipe, Some(index)))
    }
}
