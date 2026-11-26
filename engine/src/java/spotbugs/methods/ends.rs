//! Where control goes when a statement ends or jumps: whether it can complete normally, which decides where javac
//! writes jumps and returns, and the code a jump runs on its way out (monitor exits, copied `finally` blocks).
use super::super::{Context, folds};
use super::code::{AWAY, Code, Frame, Op};
use crate::engine::source::{children, named_children};
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

impl<'a> Code<'_, 'a> {
    /// The code of a `finally` block copied where control leaves its `try`, with the frames outside it.
    pub(super) fn inline(&mut self, depth: usize, finally: Option<Node<'a>>) {
        let Some(block) = finally else { return };
        let inner = self.frames.split_off(depth);
        self.statement(block);
        self.frames.extend(inner);
    }

    /// Leaves every frame above `depth`: monitors are released and `finally` blocks copied, innermost first.
    pub(super) fn unwind(&mut self, depth: usize) {
        let mut index = self.frames.len();
        while index > depth {
            index -= 1;
            match self.frames[index] {
                Frame::Sync => self.ops.extend([Op::Load, Op::Exit]),
                Frame::Finally(block) => {
                    let inner = self.frames.split_off(index);
                    self.statement(block);
                    self.frames.extend(inner);
                }
                Frame::Jumps(..) => {}
            }
        }
    }

    pub(super) fn jump(&mut self, node: Node<'a>) {
        let name = node.named_child(0).filter(|label| label.kind() == "identifier").map(|label| self.context.text(label).to_string());
        let again = node.kind() == "continue_statement";
        let found = self.frames.iter().rposition(|frame| match (frame, &name) {
            (Frame::Jumps(label, _, _), Some(name)) => label.as_ref() == Some(name),
            (Frame::Jumps(None, _, next), None) => !again || next.is_some(),
            _ => false,
        });
        let target = found.map(|index| if again && name.is_some() { index + 1 } else { index });
        let Some(Frame::Jumps(_, end, next)) = target.and_then(|target| self.frames.get(target)) else { return self.push(Op::Kill) };
        let goal = if again { next.unwrap_or(AWAY) } else { *end };
        self.unwind(target.unwrap_or_default() + 1);
        self.push(Op::Goto(goal));
    }
}

/// Whether a statement can complete normally, as the Java language decides it.
pub fn completes(context: &Context, node: Node) -> bool {
    let done = |node: Node| completes(context, node);
    match node.kind() {
        "return_statement" | "throw_statement" | "break_statement" | "continue_statement" | "yield_statement" => false,
        "block" => named_children(node).into_iter().all(done),
        "if_statement" => match (node.child_by_field_name("consequence"), node.child_by_field_name("alternative")) {
            (Some(then), Some(otherwise)) => done(then) || done(otherwise),
            _ => true,
        },
        "while_statement" | "for_statement" | "do_statement" => {
            let condition = node.child_by_field_name("condition");
            let endless = condition.is_none() || folds::fixed(context, condition) == Some(true);
            !endless || breaks(context, None, node)
        }
        "labeled_statement" => {
            let label = node.named_child(0).map(|label| context.text(label));
            named_children(node).last().is_none_or(|body| done(*body) || breaks(context, label, *body))
        }
        "synchronized_statement" => node.child_by_field_name("body").is_none_or(done),
        "try_statement" => {
            let parts = children(node);
            let finally = parts.iter().find(|part| part.kind() == "finally_clause").and_then(|clause| named_children(*clause).into_iter().find(|part| part.kind() == "block"));
            let catches = parts.iter().filter(|part| part.kind() == "catch_clause");
            let any = node.child_by_field_name("body").is_some_and(done) || catches.into_iter().any(|clause| clause.child_by_field_name("body").is_some_and(done));
            any && finally.is_none_or(done)
        }
        _ => true,
    }
}

/// Whether a `break` inside `scope` leaves it: one naming `label`, or with no label one that no inner loop or
/// switch takes.
fn breaks(context: &Context, label: Option<&str>, scope: Node) -> bool {
    named_children(scope).into_iter().any(|part| match part.kind() {
        "break_statement" => part.named_child(0).filter(|name| name.kind() == "identifier").map(|name| context.text(name)) == label,
        "while_statement" | "for_statement" | "do_statement" | "enhanced_for_statement" | "switch_expression" => label.is_some() && breaks(context, label, part),
        "lambda_expression" | "class_body" => false,
        kind if TYPE_DECLARATIONS.contains(&kind) => false,
        _ => breaks(context, label, part),
    })
}

pub fn has(node: Node, kind: &str) -> bool {
    named_children(node).into_iter().any(|part| part.kind() == kind || (!matches!(part.kind(), "lambda_expression" | "class_body") && has(part, kind)))
}
