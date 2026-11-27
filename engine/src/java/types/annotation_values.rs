//! Element values of the annotations whose values checks read, kept on methods from source files and class files.
//! A source file keeps a constant as its expression, since the names in it may be declared in other files; the
//! value is read once the whole index is known.
use super::guards::Expr;
use super::index::TypeIndex;
use super::scope::Resolver;
use crate::engine::source::children;
use tree_sitter::Node;

/// The annotations whose element values are kept on the methods and constructors that carry them.
pub const KEPT: &[&str] = &["com.google.errorprone.annotations.RestrictedApi"];

/// One element value, as JVMS 4.7.16.1 lists them.
#[derive(Clone, Debug)]
pub enum Element {
    /// A string read from a class file.
    Text(String),
    /// A constant expression written in a source file.
    Constant(Expr),
    /// A class literal: the class's full name with `.` before a member class.
    Class(String),
    /// An enum constant: the enum's full name and the constant's name.
    Enum(String, String),
    Array(Vec<Element>),
    Annotation(Box<Kept>),
    /// A value no check reads yet: a number or boolean from a class file, or an expression the engine cannot fold.
    Other,
}

/// An annotation with its element values, as written: elements left at their default are absent.
#[derive(Clone, Debug)]
pub struct Kept {
    pub name: String,
    pub elements: Vec<(String, Element)>,
}

impl Kept {
    pub fn get(&self, element: &str) -> Option<&Element> {
        self.elements.iter().find(|(name, _)| name == element).map(|(_, value)| value)
    }
}

impl Element {
    /// The classes a class element names, alone or in an array.
    pub fn classes(&self) -> Vec<String> {
        match self {
            Element::Class(name) => vec![name.clone()],
            Element::Array(values) => values.iter().flat_map(Element::classes).collect(),
            _ => Vec::new(),
        }
    }
}

impl TypeIndex {
    /// The string an element holds; a constant of a source file is read in `class`, the class declaring the member.
    pub fn element_text(&self, class: &str, element: &Element) -> Option<String> {
        match element {
            Element::Text(text) => Some(text.clone()),
            Element::Constant(expr) => self.constant_text(expr, class),
            _ => None,
        }
    }
}

/// Decodes a class file's modified UTF-8 (JVMS 4.4.7): `C0 80` is NUL and supplementary characters are surrogate
/// pairs of three bytes each.
pub fn modified_utf8(bytes: &[u8]) -> Option<String> {
    let mut units: Vec<u16> = Vec::with_capacity(bytes.len());
    let mut at = 0;
    while at < bytes.len() {
        let first = u16::from(bytes[at]);
        let more = |count: usize| bytes.get(at + 1..at + 1 + count).filter(|rest| rest.iter().all(|byte| byte & 0xc0 == 0x80));
        if first & 0x80 == 0 {
            units.push(first);
            at += 1;
        } else if first & 0xe0 == 0xc0 {
            let rest = more(1)?;
            units.push((first & 0x1f) << 6 | u16::from(rest[0] & 0x3f));
            at += 2;
        } else if first & 0xf0 == 0xe0 {
            let rest = more(2)?;
            units.push((first & 0x0f) << 12 | u16::from(rest[0] & 0x3f) << 6 | u16::from(rest[1] & 0x3f));
            at += 3;
        } else {
            return None;
        }
    }
    Some(String::from_utf16_lossy(&units))
}

impl Resolver<'_> {
    /// The kept annotations written on a declaration, with their element values.
    pub fn kept_annotations(&self, declaration: Node) -> Vec<Kept> {
        let holder = super::super::helpers::modifiers(declaration);
        let written = holder.map(children).unwrap_or_default().into_iter().filter(|part| part.kind() == "annotation");
        let mut found = Vec::new();
        for annotation in written {
            let Some(name) = annotation.child_by_field_name("name") else { continue };
            let Some(full) = self.class_name(declaration, self.file.text_of(name)) else { continue };
            if KEPT.contains(&full.as_str()) {
                found.push(self.kept(declaration, annotation, full));
            }
        }
        found
    }

    fn kept(&self, declaration: Node, annotation: Node, name: String) -> Kept {
        let mut elements = Vec::new();
        let listed = annotation.child_by_field_name("arguments").map(children).unwrap_or_default();
        for part in listed.into_iter().filter(|part| part.is_named() && !part.kind().ends_with("comment")) {
            if part.kind() == "element_value_pair" {
                let (Some(key), Some(value)) = (part.child_by_field_name("key"), part.child_by_field_name("value")) else { continue };
                elements.push((self.file.text_of(key).to_string(), self.element_value(declaration, value)));
            } else {
                elements.push(("value".to_string(), self.element_value(declaration, part)));
            }
        }
        Kept { name, elements }
    }

    fn element_value(&self, declaration: Node, value: Node) -> Element {
        let value = super::expr::unwrap(value);
        match value.kind() {
            "element_value_array_initializer" => Element::Array(
                children(value)
                    .into_iter()
                    .filter(|part| part.is_named() && !part.kind().ends_with("comment"))
                    .map(|part| self.element_value(declaration, part))
                    .collect(),
            ),
            "class_literal" => {
                let Some(kind) = value.named_child(0) else { return Element::Other };
                let written: String = self.file.text_of(kind).split_whitespace().collect();
                Element::Class(self.class_name(declaration, &written).unwrap_or(written))
            }
            "annotation" | "marker_annotation" => {
                let Some(name) = value.child_by_field_name("name") else { return Element::Other };
                let written = self.file.text_of(name);
                let full = self.class_name(declaration, written).unwrap_or_else(|| written.to_string());
                Element::Annotation(Box::new(if value.kind() == "annotation" { self.kept(declaration, value, full) } else { Kept { name: full, elements: Vec::new() } }))
            }
            _ => self.fold(value).map_or(Element::Other, Element::Constant),
        }
    }
}
