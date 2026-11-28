//! Which methods of the run have no side effect, once every file is read, and the no-side-effect findings that
//! waited for it. A body without effects stays so while every method it calls has none (calls that go round in a
//! circle included). A call on an object runs any override: the method and every override below it with code must
//! have no effect, and there must be one. SpotBugs takes as having an effect a call that can run only a stub, a call
//! of an abstract method with a `throws` clause, and a method of the run that implements a JDK interface method. A
//! reported call of a static method or constructor must also run no static initializer with an effect. A JDK method
//! a class inherits is known to SpotBugs only when the code of the run names its class.
//! FindSelfComparison2 findings wait on whether a call can have an effect, judged the same way (`Wait::Stale`).
use super::effects::{Key, Summary};
use crate::engine::finding::Finding;
use crate::java::types::index::TypeIndex;
use crate::java::types::model::{Method, Type};
use crate::java::types::project::JavaProject;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

/// What a waiting finding needs from the whole run.
pub enum Wait {
    /// The method of the run it calls has no side effect.
    Run(Key),
    /// The code of the run names the JDK class that declares the method it calls, so SpotBugs reads that class.
    Referenced(String),
    /// FindSelfComparison2: calls made a value read from the field out of date. It counts when the run stores into
    /// the field outside constructors and initializers, and a call surely has an effect or one of the run has.
    Stale { field: (String, String), calls: Vec<Key>, certain: bool },
}

#[derive(Default)]
pub struct Effects {
    summaries: Mutex<Vec<Summary>>,
    referenced: Mutex<HashSet<String>>,
    waiting: Mutex<Vec<(Wait, Finding)>>,
    /// The summaries as FindSelfComparison2 judges them (`effects::summaries` lenient).
    quiet: Mutex<Vec<Summary>>,
    /// The fields of the run stored into outside constructors and initializers.
    written: Mutex<HashSet<(String, String)>>,
}

/// The methods each class of the run declares, by name and parameters (also those of a method above it that it
/// overrides through a bridge), whether each has code, and its own parameters.
struct Declared {
    by_name: HashMap<(String, String), Vec<(String, bool, String)>>,
}

impl Declared {
    fn of(project: &JavaProject) -> Self {
        let mut by_name: HashMap<(String, String), Vec<(String, bool, String)>> = HashMap::new();
        for class in project.sources.keys() {
            let Some(info) = project.index.get(class) else { continue };
            for method in info.methods.iter().filter(|method| !method.is_static && !method.is_private && method.name != "<init>") {
                let own = super::jdk::parameters(&method.parameters);
                let mut keys = vec![own.clone()];
                for above in project.index.lineage(class).iter().filter(|above| *above != class) {
                    let Some(upper) = project.index.get(above) else { continue };
                    for other in upper.methods.iter().filter(|other| bridged(method, other)) {
                        keys.push(super::jdk::parameters(&other.parameters));
                    }
                }
                keys.sort();
                keys.dedup();
                for parameters in keys {
                    by_name.entry((method.name.clone(), parameters)).or_default().push((class.clone(), !method.is_abstract, own.clone()));
                }
            }
        }
        Declared { by_name }
    }

    fn below<'d>(&'d self, index: &'d TypeIndex, key: &'d Key) -> impl Iterator<Item = &'d (String, bool, String)> + 'd {
        let (class, name, parameters) = key;
        self.by_name.get(&(name.clone(), parameters.clone())).into_iter().flatten().filter(move |(other, _, _)| index.is_subtype(other, class))
    }
}

/// Whether a method overrides one above it whose parameters javac erases otherwise, through a bridge method: same
/// name and number of parameters, each the same once erased or a type variable above.
pub fn bridged(method: &Method, above: &Method) -> bool {
    let differs = super::jdk::parameters(&method.parameters) != super::jdk::parameters(&above.parameters);
    differs && method.name == above.name && !above.is_static && !above.is_private && method.parameters.len() == above.parameters.len()
        && method.parameters.iter().zip(&above.parameters).zip(&above.generic_parameters).all(|((own, erased), generic)| {
            own.erased() == erased.erased() || matches!(generic, Type::Variable(_))
        })
}

struct Judge<'p> {
    index: &'p TypeIndex,
    declared: &'p Declared,
    clean: HashSet<Key>,
    summaries: &'p HashMap<Key, Summary>,
}

impl Judge<'_> {
    /// Whether a JDK interface above the method's class declares it.
    fn implements_jdk(&self, key: &Key) -> bool {
        let (class, name, parameters) = key;
        self.index.lineage(class).iter().filter(|above| *above != class && !self.index.from_source(above)).any(|above| {
            self.index.get(above).is_some_and(|info| {
                info.is_interface && info.methods.iter().any(|method| method.name == *name && super::jdk::parameters(&method.parameters) == *parameters)
            })
        })
    }

    /// Whether SpotBugs takes the method as a stub that code outside the run overrides: it only returns a default
    /// value, may be overridden, and is the only code of the run for each interface method it implements.
    fn stub(&self, key: &Key) -> bool {
        let (class, name, parameters) = key;
        self.summaries.get(key).is_some_and(|summary| summary.open_default)
            && self.index.lineage(class).iter().filter(|above| *above != class && self.index.from_source(above)).all(|above| {
                let declares = self.index.get(above).is_some_and(|info| {
                    info.is_interface && info.methods.iter().any(|method| method.name == *name && super::jdk::parameters(&method.parameters) == *parameters)
                });
                let top = (above.clone(), name.clone(), parameters.clone());
                !declares || self.declared.below(self.index, &top).filter(|(_, code, _)| *code).count() == 1
            })
    }

    fn direct(&self, key: &Key) -> bool {
        self.clean.contains(key) && !self.stub(key)
    }

    /// Whether a call on an object of the key's class, which runs the key's method or an override, has no effect.
    fn dispatched(&self, key: &Key) -> bool {
        let (class, name, _) = key;
        if name == "<init>" {
            return self.direct(key);
        }
        let Some(info) = self.index.get(class) else { return false };
        let method = info.methods.iter().find(|method| method.name == *name && super::jdk::parameters(&method.parameters) == key.2);
        let Some(method) = method else { return false };
        if method.is_static || method.is_private || name == "<init>" {
            return self.direct(key);
        }
        if self.implements_jdk(key) || (method.is_abstract && !method.throws.is_empty()) {
            return false;
        }
        let targets: Vec<Key> = self.declared.below(self.index, key).filter(|(_, code, _)| *code).map(|(other, _, own)| (other.clone(), name.clone(), own.clone())).collect();
        match &targets[..] {
            [] => false,
            [only] => self.direct(only),
            _ => targets.iter().all(|target| self.clean.contains(target)),
        }
    }

    /// Whether a call of a static method or a constructor, which may initialize its class and the classes above it,
    /// runs no static initializer with an effect. SpotBugs asks this of the reported call only, not of the calls
    /// inside the bodies it judges.
    fn initializes_clean(&self, key: &Key) -> bool {
        let (class, name, parameters) = key;
        let starts = name == "<init>" || self.index.get(class).is_some_and(|info| info.methods.iter().any(|method| method.is_static && method.name == *name && super::jdk::parameters(&method.parameters) == *parameters));
        !starts || self.index.superclasses(class).iter().all(|above| {
            let initializer = (above.clone(), super::effects::CLINIT.to_string(), String::new());
            !self.summaries.contains_key(&initializer) || self.clean.contains(&initializer)
        })
    }

    fn settle(&mut self) {
        loop {
            let lost: Vec<Key> = self
                .clean
                .iter()
                .filter(|key| {
                    let summary = &self.summaries[*key];
                    !summary.direct_calls.iter().all(|call| self.direct(call)) || !summary.virtual_calls.iter().all(|call| self.dispatched(call))
                })
                .cloned()
                .collect();
            if lost.is_empty() {
                return;
            }
            for key in lost {
                self.clean.remove(&key);
            }
        }
    }
}

impl Effects {
    pub fn note(&self, summaries: Vec<Summary>) {
        self.summaries.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).extend(summaries);
    }

    pub fn refer(&self, classes: HashSet<String>) {
        self.referenced.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).extend(classes);
    }

    pub fn note_quiet(&self, summaries: Vec<Summary>) {
        self.quiet.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).extend(summaries);
    }

    pub fn write(&self, fields: HashSet<(String, String)>) {
        self.written.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).extend(fields);
    }

    pub fn wait(&self, waiting: Vec<(Wait, Finding)>) {
        self.waiting.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).extend(waiting);
    }

    pub fn settle(&self, project: &JavaProject, out: &mut Vec<Finding>) {
        let waiting = std::mem::take(&mut *self.waiting.lock().unwrap_or_else(|poisoned| poisoned.into_inner()));
        if waiting.is_empty() {
            return;
        }
        let summaries: HashMap<Key, Summary> = std::mem::take(&mut *self.summaries.lock().unwrap_or_else(|poisoned| poisoned.into_inner()))
            .into_iter()
            .map(|summary| (summary.key.clone(), summary))
            .collect();
        let quiet: HashMap<Key, Summary> = std::mem::take(&mut *self.quiet.lock().unwrap_or_else(|poisoned| poisoned.into_inner()))
            .into_iter()
            .map(|summary| (summary.key.clone(), summary))
            .collect();
        let clean = summaries.values().filter(|summary| summary.clean).map(|summary| summary.key.clone()).collect();
        let declared = Declared::of(project);
        let mut judge = Judge { index: &project.index, declared: &declared, clean, summaries: &summaries };
        judge.settle();
        let clean = quiet.values().filter(|summary| summary.clean && !summary.empty_void).map(|summary| summary.key.clone()).collect();
        let mut kills = Judge { index: &project.index, declared: &declared, clean, summaries: &quiet };
        kills.settle();
        let written = std::mem::take(&mut *self.written.lock().unwrap_or_else(|poisoned| poisoned.into_inner()));
        let referenced = std::mem::take(&mut *self.referenced.lock().unwrap_or_else(|poisoned| poisoned.into_inner()));
        let kept = waiting.into_iter().filter(|(wait, _)| match wait {
            Wait::Run(key) => judge.dispatched(key) && judge.initializes_clean(key),
            Wait::Referenced(class) => referenced.contains(class),
            Wait::Stale { field, calls, certain } => {
                let stored = !project.index.from_source(&field.0) || written.contains(field);
                stored && (*certain || calls.iter().any(|key| !(kills.dispatched(key) && kills.initializes_clean(key))))
            }
        });
        out.extend(kept.map(|(_, finding)| finding));
    }
}

fn class_of(kind: Option<Type>) -> Option<String> {
    match kind?.erased() {
        Type::Class(name, _) => Some(name),
        Type::Array(element) => class_of(Some(*element)),
        _ => None,
    }
}

/// The classes the compiled code of the file names: the classes the calls, field reads and `new` expressions are
/// made on, the types of casts, `instanceof`, class literals, `catch` and `throws`, and the supertypes of its classes.
pub fn referenced(context: &super::super::Context) -> std::collections::HashSet<String> {
    let resolver = context.resolver;
    let mut found: std::collections::HashSet<String> = ["java.lang.Object".to_string()].into();
    for own in context.classes.keys() {
        if let Some(info) = resolver.index.get(own) {
            found.extend(info.superclass.iter().cloned());
            found.extend(info.interfaces.iter().cloned());
        }
    }
    crate::engine::source::walk(context.file.tree.root_node(), |node| {
        let named = match node.kind() {
            "method_invocation" => resolver.resolve_call(node).map(|call| match (&call.receiver, call.method.is_static) {
                (Type::Class(name, _), false) => name.clone(),
                _ => node.child_by_field_name("object").and_then(|object| class_of(resolver.type_of(object))).filter(|_| call.method.is_static).unwrap_or(call.declaring),
            }),
            "field_access" => node.child_by_field_name("object").and_then(|object| class_of(resolver.type_of(object))),
            "object_creation_expression" | "array_creation_expression" | "cast_expression" => node.child_by_field_name("type").and_then(|kind| class_of(resolver.type_node(kind))),
            "instanceof_expression" => node.child_by_field_name("right").and_then(|kind| class_of(resolver.type_node(kind))),
            "class_literal" | "catch_type" | "throws" => {
                for kind in crate::engine::source::named_children(node) {
                    found.extend(class_of(resolver.type_node(kind)));
                }
                None
            }
            "method_reference" => node.named_child(0).and_then(|qualifier| class_of(resolver.type_of(qualifier)).or_else(|| class_of(resolver.type_node(qualifier)))),
            _ => None,
        };
        found.extend(named);
    });
    found
}
