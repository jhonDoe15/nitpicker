//! The part of the class-file audit that looks past names and counts: a class's superclass, interfaces and access,
//! each member's erased types, its access bits and the annotations javac kept on it (added ones; dropped ones when the
//! index knows the annotation type from a class file), against what the type index read from the source; and the
//! class files next to a file's classes that none of them accounts for. A type the index could not resolve compares
//! by its written name. Not compared: annotation values, parameter and type-use annotations, `transient`, `throws`
//! clauses, constant values and code.
use super::processor_audit::{body_of, class_file, record_components};
use crate::engine::source::{SourceFile, named_children};
use crate::java::types::classfile::{descriptor_method, descriptor_type};
use crate::java::types::compiled::{ACC_PRIVATE, ACC_STATIC, CompiledClass};
use crate::java::types::index::TypeIndex;
use crate::java::types::model::{ClassInfo, Field, Method, Type, flag};
use std::path::PathBuf;
use tree_sitter::Node;

const ACC_SYNTHETIC: u16 = 0x1000;
const ACC_BRIDGE: u16 = 0x0040;
/// public, private, protected, static, final, volatile.
const FIELD_ACCESS: u16 = 0x005f;
/// public, private, protected, static, final, synchronized, native, abstract.
const METHOD_ACCESS: u16 = 0x053f;
const ACC_VARARGS: u16 = 0x0080;
const ACC_FINAL: u16 = 0x0010;
const ACC_ABSTRACT: u16 = 0x0400;
const ACC_PUBLIC: u16 = 0x0001;
const VISIBILITY: u16 = 0x0007;

/// The first member whose type, access or kept annotations differ from the source, as `kind name what`.
pub fn shape_difference(file: &SourceFile, declaration: Node, info: &ClassInfo, class: &CompiledClass, index: &TypeIndex) -> Option<String> {
    let components: Vec<String> = record_components(file, declaration).into_iter().map(|(name, _)| name).collect();
    let local = !matches!(declaration.parent().map(|holder| holder.kind()), Some("program" | "class_body" | "interface_body" | "enum_body_declarations" | "annotation_type_body"));
    if let Some(what) = class_difference(declaration, info, class, local) {
        return Some(what);
    }
    if let Some(extra) = unkept(&info.class_annotations, &class.annotations, index) {
        return Some(format!("annotation {extra}"));
    }
    if let Some(gone) = dropped(&info.class_annotations, &class.annotations, index, "TYPE") {
        return Some(format!("annotation {gone} dropped"));
    }
    for field in class.fields.iter().filter(|field| field.access & ACC_SYNTHETIC == 0) {
        let Some(source) = info.fields.iter().find(|source| source.name == field.name) else { continue };
        let Some(kind) = descriptor_type(&field.descriptor) else { return Some(format!("field {} descriptor", field.name)) };
        if !same_type(&source.kind, &kind) {
            return Some(format!("field {} type {}", field.name, kind.name()));
        }
        if field.access & FIELD_ACCESS != field_access(source) {
            return Some(format!("field {} access", field.name));
        }
        let written = if source.flags & flag::ENUM != 0 { constant_annotations(file, declaration, &field.name) } else { source.annotations.clone() };
        let implied = components.contains(&field.name);
        if let Some(extra) = unkept(&written, &field.annotations, index).filter(|_| !implied) {
            return Some(format!("field {} annotation {extra}", field.name));
        }
        if let Some(gone) = dropped(&written, &field.annotations, index, "FIELD").filter(|_| !implied) {
            return Some(format!("field {} annotation {gone} dropped", field.name));
        }
    }
    for method in class.methods.iter().filter(|method| method.access & (ACC_SYNTHETIC | ACC_BRIDGE) == 0 && method.name != "<clinit>") {
        let constructor = method.name == "<init>";
        if constructor && (local || !matches!(declaration.kind(), "class_declaration" | "enum_declaration" | "record_declaration")) {
            continue;
        }
        let Some((mut parameters, returns)) = descriptor_method(&method.descriptor) else { return Some(format!("method {} descriptor", method.name)) };
        let hidden = if !constructor {
            0
        } else if declaration.kind() == "enum_declaration" {
            2
        } else {
            usize::from(class.nested.is_some_and(|access| access & ACC_STATIC == 0) && declaration.kind() == "class_declaration")
        };
        parameters.drain(..hidden.min(parameters.len()));
        let candidates: Vec<&Method> = info.methods.iter().filter(|source| source.name == method.name && source.parameters.len() == parameters.len()).collect();
        if candidates.is_empty() && !constructor {
            continue;
        }
        let matching = candidates.into_iter().find(|source| {
            source.parameters.iter().zip(&parameters).all(|(left, right)| same_type(left, right)) && (constructor || same_type(&source.returns, &returns))
        });
        let shown = format!("{}{}", method.name, method.descriptor);
        if matching.is_none() && added_by_javac(declaration.kind(), &method.name, &method.descriptor) {
            continue;
        }
        let Some(source) = matching else { return Some(format!("method {shown}")) };
        let mask = ACC_VARARGS | if constructor { VISIBILITY } else { METHOD_ACCESS };
        let mut expected = method_access(source, declaration.kind(), constructor) | if source.varargs { ACC_VARARGS } else { 0 };
        if constructor && expected & VISIBILITY == 0 && implicit_public_constructor(declaration) {
            expected |= 0x0001;
        }
        if method.access & mask != expected & mask {
            return Some(format!("method {shown} access"));
        }
        let implied = constructor && components.len() == parameters.len() || parameters.is_empty() && components.contains(&method.name);
        let mut written = source.detail.annotations.clone();
        written.extend(header_annotations(file, declaration, &method.name));
        if let Some(extra) = unkept(&written, &method.annotations, index).filter(|_| !implied) {
            return Some(format!("method {shown} annotation {extra}"));
        }
        let target = if constructor { "CONSTRUCTOR" } else { "METHOD" };
        if let Some(gone) = dropped(&written, &method.annotations, index, target).filter(|_| !implied) {
            return Some(format!("method {shown} annotation {gone} dropped"));
        }
    }
    None
}

/// A member javac writes into a record when the source declares no member of that signature: `equals(Object)`,
/// `hashCode()` and `toString()`. An overload of the same name and count is no reason for it to leave one out.
fn added_by_javac(kind: &str, name: &str, descriptor: &str) -> bool {
    kind == "record_declaration"
        && matches!((name, descriptor), ("equals", "(Ljava/lang/Object;)Z") | ("hashCode", "()I") | ("toString", "()Ljava/lang/String;"))
}

fn field_access(field: &Field) -> u16 {
    let bits = [(flag::PUBLIC, 0x0001), (flag::PROTECTED, 0x0004), (flag::STATIC, 0x0008), (flag::FINAL, 0x0010), (flag::VOLATILE, 0x0040)];
    let written = bits.iter().filter(|(model, _)| field.flags & model != 0).fold(0, |all, (_, bit)| all | bit);
    written | if field.is_private { ACC_PRIVATE } else { 0 }
}

/// The access bits javac gives a method of the source: an enum's constructors are private.
fn method_access(method: &Method, kind: &str, constructor: bool) -> u16 {
    let access = method.detail.access | if method.is_static { ACC_STATIC } else { 0 };
    if constructor && kind == "enum_declaration" && access & VISIBILITY == 0 { access | ACC_PRIVATE } else { access }
}

/// A class inside an interface is public, and so is the constructor javac writes for it when it declares none.
fn implicit_public_constructor(declaration: Node) -> bool {
    let in_interface = declaration.parent().is_some_and(|holder| matches!(holder.kind(), "interface_body" | "annotation_type_body"));
    let declares = super::processor_audit::body_members(declaration).iter().any(|member| member.kind() == "constructor_declaration");
    in_interface && !declares
}

/// Annotations the grammar leaves outside a method's modifiers: those written after its type parameters.
fn header_annotations(file: &SourceFile, declaration: Node, name: &str) -> Vec<String> {
    let mut found = Vec::new();
    let named = |member: &Node| member.child_by_field_name("name").is_some_and(|found| file.text_of(found) == name);
    for member in super::processor_audit::body_members(declaration).into_iter().filter(|member| member.kind() == "method_declaration" && named(member)) {
        for part in named_children(member).into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")) {
            found.extend(part.child_by_field_name("name").map(|written| file.text_of(written).to_string()));
        }
    }
    found
}

/// The annotations written on an enum constant, which the type index does not keep.
fn constant_annotations(file: &SourceFile, declaration: Node, name: &str) -> Vec<String> {
    let Some(body) = body_of(declaration) else { return Vec::new() };
    let constant = named_children(body).into_iter().find(|part| part.kind() == "enum_constant" && part.child_by_field_name("name").is_some_and(|found| file.text_of(found) == name));
    constant.map(|node| crate::java::helpers::annotation_names(file, node).into_iter().map(String::from).collect()).unwrap_or_default()
}

/// The superclass, the interfaces and the class's own `final`, `abstract`, `static` and visibility, against the source.
/// Anonymous classes and enum constant bodies extend what they instantiate; local classes carry no visibility.
fn class_difference(declaration: Node, info: &ClassInfo, class: &CompiledClass, local: bool) -> Option<String> {
    let kind = declaration.kind();
    if !super::processor_audit::TYPE_KINDS.contains(&kind) {
        return None;
    }
    let dotted = |name: &String| name.replace('$', ".");
    let implied_super = match kind {
        "enum_declaration" => "java.lang.Enum",
        "record_declaration" => "java.lang.Record",
        _ => crate::java::types::model::OBJECT,
    };
    let wanted = info.superclass.clone().filter(|_| kind == "class_declaration").unwrap_or_else(|| implied_super.to_string());
    let superclass = class.superclass.as_ref().map(dotted).unwrap_or_default();
    if !same_name(&wanted, &superclass) {
        return Some(format!("superclass {superclass}"));
    }
    let interfaces: Vec<String> = class.interfaces.iter().map(dotted).collect();
    let listed = interfaces.len() == info.interfaces.len() && info.interfaces.iter().zip(&interfaces).all(|(left, right)| same_name(left, right));
    if !listed {
        return Some(format!("interfaces {}", interfaces.join(",")));
    }
    let has = |word: &str| crate::java::helpers::has_modifier(declaration, word);
    let interface = matches!(kind, "interface_declaration" | "annotation_type_declaration");
    let access = class.nested.unwrap_or(class.access);
    let mut checked = ACC_FINAL | ACC_ABSTRACT;
    let mut expected = 0;
    if has("final") || kind == "record_declaration" {
        expected |= ACC_FINAL;
    }
    if has("abstract") || interface {
        expected |= ACC_ABSTRACT;
    }
    if kind == "enum_declaration" {
        checked = 0;
    }
    if !local {
        let in_interface = declaration.parent().is_some_and(|holder| matches!(holder.kind(), "interface_body" | "annotation_type_body"));
        let nested = class.nested.is_some();
        checked |= if nested { VISIBILITY | ACC_STATIC } else { ACC_PUBLIC };
        for (word, bit) in [("public", ACC_PUBLIC), ("private", ACC_PRIVATE), ("protected", 0x0004), ("static", ACC_STATIC)] {
            if has(word) {
                expected |= bit;
            }
        }
        if nested && (in_interface || interface || matches!(kind, "enum_declaration" | "record_declaration")) {
            expected |= ACC_STATIC;
        }
        if nested && in_interface {
            expected |= ACC_PUBLIC;
        }
    }
    (access & checked != expected & checked).then(|| "class access".to_string())
}

fn same_name(source: &str, compiled: &str) -> bool {
    source == "?" || source == compiled || compiled.ends_with(&format!(".{source}"))
}

/// The first annotation the source writes that javac would have kept and did not: only annotation types read from
/// class files, whose retention and targets the index knows, and that may sit where they are written.
fn dropped(written: &[String], kept: &[String], index: &TypeIndex, target: &str) -> Option<String> {
    let kept: Vec<String> = kept.iter().map(|name| name.replace('$', ".")).collect();
    written.iter().find(|name| {
        let Some(info) = index.get(name) else { return false };
        let known = info.flags & flag::ANNOTATION != 0 && info.flags & (flag::SOURCE | flag::SOURCE_RETENTION) == 0;
        let allowed = info.targets.is_none_or(|bits| bits & crate::java::types::model::target::bit(target) != 0);
        let held = kept.iter().any(|found| found == *name || index.get(found).is_some_and(|holder| holder.methods.iter().any(|method| method.name == "value" && matches!(&method.returns, Type::Array(element) if element.name().replace('$', ".") == **name))));
        known && allowed && !held
    }).cloned()
}

/// The first annotation javac kept that the source does not write. Repeated annotations come back as their container.
fn unkept(written: &[String], kept: &[String], index: &TypeIndex) -> Option<String> {
    let names = |name: &str, written: &str| name == written || name.ends_with(&format!(".{written}"));
    let holds = |name: &str| written.iter().any(|written| names(name, written));
    let container = |name: &str| {
        index.get(name).is_some_and(|info| {
            info.methods.iter().any(|method| method.name == "value" && matches!(&method.returns, Type::Array(element) if holds(&element.name().replace('$', "."))))
        })
    };
    kept.iter().map(|name| name.replace('$', ".")).find(|name| !holds(name) && !container(name))
}

/// The same erased type, or one the index could not resolve whose written name ends the class-file name.
fn same_type(source: &Type, compiled: &Type) -> bool {
    match (source, compiled) {
        (Type::Array(left), Type::Array(right)) => same_type(left, right),
        (Type::Class(name, _), Type::Class(found, _)) => {
            let found = found.replace('$', ".");
            name == "?" || *name == found || found.ends_with(&format!(".{name}"))
        }
        (Type::Class(name, _), _) => name == "?",
        _ => source.erased().name() == compiled.name(),
    }
}

/// The class files beside the top-level class `top` whose names start with its own and that no class of the file
/// accounts for. javac's own helper classes (switch maps, access tags) are synthetic and do not count.
pub fn unaccounted(top: &str, binaries: &[String], directories: &[PathBuf]) -> Vec<String> {
    let relative = top.replace('.', "/");
    let Some(directory) = directories.iter().map(|root| root.join(format!("{relative}.class"))).find(|path| path.is_file()).and_then(|path| path.parent().map(PathBuf::from)) else {
        return Vec::new();
    };
    let simple = top.rsplit('.').next().unwrap_or(top);
    let package = top.strip_suffix(simple).unwrap_or_default();
    let Ok(entries) = std::fs::read_dir(&directory) else { return Vec::new() };
    let mut found: Vec<String> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| entry.file_name().to_str().and_then(|name| name.strip_suffix(".class")).map(String::from))
        .filter(|stem| stem.strip_prefix(simple).is_some_and(|rest| rest.starts_with('$')))
        .map(|stem| format!("{package}{stem}"))
        .filter(|binary| !binaries.contains(binary))
        .filter(|binary| class_file(binary, directories).is_some_and(|class| class.access & ACC_SYNTHETIC == 0 && class.nested.is_some()))
        .collect();
    found.sort();
    found
}
