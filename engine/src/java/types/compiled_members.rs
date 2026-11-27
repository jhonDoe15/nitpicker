//! The members Lombok wrote, from the build's class files into the type index: methods marked `@lombok.Generated`
//! and the member classes Lombok wrote whole, such as builders.
use super::compiled::{ACC_PRIVATE, CompiledClass};
use super::index::TypeIndex;
use super::model::ClassInfo;
use std::collections::HashMap;

const ACC_SYNTHETIC: u16 = 0x1000;

/// Adds to a source class the methods Lombok wrote that the source does not declare. The type index reads the
/// methods of a class file that are neither private nor synthetic, in class-file order. The default constructor
/// the source implies goes when the class file has no constructor without arguments: Lombok wrote another.
pub fn add_written(info: &mut ClassInfo, class: &CompiledClass) {
    let Some(read) = &class.info else { return };
    let listed = class.methods.iter().filter(|method| method.access & (ACC_PRIVATE | ACC_SYNTHETIC) == 0 && method.name != "<clinit>");
    for (compiled, method) in listed.zip(&read.methods) {
        let known = info.methods.iter().any(|other| other.name == method.name && other.parameters == method.parameters);
        if compiled.generated && !known {
            info.methods.push(method.clone());
        }
    }
    let inner = class.nested.is_some_and(|access| access & super::compiled::ACC_STATIC == 0);
    let no_arguments = class.methods.iter().any(|method| {
        method.name == "<init>" && super::compiled::shown_parameters(&method.descriptor).len() == usize::from(inner)
    });
    if !no_arguments {
        info.methods.retain(|method| method.name != "<init>" || !method.parameters.is_empty());
    }
}

/// Puts the member classes Lombok wrote, at any depth, into the type index under their index names.
pub fn add_written_classes(index: &mut TypeIndex, compiled: &HashMap<String, CompiledClass>, binaries: &mut HashMap<String, String>) {
    let mut pending: Vec<(String, String)> = binaries.iter().map(|(binary, name)| (binary.clone(), name.clone())).collect();
    while let Some((binary, name)) = pending.pop() {
        let Some(class) = compiled.get(&binary) else { continue };
        for member in &class.members {
            let Some(written) = compiled.get(member).filter(|written| written.generated) else { continue };
            let Some(info) = written.info.clone() else { continue };
            let simple = member.rsplit('$').next().unwrap_or(member);
            let named = format!("{name}.{simple}");
            if binaries.contains_key(member) || index.get(&named).is_some() {
                continue;
            }
            index.put(ClassInfo { name: named.clone(), ..info });
            binaries.insert(member.clone(), named.clone());
            pending.push((member.clone(), named));
        }
    }
}
