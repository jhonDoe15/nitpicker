//! A flat, preorder table of the oxc tree with parent links, so checks can walk up and sideways.
use oxc_ast::AstKind;
use oxc_ast::ast::Program;
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;

pub const ROOT: u32 = u32::MAX;

pub struct Node<'a> {
    pub kind: AstKind<'a>,
    pub parent: u32,
    pub start: u32,
    pub end: u32,
    /// Index just past the last descendant.
    pub after: u32,
}

pub struct Tree<'a> {
    pub nodes: Vec<Node<'a>>,
}

struct Builder<'a> {
    nodes: Vec<Node<'a>>,
    open: Vec<u32>,
}

impl<'a> Visit<'a> for Builder<'a> {
    fn enter_node(&mut self, kind: AstKind<'a>) {
        let span = kind.span();
        let index = self.nodes.len() as u32;
        self.nodes.push(Node { kind, parent: self.open.last().copied().unwrap_or(ROOT), start: span.start, end: span.end, after: 0 });
        self.open.push(index);
    }
    fn leave_node(&mut self, _kind: AstKind<'a>) {
        let index = self.open.pop().expect("open node");
        self.nodes[index as usize].after = self.nodes.len() as u32;
    }
}

impl<'a> Tree<'a> {
    pub fn of(program: &'a Program<'a>) -> Tree<'a> {
        let mut builder = Builder { nodes: Vec::with_capacity(1024), open: Vec::new() };
        builder.visit_program(program);
        Tree { nodes: builder.nodes }
    }
    pub fn kind(&self, index: u32) -> AstKind<'a> {
        self.nodes[index as usize].kind
    }
    pub fn parent(&self, index: u32) -> Option<u32> {
        let parent = self.nodes[index as usize].parent;
        (parent != ROOT).then_some(parent)
    }
    pub fn children(&self, index: u32) -> Children<'_, 'a> {
        Children { tree: self, next: index + 1, end: self.nodes[index as usize].after }
    }
    /// The child that covers exactly this span, for telling which field of the parent a child is.
    pub fn is_span(&self, index: u32, span: oxc_span::Span) -> bool {
        let node = &self.nodes[index as usize];
        node.start == span.start && node.end == span.end
    }
}

pub struct Children<'t, 'a> {
    tree: &'t Tree<'a>,
    next: u32,
    end: u32,
}

impl Iterator for Children<'_, '_> {
    type Item = u32;
    fn next(&mut self) -> Option<u32> {
        if self.next >= self.end {
            return None;
        }
        let child = self.next;
        self.next = self.tree.nodes[child as usize].after;
        Some(child)
    }
}
