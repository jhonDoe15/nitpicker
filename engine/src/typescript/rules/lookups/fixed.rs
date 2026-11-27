//! `collections/fixed-collections.mts`: collections whose size the code fixes (literals, enums, chunks, slices of a
//! constant size), followed through constants and size-keeping calls.
use crate::typescript::rules::fan_out::resolve::{Env, member_name, name_of, skipped};
use crate::typescript::rules::support::scope::DefKind;
use crate::typescript::rules::support::view::{Node, Value};

const CHUNKERS: [&str; 8] = ["chunk", "chunked", "chunks", "splitEvery", "cluster", "batch", "batches", "inGroupsOf"];
const KEEPS_SIZE: [&str; 9] = ["filter", "map", "sort", "toSorted", "reverse", "toReversed", "flat", "fill", "keys"];
const OBJECT_VIEWS: [&str; 3] = ["keys", "values", "entries"];
const SIZES: [&str; 2] = ["length", "size"];
const ARRAY: &str = "Array";
const MAX_DEPTH: usize = 6;

enum Step<'v> {
    Done(bool),
    Next(Vec<Option<Node<'v>>>),
}

fn explicit_size(node: Node) -> bool {
    !node.descendants().into_iter().any(|child| child.is("MemberExpression") && member_name(child).is_some_and(|name| SIZES.contains(&name.as_str())))
}

fn numeric_parts(target: Node) -> Option<Vec<Node>> {
    if target.is("Literal") {
        return matches!(target.get("value"), Value::Number(_)).then(Vec::new);
    }
    if target.is("UnaryExpression") {
        return Some(target.node("argument").into_iter().collect());
    }
    target.is("BinaryExpression").then(|| target.node("left").into_iter().chain(target.node("right")).collect())
}

fn chunker_name(call: Node) -> Option<String> {
    let callee = call.node("callee")?;
    if callee.is("Identifier") {
        return name_of(Some(callee));
    }
    if callee.is("MemberExpression") { member_name(callee) } else { None }
}

fn is_length_property(property: &Node) -> bool {
    property.is("Property") && name_of(property.node("key")).as_deref() == Some("length")
}

fn array_step(target: Node) -> Step {
    let elements = target.list("elements");
    if elements.is_empty() || elements.iter().any(Option::is_none) {
        return Step::Done(false);
    }
    let spreads: Vec<Option<Node>> = elements.into_iter().flatten().filter(|element| element.is("SpreadElement")).map(|element| element.node("argument")).collect();
    if spreads.is_empty() { Step::Done(true) } else { Step::Next(spreads) }
}

pub struct Fixed<'e, 's, 'a, 'v> {
    pub env: &'e Env<'s, 'a, 'v>,
}

impl<'v> Fixed<'_, '_, '_, 'v> {
    fn numeric(&self, node: Node<'v>) -> bool {
        let mut pending = vec![(Some(node), 0)];
        let mut at = 0;
        while at < pending.len() {
            let (node, depth) = pending[at];
            at += 1;
            let target = self.env.resolve_constant(node.map(skipped));
            let parts = target.filter(|_| depth <= MAX_DEPTH).and_then(numeric_parts);
            let Some(parts) = parts else { return false };
            pending.extend(parts.into_iter().map(|part| (Some(part), depth + 1)));
        }
        true
    }

    fn resolved_value(&self, node: Option<Node<'v>>) -> Option<Node<'v>> {
        let mut seen = vec![node.map(skipped)?];
        loop {
            let current = *seen.last()?;
            let next = self.env.resolve_constant(Some(current)).map(skipped);
            if next == Some(current) || next.is_none() || seen.len() >= MAX_DEPTH {
                return next;
            }
            seen.push(next?);
        }
    }

    fn is_enum(&self, identifier: Node<'v>) -> bool {
        self.env.first_def(identifier).is_some_and(|definition| definition.kind == DefKind::Other && definition.node.is("TSEnumDeclaration"))
    }

    fn sized_window(&self, call: Node<'v>) -> bool {
        let arguments = call.nodes("arguments");
        let (first, second) = (arguments.first().copied(), arguments.get(1).copied());
        let slice = call.node("callee").is_some_and(|callee| callee.is("MemberExpression") && member_name(callee).as_deref() == Some("slice"));
        if slice && second.is_none() {
            return first.is_some_and(|first| self.numeric(first));
        }
        second.is_some_and(explicit_size)
    }

    fn sized_by_length(&self, node: Option<Node<'v>>) -> bool {
        let object = node.map(skipped).filter(|object| object.is("ObjectExpression"));
        let length = object.and_then(|object| object.nodes("properties").into_iter().find(is_length_property));
        let value = length.and_then(|length| self.resolved_value(length.node("value")));
        value.is_some_and(explicit_size)
    }

    fn count_of(&self, node: Option<Node<'v>>) -> bool {
        self.resolved_value(node).is_some_and(explicit_size)
    }

    fn is_chunk_call(&self, node: Node<'v>) -> bool {
        let Some(target) = self.env.resolve_constant(Some(skipped(node))).filter(|target| target.is("CallExpression")) else { return false };
        let size = target.nodes("arguments").get(1).copied();
        chunker_name(target).is_some_and(|name| CHUNKERS.contains(&name.as_str())) && size.is_some_and(explicit_size)
    }

    fn is_chunk_variable(&self, identifier: Node<'v>) -> bool {
        let definition = self.env.first_def(identifier).filter(|definition| definition.kind == DefKind::Variable);
        let lp = definition.and_then(|definition| definition.node.parent()).and_then(|declaration| declaration.parent());
        lp.filter(|lp| lp.is("ForOfStatement")).and_then(|lp| lp.node("right")).is_some_and(|right| self.is_chunk_call(right))
    }

    fn fixed_call(&self, call: Node<'v>) -> Step<'v> {
        let callee = call.node("callee");
        let member = callee.filter(|callee| callee.is("MemberExpression"));
        let name = match member {
            Some(member) => member_name(member),
            None => name_of(callee),
        };
        let owner = member.and_then(|member| member.node("object")).map(skipped);
        let name = name.unwrap_or_default();
        let arguments = call.list("arguments");
        let first = arguments.first().copied().flatten();
        if name == "slice" || name == "splice" {
            return Step::Done(self.sized_window(call));
        }
        if name_of(owner).as_deref() == Some("Object") && OBJECT_VIEWS.contains(&name.as_str()) {
            return Step::Next(vec![first]);
        }
        if name_of(owner).as_deref() == Some(ARRAY) && name == "from" {
            return Step::Done(self.sized_by_length(first));
        }
        if name == ARRAY && arguments.len() == 1 {
            return Step::Done(self.count_of(first));
        }
        if KEEPS_SIZE.contains(&name.as_str()) && owner.is_some() { Step::Next(vec![owner]) } else { Step::Done(false) }
    }

    fn fixed_step(&self, target: Node<'v>) -> Step<'v> {
        if target.is("ArrayExpression") {
            return array_step(target);
        }
        if target.is("ObjectExpression") {
            let properties = target.nodes("properties");
            return Step::Done(!properties.is_empty() && properties.iter().all(|property| property.is("Property")));
        }
        if target.is("CallExpression") {
            return self.fixed_call(target);
        }
        if target.is("NewExpression") {
            let arguments = target.list("arguments");
            return Step::Done(name_of(target.node("callee")).as_deref() == Some(ARRAY) && arguments.len() == 1 && self.count_of(arguments[0]));
        }
        Step::Done(target.is("Identifier") && (self.is_enum(target) || self.is_chunk_variable(target)))
    }

    /// `isFixedCollection`.
    pub fn is_fixed(&self, node: Node<'v>) -> bool {
        let mut pending = vec![(Some(node), 0)];
        let mut at = 0;
        while at < pending.len() {
            let (node, depth) = pending[at].clone();
            at += 1;
            let target = self.resolved_value(node).filter(|_| depth <= MAX_DEPTH);
            match target.map(|target| self.fixed_step(target)) {
                None | Some(Step::Done(false)) => return false,
                Some(Step::Done(true)) => {}
                Some(Step::Next(next)) => pending.extend(next.into_iter().map(|next| (next, depth + 1))),
            }
        }
        true
    }
}
