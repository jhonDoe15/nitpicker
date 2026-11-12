from design.callables.callablefacts import bare_fact, callable_fact
from design.callables.entries import find_callbacks, module_functions
from design.project_index import Index
from design.types.typefacts import module_types

DESIGN_REPORT = "design-facts.json"


def module_entry(module, options):
    entry = (
        module.has_main_guard
        or module.path.endswith("__main__.py")
        or module.path in set(options.get("entryFiles", []))
    )
    fact = {"file": module.path, "role": "production"}
    if entry:
        fact["entry"] = True
    return fact


def module_callables(index, module):
    facts = [guarded_fact(index, function) for function in module_functions(module)]
    return sorted(facts, key=lambda fact: (fact["line"], fact["id"]))


def guarded_fact(index, function):
    try:
        return callable_fact(index, function)
    except RecursionError:
        return bare_fact(function)


def keep_known(facts, key, ids):
    for fact in (fact for fact in facts if key in fact):
        known = [i for i in fact[key] if i in ids]
        if known:
            fact[key] = known
        else:
            del fact[key]


def project_index(project, options, contexts):
    tests = set(options.get("testFiles", []))
    production = [c for path, c in contexts.items() if path not in tests]
    index = Index(project, production)
    index.entry_files = set(options.get("entryFiles", []))
    index.distributions = options.get("distributions", [])
    index.callbacks = find_callbacks(index)
    return index


def build_facts(project, options):
    paths = options.get("designFiles", [])
    contexts = {
        path: project.contexts[path] for path in paths if path in project.contexts
    }
    index = project_index(project, options, contexts)
    tests = set(options.get("testFiles", []))
    modules = [{"file": p, "role": "test"} for p in contexts if p in tests]
    types, callables = [], []
    for module in index.modules.values():
        modules.append(module_entry(module, options))
        types.extend(module_types(index, module))
        callables.extend(module_callables(index, module))
    modules.sort(key=lambda fact: fact["file"])
    keep_known(types + callables, "references", {fact["id"] for fact in callables})
    keep_known(types, "supertypes", {fact["id"] for fact in types})
    return {"modules": modules, "types": types, "callables": callables}
