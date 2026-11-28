//! NN_NAKED_NOTIFY: `notify()` or `notifyAll()` in a monitor that does nothing else. SpotBugs reads the class file
//! instruction by instruction: a `synchronized` method or a `monitorenter` starts a watch; reading a local, a
//! static field or a field and then calling the notify method is the call; reading anything else, or doing
//! anything after the call but returning, jumping or leaving the monitor, ends the watch until the next
//! `monitorenter`. One finding per method, at the first such call.
use super::super::classes::lines;
use super::super::statements::{member_label, own_nodes};
use super::super::{Context, lombok, names, place};
use code::{Code, Op};
use crate::engine::source::{children, named_children};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

mod captures;
mod code;
mod constants;
pub(crate) mod ends;
mod values;

const PATTERN: &str = "NN_NAKED_NOTIFY";

#[derive(Clone, Copy)]
enum State<'a> {
    Off,
    Watching,
    Reading,
    Called(Node<'a>),
    /// After the call, the lock about to be released.
    Releasing(Node<'a>),
    /// After the call, a return or a jump: anything more ends the watch.
    Left(Node<'a>),
}

/// The first notify call SpotBugs reports in a method's code.
fn naked<'a>(ops: &[Op<'a>], synchronized: bool) -> Option<Node<'a>> {
    let mut state = if synchronized { State::Watching } else { State::Off };
    for op in ops {
        state = match (state, *op) {
            (_, Op::Label(_)) => state,
            (_, Op::Enter) => State::Watching,
            (State::Off, _) => State::Off,
            (State::Watching, Op::Load | Op::Field) | (State::Reading, Op::Field) => State::Reading,
            (State::Watching, Op::Kill) => State::Off,
            (State::Watching, _) => State::Watching,
            (State::Reading, Op::Notify(call)) => State::Called(call),
            (State::Called(call), Op::Return | Op::Goto(_)) => State::Left(call),
            (State::Called(call), Op::Load) => State::Releasing(call),
            (State::Releasing(call), Op::Exit) => return Some(call),
            _ => State::Off,
        };
    }
    match state {
        State::Called(call) | State::Left(call) => Some(call),
        _ => None,
    }
}

fn holds_monitor(context: &Context, node: Node) -> bool {
    context.text(node).contains("ynchronized")
}

fn report(context: &Context, ops: &[Op], synchronized: bool, label: Option<String>) {
    let (Some(call), Some(label)) = (naked(ops, synchronized), label) else { return };
    let message = format!("Naked notify in {label}");
    context.report_listed(PATTERN, call, context.line(call), message, place::function(&label), 2, vec![label]);
}

fn body_code<'a>(context: &Context<'a>, is_static: bool, body: Option<Node<'a>>, returns: bool, locked: bool) -> Vec<Op<'a>> {
    let mut code = Code::new(context, is_static);
    if let Some(body) = body {
        if locked { code.guarded(None, Some(body)) } else { code.statement(body) }
        if returns && ends::completes(context, body) {
            code.push(Op::Return);
        }
    }
    code.ops
}

/// A constructor's code: the call of another constructor, then, unless it calls one of its own class, the field
/// initializers and initializer blocks, then the rest of its body.
fn constructor_code<'a>(context: &Context<'a>, members: &[Node<'a>], constructor: Option<Node<'a>>) -> Vec<Op<'a>> {
    let mut code = Code::new(context, false);
    let body = constructor.and_then(|constructor| constructor.child_by_field_name("body"));
    let statements: Vec<Node> = body.map(named_children).unwrap_or_default();
    let explicit = statements.first().copied().filter(|first| first.kind() == "explicit_constructor_invocation");
    match explicit {
        Some(first) => code.statement(first),
        None => code.ops.extend([Op::Load, Op::Other]),
    }
    if !constructor.is_some_and(lines::delegates) {
        for member in members {
            match member.kind() {
                "block" => code.statement(*member),
                "field_declaration" if !has_modifier(*member, "static") => {
                    for value in declarators(*member).into_iter().filter_map(|declarator| declarator.child_by_field_name("value")) {
                        code.push(Op::Load);
                        code.value(value);
                        code.push(Op::Other);
                    }
                }
                _ => {}
            }
        }
    }
    statements.into_iter().skip(usize::from(explicit.is_some())).for_each(|statement| code.statement(statement));
    if body.is_none_or(|body| ends::completes(context, body)) {
        code.push(Op::Return);
    }
    code.ops
}

pub fn check<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(&[PATTERN]) || !holds_monitor(context, class) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let Some(body) = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body")) else { return };
    let members = place::members(body);
    let initialized = members.iter().any(|member| member.kind() == "block" && holds_monitor(context, *member));
    let mut constructors = 0;
    for member in &members {
        let member = *member;
        if TYPE_DECLARATIONS.contains(&member.kind()) {
            continue;
        }
        let label = || member_label(context, &own, class, member);
        match member.kind() {
            "method_declaration" if holds_monitor(context, member) => {
                let synchronized = has_modifier(member, "synchronized");
                let void = member.child_by_field_name("type").is_some_and(|kind| kind.kind() == "void_type");
                let locked = lombok::annotated(context, member, "Synchronized");
                let ops = body_code(context, has_modifier(member, "static"), member.child_by_field_name("body"), void, locked);
                report(context, &ops, synchronized, label());
            }
            "constructor_declaration" | "compact_constructor_declaration" => {
                constructors += 1;
                if initialized || holds_monitor(context, member) {
                    report(context, &constructor_code(context, &members, Some(member)), false, label());
                }
            }
            "static_initializer" if holds_monitor(context, member) => {
                report(context, &body_code(context, true, member.named_child(0), true, false), false, label());
            }
            _ => {}
        }
        let is_static = has_modifier(member, "static") || member.kind() == "static_initializer";
        lambdas(context, member, is_static);
    }
    if constructors == 0 && initialized && class.kind() == "class_declaration" {
        let outer = crate::java::javac::instance_around(context.resolver, class);
        let label = names::method(context, &own, class, outer.as_deref());
        report(context, &constructor_code(context, &members, None), false, Some(label));
    }
}

/// Lambdas are methods of their own, never `synchronized`.
fn lambdas<'a>(context: &Context<'a>, member: Node<'a>, is_static: bool) {
    if !holds_monitor(context, member) {
        return;
    }
    let (mut nodes, mut lambdas) = (Vec::new(), Vec::new());
    own_nodes(member, &mut nodes, &mut lambdas);
    while let Some(lambda) = lambdas.pop() {
        own_nodes(lambda, &mut nodes, &mut lambdas);
        let body = lambda.child_by_field_name("body").filter(|body| body.kind() == "block" && holds_monitor(context, *body));
        if let Some(body) = body {
            let ops = body_code(context, is_static, Some(body), true, false);
            report(context, &ops, false, names::lambda(context, lambda));
        }
    }
}
