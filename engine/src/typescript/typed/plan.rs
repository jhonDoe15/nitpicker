//! What one file asks the compiler, gathered from the engine's own tree without the compiler.
use crate::typescript::tree::Tree;
use crate::typescript::{ParsedFile, with_parsed};
use oxc_ast::AstKind;
use oxc_ast::ast::{BindingPattern, ClassType, Declaration, ExportDefaultDeclarationKind, PropertyKey, Statement};
use oxc_span::GetSpan;

pub const IDENTIFIER: u32 = 79;
pub const PRIVATE_IDENTIFIER: u32 = 80;
pub const EXPORT_KEYWORD: u32 = 94;
pub const PROPERTY_ACCESS: u32 = 212;
pub const HERITAGE_TYPE: u32 = 234;
pub const CLASS_DECLARATION: u32 = 264;
pub const INTERFACE_DECLARATION: u32 = 265;

/// A node the compiler is asked about: its kind there, or `None` for "the expression with this extent".
#[derive(Clone, Copy)]
pub struct Place {
    pub kind: Option<u32>,
    pub start: u32,
    pub end: u32,
}

/// A member read, the name read when it is written out, and the class declaration around it.
pub struct Read {
    pub place: Place,
    pub name: Option<Box<str>>,
    pub class: Option<(u32, u32)>,
}

pub struct TopClass {
    pub place: Place,
    pub implements: Vec<Place>,
}

pub struct FilePlan {
    /// Class declarations that are statements of the file.
    pub classes: Vec<TopClass>,
    /// Member reads: the name of `a.b`, the argument of `a[b]`. With the class declaration around the read.
    pub reads: Vec<Read>,
    /// `const { name } = initializer`: the initializer, the name, the class declaration around it.
    pub picks: Vec<(Place, String, Option<(u32, u32)>)>,
    pub unparsed: bool,
    /// For files with characters outside ASCII: byte offset just past each such character, and how many
    /// fewer UTF-16 units than bytes the text has up to there. The compiler counts UTF-16 units.
    pub wide: Vec<(u32, u32)>,
}

impl FilePlan {
    pub fn empty() -> FilePlan {
        FilePlan { classes: Vec::new(), reads: Vec::new(), picks: Vec::new(), unparsed: false, wide: Vec::new() }
    }
    /// A byte offset as the compiler counts it.
    pub fn units(&self, offset: u32) -> u32 {
        let before = self.wide.partition_point(|(past, _)| *past <= offset);
        if before == 0 { offset } else { offset - self.wide[before - 1].1 }
    }
}

fn wide_of(text: &str) -> Vec<(u32, u32)> {
    if text.is_ascii() {
        return Vec::new();
    }
    let mut wide = Vec::new();
    let mut less = 0u32;
    for (at, character) in text.char_indices() {
        if !character.is_ascii() {
            // The compiler drops a byte order mark before it counts.
            less += if at == 0 && character == '\u{feff}' { 3 } else { (character.len_utf8() - character.len_utf16()) as u32 };
            wide.push(((at + character.len_utf8()) as u32, less));
        }
    }
    wide
}

fn place(kind: u32, span: oxc_span::Span) -> Place {
    Place { kind: Some(kind), start: span.start, end: span.end }
}

fn top_classes<'a>(file: &ParsedFile<'a>) -> Vec<&'a oxc_ast::ast::Class<'a>> {
    file.program
        .body
        .iter()
        .filter_map(|statement| match statement {
            Statement::ClassDeclaration(class) => Some(&**class),
            Statement::ExportDeclaration(export) => match &export.declaration {
                Declaration::ClassDeclaration(class) => Some(&**class),
                _ => None,
            },
            Statement::ExportDefaultDeclaration(export) => match &export.declaration {
                ExportDefaultDeclarationKind::ClassDeclaration(class) => Some(&**class),
                _ => None,
            },
            _ => None,
        })
        .collect()
}

fn in_implements(tree: &Tree, mut index: u32) -> bool {
    while let Some(parent) = tree.parent(index) {
        match tree.kind(parent) {
            AstKind::TSQualifiedName(_) => index = parent,
            AstKind::TSClassImplements(_) => return true,
            _ => return false,
        }
    }
    false
}

pub fn plan_of(path: &str, text: &str) -> FilePlan {
    with_parsed(path, text, |file| {
        let tree = Tree::of(file.program);
        let classes = top_classes(file)
            .into_iter()
            .map(|class| TopClass {
                place: place(CLASS_DECLARATION, class.span),
                implements: class.implements.iter().map(|heritage| place(HERITAGE_TYPE, heritage.span)).collect(),
            })
            .collect();
        let mut plan = FilePlan { classes, reads: Vec::new(), picks: Vec::new(), unparsed: file.panicked, wide: wide_of(text) };
        let mut around: Vec<Option<(u32, u32)>> = Vec::with_capacity(tree.nodes.len());
        for (index, node) in tree.nodes.iter().enumerate() {
            let inherited = tree.parent(index as u32).and_then(|parent| around[parent as usize]);
            let class = match node.kind {
                AstKind::Class(class) if class.r#type == ClassType::ClassDeclaration => Some((class.span.start, class.span.end)),
                _ => inherited,
            };
            around.push(class);
            match node.kind {
                AstKind::StaticMemberExpression(member) => plan.reads.push(Read { place: place(IDENTIFIER, member.property.span), name: Some(member.property.name.as_str().into()), class }),
                AstKind::PrivateFieldExpression(member) => plan.reads.push(Read { place: place(PRIVATE_IDENTIFIER, member.field.span), name: Some(format!("#{}", member.field.name).into()), class }),
                AstKind::JSXMemberExpression(member) => plan.reads.push(Read { place: place(IDENTIFIER, member.property.span), name: Some(member.property.name.as_str().into()), class }),
                AstKind::TSQualifiedName(name) if in_implements(&tree, index as u32) => plan.reads.push(Read { place: place(IDENTIFIER, name.right.span), name: Some(name.right.name.as_str().into()), class }),
                AstKind::ComputedMemberExpression(member) => {
                    let span = member.expression.span();
                    plan.reads.push(Read { place: Place { kind: None, start: span.start, end: span.end }, name: None, class });
                }
                AstKind::VariableDeclarator(declarator) => {
                    if let (BindingPattern::ObjectPattern(pattern), Some(initializer)) = (&declarator.id, &declarator.init) {
                        let span = initializer.span();
                        let from = Place { kind: None, start: span.start, end: span.end };
                        for property in &pattern.properties {
                            if let PropertyKey::StaticIdentifier(key) = &property.key {
                                plan.picks.push((from, key.name.to_string(), class));
                            }
                        }
                        if let Some(rest) = &pattern.rest {
                            if let BindingPattern::BindingIdentifier(name) = &rest.argument {
                                plan.picks.push((from, name.name.to_string(), class));
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        plan
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offsets_count_utf16_units_and_skip_a_byte_order_mark() {
        let plain = plan_of("a.ts", "const a = b.c;");
        assert_eq!(plain.units(12), 12);
        let wide = plan_of("a.ts", "const é = '😀'; b.c;");
        // `é` is two bytes and one unit; the emoji is four bytes and two units.
        assert_eq!(wide.units(8), 7);
        assert_eq!(wide.units(18), 15);
        let marked = plan_of("a.ts", "\u{feff}b.c;");
        assert_eq!(marked.units(5), 2);
    }

    #[test]
    fn collects_member_reads_with_the_class_declaration_around_them() {
        let plan = plan_of("a.ts", "export class A implements N.B, C { run() { return this.x[k]; } }\nconst { load, ...rest } = store; a?.b;");
        assert_eq!(plan.classes.len(), 1);
        assert_eq!(plan.classes[0].implements.len(), 2);
        let names: Vec<_> = plan.reads.iter().map(|read| (read.name.as_deref(), read.class.is_some())).collect();
        assert_eq!(names, vec![(Some("B"), true), (None, true), (Some("x"), true), (Some("b"), false)]);
        let picks: Vec<_> = plan.picks.iter().map(|(_, name, _)| name.as_str()).collect();
        assert_eq!(picks, vec!["load", "rest"]);
    }
}
