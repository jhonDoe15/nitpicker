//! What a ported rule sees of a file: the PMD-shaped tree, its types and the rule's properties.
use super::usages::Usages;
use crate::engine::source::SourceFile;
use crate::java::pmd::tree::{PmdTree, ROOT, Value};
use crate::java::pmd::xpath::eval::Machine;
use crate::java::types::model::Type;
use std::cell::OnceCell;
use std::collections::BTreeMap;

pub struct Hit {
    pub node: u32,
    pub args: Vec<String>,
    pub message: Option<String>,
}

pub struct Ctx<'m, 'a, 't> {
    pub tree: &'a PmdTree<'t>,
    pub file: &'a SourceFile,
    pub machine: &'m Machine<'a, 't>,
    pub properties: &'m BTreeMap<String, String>,
    pub usages: &'m OnceCell<Usages>,
    pub flow: &'m OnceCell<super::flow::Flow>,
}

const BOUNDARIES: &[&str] = &["LambdaExpression", "AnonymousClassDeclaration", "LocalClassStatement"];
pub const TYPE_DECLARATIONS: &[&str] = &[
    "ClassDeclaration",
    "EnumDeclaration",
    "RecordDeclaration",
    "AnnotationTypeDeclaration",
    "AnonymousClassDeclaration",
    "ImplicitClassDeclaration",
];

impl<'m, 'a, 't> Ctx<'m, 'a, 't> {
    pub fn name(&self, id: u32) -> &'static str {
        self.tree.nodes[id as usize].name
    }

    pub fn is(&self, id: u32, name: &str) -> bool {
        self.name(id) == name
    }

    pub fn all(&self, name: &str) -> &[u32] {
        self.tree.named.get(name).map(Vec::as_slice).unwrap_or_default()
    }

    pub fn kids(&self, id: u32) -> &[u32] {
        &self.tree.nodes[id as usize].children
    }

    pub fn kid(&self, id: u32, name: &str) -> Option<u32> {
        self.kids(id).iter().copied().find(|kid| self.is(*kid, name))
    }

    pub fn kids_named(&self, id: u32, name: &'static str) -> impl Iterator<Item = u32> + '_ {
        self.kids(id).iter().copied().filter(move |kid| self.is(*kid, name))
    }

    pub fn nth(&self, id: u32, at: usize) -> Option<u32> {
        self.kids(id).get(at).copied()
    }

    pub fn parent(&self, id: u32) -> Option<u32> {
        let parent = self.tree.nodes[id as usize].parent;
        (parent != ROOT).then_some(parent)
    }

    pub fn ancestors(&self, id: u32) -> impl Iterator<Item = u32> + '_ {
        std::iter::successors(self.parent(id), move |at| self.parent(*at))
    }

    pub fn enclosing(&self, id: u32, names: &[&str]) -> Option<u32> {
        self.ancestors(id).find(|at| names.contains(&self.name(*at)))
    }

    /// Every node below this one, in document order.
    pub fn below(&self, id: u32) -> impl Iterator<Item = u32> + use<> {
        id + 1..=self.tree.last[id as usize]
    }

    /// The nodes below this one as PMD's `descendants()` sees them: nested types and lambdas are listed but not
    /// entered, unless this node is one.
    pub fn descendants(&self, id: u32) -> Vec<u32> {
        let mut found = Vec::new();
        let mut at = id + 1;
        let end = self.tree.last[id as usize];
        while at <= end {
            found.push(at);
            at = if self.boundary(at) {
                self.tree.last[at as usize] + 1
            } else {
                at + 1
            };
        }
        found
    }

    pub fn boundary(&self, id: u32) -> bool {
        let name = self.name(id);
        BOUNDARIES.contains(&name) || (TYPE_DECLARATIONS.contains(&name) && self.flag(id, "Nested"))
    }

    /// Whether the node is a written type: PMD's `ASTType`.
    pub fn type_node(&self, id: u32) -> bool {
        matches!(self.name(id), "ClassType" | "PrimitiveType" | "ArrayType" | "IntersectionType" | "UnionType" | "WildcardType" | "VoidType")
    }

    pub fn attribute(&self, id: u32, key: &str) -> Option<Value> {
        self.tree.attribute(self.file, id, key)
    }

    pub fn text(&self, id: u32, key: &str) -> String {
        match self.attribute(id, key) {
            Some(Value::Text(text)) => text.to_string(),
            _ => String::new(),
        }
    }

    pub fn flag(&self, id: u32, key: &str) -> bool {
        matches!(self.attribute(id, key), Some(Value::Flag(true)))
    }

    pub fn whole(&self, id: u32, key: &str) -> Option<i64> {
        match self.attribute(id, key) {
            Some(Value::Whole(whole)) => Some(whole),
            _ => None,
        }
    }

    pub fn list(&self, id: u32, key: &str) -> Vec<String> {
        match self.attribute(id, key) {
            Some(Value::List(list)) => list,
            _ => Vec::new(),
        }
    }

    pub fn source_text(&self, id: u32) -> &str {
        let node = &self.tree.nodes[id as usize];
        &self.file.text[node.start..node.end]
    }

    pub fn type_of(&self, id: u32) -> Option<Type> {
        self.machine.node_type(id)
    }

    pub fn type_is(&self, id: u32, name: &str) -> bool {
        self.machine.node_type_is(id, name, false)
    }

    pub fn type_is_exactly(&self, id: u32, name: &str) -> bool {
        self.machine.node_type_is(id, name, true)
    }

    pub fn matches_sig(&self, id: u32, written: &str) -> bool {
        self.machine.node_matches_sig(id, written)
    }

    /// The class that declares the method or constructor a call resolves to.
    pub fn declaring(&self, call: u32) -> Option<String> {
        let source = self.tree.nodes[call as usize].source?;
        let resolved = self
            .machine
            .resolver
            .call_formals(source)
            .map(|(call, _)| call.declaring);
        resolved.or_else(|| self.loose_call(call).map(|(declaring, _)| declaring))
    }

    /// Whether a variable access or field access names a variable the type model knows.
    pub fn resolves(&self, access: u32) -> bool {
        if self.usages().declaration(access).is_some() {
            return true;
        }
        let Some(source) = self.tree.nodes[access as usize].source else {
            return false;
        };
        let resolver = self.machine.resolver;
        match self.name(access) {
            "VariableAccess" => resolver.binding(source, &self.text(access, "Name")).is_some(),
            _ => self.type_of(access).is_some(),
        }
    }

    /// Whether the field an access names is static and whether it is final; nothing when it names no field.
    pub fn field_modifiers(&self, access: u32) -> Option<(bool, bool)> {
        use crate::java::types::model::flag;
        if let Some(variable) = self.usages().declaration(access) {
            return self
                .flag(variable, "Field")
                .then(|| (self.flag(variable, "Static"), self.flag(variable, "Final")));
        }
        let source = self.tree.nodes[access as usize].source?;
        let resolver = self.machine.resolver;
        let name = self.text(access, "Name");
        let flags = if self.is(access, "VariableAccess") {
            match resolver.binding(source, &name)? {
                crate::java::types::expr::Binding::Field(_, _, field) => field.flags,
                crate::java::types::expr::Binding::Local(_) => return None,
            }
        } else {
            let owner = self.type_of(self.nth(access, 0)?)?;
            resolver.index.field(&owner.erased().name(), &name)?.1.flags
        };
        Some((flags & flag::STATIC != 0, flags & flag::FINAL != 0))
    }

    pub fn property(&self, name: &str) -> Option<&str> {
        self.properties.get(name).map(String::as_str)
    }

    pub fn property_flag(&self, name: &str, default: bool) -> bool {
        self.property(name).map_or(default, |value| value.trim() == "true")
    }

    pub fn property_list(&self, name: &str, default: &[&str]) -> Vec<String> {
        match self.property(name) {
            Some(value) => value
                .split(',')
                .map(str::trim)
                .filter(|entry| !entry.is_empty())
                .map(str::to_string)
                .collect(),
            None => default.iter().map(|entry| entry.to_string()).collect(),
        }
    }

    pub fn usages(&self) -> &Usages {
        self.usages.get_or_init(|| Usages::of(self))
    }

    /// PMD's `DataflowPass` result for the file, worked out once for all rules.
    pub fn flow(&self) -> &super::flow::Flow {
        self.flow.get_or_init(|| super::flow::Flow::of(self))
    }

    /// The method name of a `MethodCall`.
    pub fn method_name(&self, call: u32) -> String {
        self.text(call, "MethodName")
    }

    /// The expression a call or field access is made on, when one is written.
    pub fn qualifier(&self, id: u32) -> Option<u32> {
        let first = self.nth(id, 0)?;
        (!matches!(self.name(first), "ArgumentList" | "TypeArguments")).then_some(first)
    }

    pub fn arguments(&self, call: u32) -> Vec<u32> {
        self.kid(call, "ArgumentList")
            .map(|list| self.kids(list).to_vec())
            .unwrap_or_default()
    }

    pub fn string_value(&self, literal: u32) -> Option<String> {
        self.is(literal, "StringLiteral")
            .then(|| self.text(literal, "ConstValue"))
    }

    pub fn modifiers(&self, owner: u32, key: &str) -> Vec<String> {
        self.kid(owner, "ModifierList")
            .map(|list| self.list(list, key))
            .unwrap_or_default()
    }

    pub fn has_modifier(&self, owner: u32, modifier: &str) -> bool {
        self.modifiers(owner, "EffectiveModifiers")
            .iter()
            .any(|written| written == modifier)
    }

    pub fn annotations(&self, owner: u32) -> Vec<u32> {
        self.kid(owner, "ModifierList")
            .map(|list| self.kids_named(list, "Annotation").collect())
            .unwrap_or_default()
    }

    pub fn annotated(&self, owner: u32, name: &str) -> bool {
        self.annotations(owner)
            .into_iter()
            .any(|annotation| self.type_is_exactly(annotation, name))
    }

    /// The methods and other members a type declares directly.
    pub fn declarations(&self, declaration: u32, name: &'static str) -> Vec<u32> {
        let Some(body) = self
            .kids(declaration)
            .iter()
            .copied()
            .find(|kid| self.name(*kid).ends_with("Body"))
        else {
            return Vec::new();
        };
        self.kids_named(body, name).collect()
    }

}
