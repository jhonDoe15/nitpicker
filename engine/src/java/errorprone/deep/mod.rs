//! DeeplyNested: Error Prone scans javac's attributed tree of the file with the depth of each tree, the compilation
//! unit at depth 0, and reports the tree whose child slot (a tree or an empty slot) sits deeper than `MaxDepth`. The
//! scan keeps the last such tree. The engine builds the slots of javac's tree from the parse (see `tree`), with the
//! trees javac adds: default constructors, `super()` calls, the inferred types of `var` and lambda parameters.
mod exprs;
mod tree;
mod types;

use super::Context;
use tree_sitter::Node;

const CHECK: &str = "DeeplyNested";
const MESSAGE: &str = "Very deeply nested code may lead to StackOverflowErrors during compilation";
/// Error Prone's default `DeeplyNested:MaxDepth`; a run that sets the option leaves the check to Error Prone.
const MAX_DEPTH: usize = 1000;
/// The most javac levels a level of the parse stands for: an enum constant is a variable, its `new` and its body. A
/// file the engine cannot model goes back to Error Prone where that, with a made-up type, may reach the limit.
const LEVELS_PER_NODE: usize = 3;
/// The deepest parse the engine walks; the walk recurses, and Error Prone itself needs a large stack for such files.
const DEEPEST_PARSE: usize = 3000;

/// One slot of javac's scan: a tree, an empty slot (`kind` is `NULL`), or a tree javac makes up whose depth the engine
/// knows only within `span` (`kind` is `?`). `pos` is javac's preferred position as a byte offset, or `None`.
#[derive(Clone, Copy)]
pub struct Slot<'t> {
    pub level: usize,
    pub kind: &'static str,
    pub pos: Option<usize>,
    pub node: Option<Node<'t>>,
    pub span: (usize, usize),
    /// A `@SuppressWarnings` on the declaration turns the check off below it: the scan skips its slots.
    pub cut: bool,
}

/// Where the last deep slot leaves the report.
#[derive(Clone, Copy)]
enum Hit {
    None,
    /// At a position, with the index of the slot.
    At(usize, usize),
    /// At a made-up tree without a position: Error Prone reports the file without a line, which the engine leaves to it.
    Nowhere,
    /// The engine cannot tell whether a made-up tree reaches that deep.
    Unsure,
}

fn max_depth() -> usize {
    std::env::var("NP_DEEPLY_NESTED_MAX_DEPTH").ok().and_then(|value| value.parse().ok()).unwrap_or(MAX_DEPTH)
}

/// The tree the scan reports, by the rule above: the slot at depth `max + 2` makes its parent the hit.
fn last_hit<'t>(slots: &[Slot<'t>], max: usize) -> (Hit, Option<usize>) {
    let mut parents: Vec<usize> = Vec::new();
    let mut hit = Hit::None;
    let mut at = None;
    for (index, slot) in slots.iter().enumerate() {
        parents.truncate(slot.level);
        if slot.level == max + 2 {
            let above = &slots[parents[slot.level - 1]];
            hit = match above.pos {
                Some(pos) => Hit::At(pos, parents[slot.level - 1]),
                None => Hit::Nowhere,
            };
            at = Some(parents[slot.level - 1]);
        }
        if slot.kind == "?" && slot.level <= max + 1 {
            let (low, high) = slot.span;
            let reaches = |depth: usize| slot.level + depth >= max + 3;
            if reaches(low) || reaches(high) {
                let made = slot.pos.map_or(Hit::Nowhere, |pos| Hit::At(pos, index));
                hit = if reaches(low) { made } else { Hit::Unsure };
                at = Some(index);
            }
        }
        parents.push(index);
    }
    (hit, at)
}

/// The brackets of a node's `dimensions`, also on its declarators: javac wraps the type in an array type per pair,
/// where the parse keeps them flat beside it (`A<B> x[][]`, `int f()[]`).
fn brackets(node: Node) -> usize {
    let mut cursor = node.walk();
    node.children(&mut cursor)
        .map(|child| match child.kind() {
            "dimensions" => child.child_count() as usize,
            "variable_declarator" => {
                let mut inner = child.walk();
                child.children(&mut inner).filter(|part| part.kind() == "dimensions").map(|part| part.child_count() as usize).sum()
            }
            _ => 0,
        })
        .sum()
}

/// The deepest nesting of the parse, the children of a node below its brackets.
fn parse_depth(root: Node) -> usize {
    let mut deepest = 0;
    let mut stack = vec![(root, 0)];
    while let Some((node, above)) = stack.pop() {
        let depth = above + 1 + brackets(node);
        deepest = deepest.max(depth);
        let mut cursor = node.walk();
        stack.extend(node.children(&mut cursor).map(|child| (child, depth)));
    }
    deepest
}

/// The slots of the file's javac tree, or `None` where the engine cannot model the file.
pub fn slots<'t>(context: &Context, root: Node<'t>) -> Result<Vec<Slot<'t>>, u32> {
    let mut built = tree::Build::new(context);
    built.unit(root);
    if built.unsure { Err(built.why) } else { Ok(built.slots) }
}

/// The path of a slot: the slots above it, nearest first.
fn path_of(slots: &[Slot], index: usize) -> Vec<usize> {
    let mut path = vec![index];
    let mut level = slots[index].level;
    for at in (0..index).rev() {
        if slots[at].level < level {
            path.push(at);
            level = slots[at].level;
        }
    }
    path
}

fn lombok_reaches(context: &Context, slots: &[Slot], max: usize) -> bool {
    context.project.index.lombok
        && context.file.text.contains("lombok")
        && slots.iter().filter(|slot| slot.kind == "CLASS" || slot.kind == "ENUM").any(|slot| slot.level + 40 >= max)
}

pub fn deeply_nested(context: &Context, root: Node) {
    if let Ok(folder) = std::env::var("NP_JAVAC_TREE_OUT") {
        dump(context, root, &folder);
    }
    let max = max_depth();
    let depth = parse_depth(root);
    if root.has_error() || depth > DEEPEST_PARSE {
        context.hand_back(CHECK, root);
        return;
    }
    let Ok(slots) = slots(context, root) else {
        if depth * LEVELS_PER_NODE + types::UNKNOWN.1 > max {
            context.hand_back(CHECK, root);
        }
        return;
    };
    if lombok_reaches(context, &slots, max) {
        context.hand_back(CHECK, root);
        return;
    }
    match last_hit(&slots, max).0 {
        Hit::None => {}
        Hit::Nowhere | Hit::Unsure => context.hand_back(CHECK, root),
        Hit::At(pos, index) => {
            let above = path_of(&slots, index).into_iter().find_map(|at| slots[at].node);
            if above.is_some_and(|node| in_builder_chain(context, node)) {
                context.hand_back(CHECK, root);
            } else {
                context.report_always(CHECK, pos, MESSAGE);
            }
        }
    }
}

/// Error Prone's fix rewrites a chain of builder calls that ends in a `build...()` call returned or assigned to a
/// static field. Where the reported tree may sit in such a chain the engine leaves the check to Error Prone.
fn in_builder_chain(context: &Context, node: Node) -> bool {
    let mut current = Some(node);
    while let Some(at) = current {
        if at.kind() == "method_invocation" {
            let named = at.child_by_field_name("name").is_some_and(|name| context.text(name).starts_with("build"));
            let holder = crate::engine::source::parent(at).map(|up| up.kind());
            if named && at.child_by_field_name("object").is_some() && matches!(holder, Some("return_statement" | "variable_declarator")) {
                return true;
            }
        }
        current = crate::engine::source::parent(at);
    }
    false
}

/// Writes the slots as `level KIND position` lines, positions in UTF-16 units like javac's, `-1` for none; a made-up
/// tree is `level ? position low high`. One file per source, for comparing with javac's own scan.
fn dump(context: &Context, root: Node, folder: &str) {
    let text = &context.file.text;
    let mut units = vec![0usize; text.len() + 1];
    let mut count = 0;
    for (at, character) in text.char_indices() {
        units[at] = count;
        count += character.len_utf16();
    }
    units[text.len()] = count;
    let place = |pos: Option<usize>| pos.map_or(-1, |pos| units[pos] as i64);
    let mut out = format!("F {}\n", context.file.path);
    match slots(context, root) {
        Ok(found) => {
            for slot in found {
                match slot.kind {
                    "?" => out.push_str(&format!("{} ? {} {} {}\n", slot.level, place(slot.pos), slot.span.0, slot.span.1)),
                    "NULL" => out.push_str(&format!("{} NULL\n", slot.level)),
                    kind => out.push_str(&format!("{} {}{} {}\n", slot.level, kind, if slot.cut { "!" } else { "" }, place(slot.pos))),
                }
            }
        }
        Err(line) => out.push_str(&format!("UNSURE {line}\n")),
    }
    let name = format!("{}.txt", context.file.path.replace('/', "_"));
    let _ = std::fs::write(std::path::Path::new(folder).join(name), out);
}
