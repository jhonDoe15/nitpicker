//! `io-origin.mts` and `origins/module-refs.mts`: where the value an expression names comes from, followed back
//! through variables, fields, members and calls to a module of a client spec or an instance one of its makers made.
use super::resolve::{Env, member_name, name_of, skipped};
use super::specs::{ClientSpec, Entry, Ref, SpecOf, annotation_of, module_entries, type_imports, type_name};
use crate::typescript::rules::support::scope::DefKind;
use crate::typescript::rules::support::view::Node;
use std::collections::HashMap;
use std::rc::Rc;

const MAX_DEPTH: i32 = 6;
const DEFAULT: &str = "default";

#[derive(Clone)]
pub enum Origin<'v> {
    Module { reference: Ref, spec: Rc<ClientSpec>, member: Option<String> },
    Instance { spec: Rc<ClientSpec>, creation: Option<Node<'v>> },
}

impl Origin<'_> {
    pub fn spec(&self) -> &ClientSpec {
        match self {
            Origin::Module { spec, .. } | Origin::Instance { spec, .. } => spec,
        }
    }
}

pub struct Origins<'s, 'a, 'v> {
    pub env: Env<'s, 'a, 'v>,
    spec_of: SpecOf,
    entries: Vec<Entry>,
    type_imports: HashMap<String, Ref>,
}

#[derive(Clone, Copy)]
enum Combine<'v> {
    First,
    Same,
    MemberOf(Node<'v>),
    MadeBy(Node<'v>, Node<'v>),
    AnyDefined,
}

struct Goal<'v> {
    node: Option<Node<'v>>,
    depth: i32,
    value: Option<Origin<'v>>,
    children: Vec<usize>,
    combine: Combine<'v>,
}

fn goal_for<'v>(depth: i32, node: Option<Node<'v>>, value: Option<Origin<'v>>) -> Goal<'v> {
    Goal { node, depth: depth + 1, value, children: Vec::new(), combine: Combine::First }
}

fn class_of(node: Node) -> Option<Node> {
    node.ancestors().find(|ancestor| ancestor.is("ClassBody"))?.parent()
}

impl<'s, 'a, 'v> Origins<'s, 'a, 'v> {
    /// `createOrigins`.
    pub fn of(env: Env<'s, 'a, 'v>, program: Node<'v>, spec_of: SpecOf) -> Self {
        Origins { env, spec_of, entries: module_entries(program, spec_of), type_imports: type_imports(program, spec_of) }
    }

    /// `moduleRef`: the import a name stands for, unless a parameter of that name is in scope.
    pub fn module_ref(&self, scope_node: Node<'v>, name: &str) -> Option<Ref> {
        let local = self.env.defs(scope_node, name).is_some_and(|defs| defs.iter().any(|definition| definition.kind == DefKind::Parameter));
        if local {
            return None;
        }
        self.entries.iter().find_map(|entry| {
            let imported = entry.named.get(name).cloned().or_else(|| entry.namespaces.contains(name).then(|| DEFAULT.to_string()))?;
            Some(Ref { source: entry.source.clone(), imported: Some(imported) })
        })
    }

    fn spec(&self, source: &str) -> Option<Rc<ClientSpec>> {
        (self.spec_of)(source).map(Rc::new)
    }

    fn instance(&self, spec: Rc<ClientSpec>, creation: Option<Node<'v>>) -> Origin<'v> {
        Origin::Instance { spec, creation }
    }

    fn type_origin(&self, annotation: Option<Node<'v>>) -> Option<Origin<'v>> {
        let (owner, name) = type_name(annotation)?;
        let key = owner.clone().or_else(|| name.clone()).unwrap_or_default();
        let reference = self.type_imports.get(&key)?;
        let spec = self.spec(&reference.source)?;
        let wanted = if owner.is_none() { reference.imported.clone() } else { name };
        spec.matches_type(wanted.as_deref()).then(|| self.instance(spec, None))
    }

    fn parameter_origin(&self, name: Node<'v>) -> Option<Origin<'v>> {
        let parameter = if name.is("AssignmentPattern") { name.node("left")? } else { name };
        let typed = name.is("Identifier") || name.is("AssignmentPattern");
        self.type_origin(if typed { annotation_of(parameter) } else { None })
    }

    fn made_by(&self, target: Node<'v>, call: Node<'v>, base: Option<Origin<'v>>) -> Option<Origin<'v>> {
        if let Some(Origin::Instance { spec, .. }) = &base {
            let name = if target.is("MemberExpression") { member_name(target) } else { None };
            return name.filter(|name| spec.derivers.contains(&name.as_str())).and(base);
        }
        let identifier = target.is("Identifier");
        let reference = if identifier {
            self.module_ref(target, &target.name()?)
        } else {
            match base {
                Some(Origin::Module { reference, .. }) => Some(reference),
                _ => None,
            }
        }?;
        let member = if target.is("MemberExpression") { member_name(target) } else { None };
        let name = if identifier { reference.imported.clone() } else { member };
        let spec = self.spec(&reference.source)?;
        let default = reference.imported.as_deref() == Some(DEFAULT) && identifier;
        (spec.matches_maker(name.as_deref()) || (default && spec.makers.contains(&DEFAULT))).then(|| self.instance(spec, Some(call)))
    }

    fn injected(&self, call: Node<'v>, target: Node<'v>) -> Option<Origin<'v>> {
        let definition = self.env.first_def(target)?;
        let declaration = definition.node.parent().filter(|parent| definition.kind == DefKind::ImportBinding && parent.is("ImportDeclaration"))?;
        let angular = declaration.node("source").and_then(|source| source.text("value"))?;
        let token = call.nodes("arguments").into_iter().next().filter(|token| token.is("Identifier"))?;
        let reference = self.type_imports.get(&token.name()?.into_owned())?;
        let spec = self.spec(&reference.source)?;
        (angular == "@angular/core" && spec.matches_type(reference.imported.as_deref())).then(|| self.instance(spec, Some(call)))
    }

    fn follow(goals: &mut Vec<Goal<'v>>, at: usize, node: Option<Node<'v>>, combine: Combine<'v>) {
        let next = goal_for(goals[at].depth, node, None);
        goals.push(next);
        goals[at].children = vec![goals.len() - 1];
        goals[at].combine = combine;
    }

    fn expand_identifier(&self, goals: &mut Vec<Goal<'v>>, at: usize, identifier: Node<'v>) {
        let Some(name) = identifier.name() else { return };
        if let Some(reference) = self.module_ref(identifier, &name) {
            goals[at].value = self.spec(&reference.source).map(|spec| Origin::Module { reference, spec, member: None });
            return;
        }
        let Some(definition) = self.env.single_def(identifier) else { return };
        if definition.kind == DefKind::Parameter {
            goals[at].value = self.parameter_origin(definition.name);
            return;
        }
        let Some(id) = definition.node.node("id").filter(|id| definition.kind == DefKind::Variable && id.is("Identifier")) else { return };
        goals[at].value = self.type_origin(id.node("typeAnnotation"));
        if goals[at].value.is_none() {
            Self::follow(goals, at, definition.node.node("init"), Combine::Same);
        }
    }

    fn field_candidate(&self, node: Node<'v>, key: &str) -> Option<(Option<Origin<'v>>, Option<Node<'v>>)> {
        if node.is("PropertyDefinition") && !node.flag("computed") && name_of(node.node("key")).as_deref() == Some(key) {
            return Some((self.type_origin(node.node("typeAnnotation")), node.node("value")));
        }
        if node.is("TSParameterProperty") && name_of(node.node("parameter")).as_deref() == Some(key) {
            return Some((self.parameter_origin(node.node("parameter")?), None));
        }
        let left = node.node("left").filter(|left| node.is("AssignmentExpression") && left.is("MemberExpression"));
        let assigns = left.is_some_and(|left| left.node("object").is_some_and(|object| object.is("ThisExpression")) && member_name(left).as_deref() == Some(key));
        assigns.then(|| (None, node.node("right")))
    }

    fn expand_field(&self, goals: &mut Vec<Goal<'v>>, at: usize, member: Node<'v>) {
        let (Some(key), Some(owner)) = (member_name(member), class_of(member)) else { return };
        let Some(body) = owner.node("body") else { return };
        let depth = goals[at].depth;
        let candidates: Vec<Goal<'v>> =
            body.estree_descendants().into_iter().filter_map(|node| self.field_candidate(node, &key)).map(|(value, next)| goal_for(depth, next, value)).collect();
        let first = goals.len();
        goals.extend(candidates);
        goals[at].children = (first..goals.len()).collect();
        goals[at].combine = Combine::AnyDefined;
    }

    fn expand(&self, goals: &mut Vec<Goal<'v>>, at: usize) {
        let Some(target) = goals[at].node.map(skipped) else { return };
        if goals[at].value.is_some() || goals[at].depth > MAX_DEPTH {
            return;
        }
        if target.is("Identifier") {
            self.expand_identifier(goals, at, target);
        } else if target.is("CallExpression") || target.is("NewExpression") {
            let Some(callee) = target.node("callee").map(skipped) else { return };
            if callee.is("Identifier") && callee.name().as_deref() == Some("inject") {
                goals[at].value = self.injected(target, callee);
            } else if callee.is("MemberExpression") {
                Self::follow(goals, at, callee.node("object"), Combine::MadeBy(callee, target));
            } else {
                goals[at].value = self.made_by(callee, target, None);
            }
        } else if target.is("MemberExpression") {
            if target.node("object").is_some_and(|object| object.is("ThisExpression")) {
                self.expand_field(goals, at, target);
            } else {
                Self::follow(goals, at, target.node("object"), Combine::MemberOf(target));
            }
        }
    }

    fn combined(&self, combine: Combine<'v>, values: Vec<Option<Origin<'v>>>) -> Option<Origin<'v>> {
        match combine {
            Combine::First | Combine::Same => values.into_iter().next().flatten(),
            Combine::AnyDefined => values.into_iter().flatten().next(),
            Combine::MadeBy(target, call) => self.made_by(target, call, values.into_iter().next().flatten()),
            Combine::MemberOf(member) => match values.into_iter().next().flatten() {
                Some(Origin::Module { reference, spec, .. }) => Some(Origin::Module { reference, spec, member: member_name(member) }),
                other => other.filter(|base| base.spec().deep),
            },
        }
    }

    /// `originOf`.
    pub fn origin_of(&self, node: Node<'v>) -> Option<Origin<'v>> {
        let mut goals = vec![goal_for(-1, Some(node), None)];
        let mut at = 0;
        while at < goals.len() {
            self.expand(&mut goals, at);
            at += 1;
        }
        for at in (0..goals.len()).rev() {
            if !goals[at].children.is_empty() {
                let values = goals[at].children.iter().map(|child| goals[*child].value.clone()).collect();
                goals[at].value = self.combined(goals[at].combine, values);
            }
        }
        goals.swap_remove(0).value
    }
}
