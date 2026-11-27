//! Fields: those a type body declares, those an access names through a qualifier (`o.f`, `C.F`), and those a type
//! inherits from a supertype, which hide a variable of the same name around the type.
use super::Walk;
use crate::java::types::model::{ClassInfo, Field, flag};
use std::collections::HashMap;

const BODIES: [&str; 4] = ["ClassBody", "EnumBody", "RecordBody", "AnnotationTypeBody"];

impl Walk<'_, '_, '_, '_> {
    pub fn type_fields(&self, body: u32) -> Vec<(String, u32)> {
        let ctx = self.ctx;
        let mut fields = Vec::new();
        let mut add = |variable: u32| fields.push((ctx.text(variable, "Name"), variable));
        if let Some(components) = ctx.parent(body).and_then(|owner| ctx.kid(owner, "RecordComponentList")) {
            for component in ctx.kids_named(components, "RecordComponent") {
                ctx.kid(component, "VariableId").into_iter().for_each(&mut add);
            }
        }
        for member in ctx.kids(body).iter().copied() {
            match ctx.name(member) {
                "FieldDeclaration" => {
                    for declarator in ctx.kids_named(member, "VariableDeclarator") {
                        ctx.kid(declarator, "VariableId").into_iter().for_each(&mut add);
                    }
                }
                "EnumConstant" => ctx.kid(member, "VariableId").into_iter().for_each(&mut add),
                _ => {}
            }
        }
        fields
    }

    /// The fields of every type declared in the file, by the name the type index knows the type by; local and
    /// anonymous classes included.
    pub fn types_in_file(&self) -> HashMap<String, Vec<(String, u32)>> {
        let ctx = self.ctx;
        let mut types = HashMap::new();
        for name in BODIES {
            for &body in ctx.all(name) {
                let Some(owner) = ctx.parent(body) else { continue };
                for key in [ctx.class_name(owner).unwrap_or_default(), ctx.text(owner, "CanonicalName")] {
                    if !key.is_empty() {
                        types.entry(key).or_insert_with(|| self.type_fields(body));
                    }
                }
            }
        }
        types
    }

    fn in_file(&self, info: &ClassInfo, name: &str) -> Option<u32> {
        let fields = self.types.get(&info.name).or_else(|| self.types.get(&info.name.replace('$', ".")))?;
        fields.iter().find(|(known, _)| known == name).map(|(_, variable)| *variable)
    }

    pub fn qualified(&mut self) {
        let ctx = self.ctx;
        for &access in ctx.all("FieldAccess") {
            if self.found.declared.contains_key(&access) {
                continue;
            }
            let Some(owner) = ctx.nth(access, 0).and_then(|qualifier| ctx.type_of(qualifier)) else { continue };
            let name = ctx.text(access, "Name");
            let class = owner.erased().name();
            let own = self.types.get(&class).and_then(|fields| fields.iter().find(|(known, _)| *known == name)).map(|(_, at)| *at);
            let inherited = || ctx.machine.resolver.index.field(&class, &name).and_then(|(info, _)| self.in_file(info, &name));
            if let Some(variable) = own.or_else(inherited) {
                self.bind(access, variable);
            }
        }
    }

    /// When a type body between an access and the variable it seems to name (or any body around it, when no
    /// variable of that name is in scope) inherits a field of that name, the access names that field instead:
    /// `Some` of the field when the file declares it.
    pub fn inherited(&self, access: u32, variable: Option<u32>, name: &str) -> Option<Option<u32>> {
        let ctx = self.ctx;
        let holders: Vec<u32> = variable.map(|variable| ctx.ancestors(variable).collect()).unwrap_or_default();
        for body in ctx.ancestors(access).take_while(|at| !holders.contains(at)) {
            let Some(owner) = ctx.parent(body).filter(|_| BODIES[..3].contains(&ctx.name(body))) else { continue };
            let supertypes: Vec<u32> = match ctx.name(owner) {
                "AnonymousClassDeclaration" => ctx.parent(owner).into_iter().collect(),
                "ClassDeclaration" | "EnumDeclaration" | "RecordDeclaration" => ["ExtendsList", "ImplementsList"]
                    .iter()
                    .filter_map(|list| ctx.kid(owner, list))
                    .flat_map(|list| ctx.kids(list).to_vec())
                    .collect(),
                _ => Vec::new(),
            };
            let resolver = ctx.machine.resolver;
            let found = supertypes.iter().find_map(|written| {
                ctx.type_of(*written)
                    .and_then(|kind| resolver.index.field(&kind.erased().name(), name))
                    .filter(|found| self.visible(access, *found))
            });
            if let Some((info, _)) = found {
                return Some(self.in_file(info, name));
            }
        }
        None
    }

    /// Whether an inherited field is visible where it is named: private fields within their own top-level class.
    fn visible(&self, access: u32, (info, field): (&ClassInfo, &Field)) -> bool {
        let ctx = self.ctx;
        let resolver = ctx.machine.resolver;
        let top = ctx
            .ancestors(access)
            .filter(|at| super::super::ctx::TYPE_DECLARATIONS.contains(&ctx.name(*at)))
            .last()
            .map(|at| match resolver.scope.package.as_str() {
                "" => ctx.text(at, "SimpleName"),
                package => format!("{package}.{}", ctx.text(at, "SimpleName")),
            });
        let open = info.is_interface || field.flags & (flag::PUBLIC | flag::PROTECTED) != 0;
        let within = top.as_ref().is_some_and(|top| {
            info.name == *top || info.name.strip_prefix(top.as_str()).is_some_and(|rest| rest.starts_with('.'))
        });
        within || (!field.is_private && (open || info.package == resolver.scope.package))
    }

    /// A field of this file that a static import brings in: single imports first, then imports on demand.
    pub fn imported(&self, name: &str) -> Option<u32> {
        let ctx = self.ctx;
        let index = &ctx.machine.resolver.index;
        let imports: Vec<u32> = ctx.all("ImportDeclaration").iter().copied().filter(|at| ctx.flag(*at, "Static")).collect();
        let single = imports.iter().filter(|at| !ctx.flag(**at, "ImportOnDemand")).find_map(|at| {
            let imported = ctx.text(*at, "ImportedName");
            imported.rsplit_once('.').filter(|(_, simple)| *simple == name).map(|(class, _)| class.to_string())
        });
        let classes: Vec<String> = match single {
            Some(class) => vec![class],
            None => imports.iter().filter(|at| ctx.flag(**at, "ImportOnDemand")).map(|at| ctx.text(*at, "ImportedName")).collect(),
        };
        classes.iter().find_map(|class| {
            let (info, field) = index.field(class, name)?;
            (field.flags & flag::STATIC != 0 && !field.is_private).then(|| self.in_file(info, name)).flatten()
        })
    }
}
