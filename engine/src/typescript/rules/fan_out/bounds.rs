//! `bounds.mts`: whether a call runs through a limiter (a p-limit function, a queue, a semaphore) that the code
//! received or created outside the function, and whether a function acquires one.
use super::origins::{Origin, Origins};
use super::resolve::{Env, member_name, name_of, path_up, skipped};
use super::specs::limiter_spec;
use super::io::Invocation;
use crate::typescript::rules::support::scope::DefKind;
use crate::typescript::rules::support::view::Node;

const LIMITER_NAMES: [&str; 8] = ["limit", "limiter", "queue", "sema", "semaphore", "throttle", "throttler", "mutex"];
const ACQUIRES: [&str; 3] = ["acquire", "removeTokens", "runExclusive"];

pub struct Bounds<'s, 'a, 'v> {
    origins: Origins<'s, 'a, 'v>,
}

fn holder_of(callee: Node) -> Node {
    let target = skipped(callee);
    if !target.is("MemberExpression") {
        return target;
    }
    let Some(object) = target.node("object").map(skipped) else { return target };
    if object.is("ThisExpression") { target } else { object }
}

fn is_this_member(node: Node) -> bool {
    node.is("MemberExpression") && node.node("object").is_some_and(|object| skipped(object).is("ThisExpression"))
}

impl<'s, 'a, 'v> Bounds<'s, 'a, 'v> {
    /// `createBounds`.
    pub fn of(env: Env<'s, 'a, 'v>, program: Node<'v>) -> Self {
        Bounds { origins: Origins::of(env, program, limiter_spec) }
    }

    fn env(&self) -> &Env<'s, 'a, 'v> {
        &self.origins.env
    }

    fn is_parameter(&self, identifier: Node<'v>) -> bool {
        let Some(name) = identifier.name() else { return false };
        self.env().defs(identifier, &name).is_some_and(|defs| defs.iter().any(|definition| definition.kind == DefKind::Parameter))
    }

    fn is_imported_limiter(&self, identifier: Node<'v>) -> bool {
        let Some(name) = identifier.name() else { return false };
        let definition = self.env().first_def(identifier);
        let declaration = definition.as_ref().and_then(|definition| definition.node.parent().filter(|parent| definition.kind == DefKind::ImportBinding && parent.is("ImportDeclaration")));
        let source = declaration.and_then(|declaration| declaration.node("source")).and_then(|source| source.text("value")).unwrap_or_default();
        let lower = name.to_lowercase().replace('ſ', "s");
        (source.starts_with('.') || source.starts_with('/')) && LIMITER_NAMES.iter().any(|suffix| lower.ends_with(suffix))
    }

    fn received_field(&self, member: Node<'v>) -> bool {
        let key = member_name(member);
        let Some(body) = member.ancestors().find(|ancestor| ancestor.is("ClassBody")) else { return false };
        body.descendants().into_iter().any(|node| {
            if node.is("TSParameterProperty") {
                return name_of(node.node("parameter")) == key;
            }
            let (Some(left), Some(right)) = (node.node("left"), node.node("right")) else { return false };
            node.is("AssignmentExpression") && is_this_member(left) && member_name(left) == key && right.is("Identifier") && self.is_parameter(right)
        })
    }

    fn received(&self, holder: Node<'v>) -> bool {
        if holder.is("Identifier") {
            return self.is_parameter(holder) || self.is_imported_limiter(holder);
        }
        is_this_member(holder) && self.received_field(holder)
    }

    /// `limiterAt`: the callee's holder is a received limiter, or a limiter instance created outside `root` with a
    /// valid limit.
    pub fn limiter_at(&self, callee: Node<'v>, root: Node<'v>) -> bool {
        let holder = holder_of(callee);
        if self.received(holder) {
            return true;
        }
        let Some(Origin::Instance { spec, creation, .. }) = self.origins.origin_of(holder) else { return false };
        match creation {
            None => true,
            Some(creation) => !path_up(creation).contains(&root) && spec.valid.is_some_and(|valid| valid(Some(creation))),
        }
    }

    /// `wrapsInFunction`: a call inside a callback of a limiter call between it and `root`.
    pub fn wraps_in_function(&self, call: &Invocation<'v>, root: Node<'v>) -> bool {
        let path: Vec<Node<'v>> = call.parent().map(path_up).unwrap_or_default();
        let inside = match path.iter().position(|node| *node == root) {
            Some(index) => &path[..index],
            None => &path[..],
        };
        let Some(start) = inside.iter().position(|node| node.kind().contains("Function")) else { return false };
        inside[start..].iter().any(|node| node.is("CallExpression") && node.node("callee").is_some_and(|callee| self.limiter_at(callee, root)))
    }

    /// `acquiresIn`: the function calls `acquire`, `removeTokens` or `runExclusive` on a limiter.
    pub fn acquires_in(&self, function: Node<'v>) -> bool {
        let Some(body) = function.node("body") else { return false };
        body.descendants().into_iter().any(|node| {
            let callee = node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("MemberExpression"));
            callee.is_some_and(|callee| member_name(callee).is_some_and(|name| ACQUIRES.contains(&name.as_str())) && self.limiter_at(callee, function))
        })
    }
}
