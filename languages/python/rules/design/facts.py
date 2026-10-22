from design.callablefacts import callable_fact
from design.entries import find_callbacks
from design.index import Index
from design.typefacts import module_types

DESIGN_REPORT = "design-facts.json"


class DesignError(Exception):
    pass


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
    functions = list(module.all_functions)
    for klass in module.classes.values():
        for nested in klass.all_classes():
            functions.extend(nested.functions)
    facts = []
    for function in functions:
        try:
            facts.append(callable_fact(index, function))
        except RecursionError as error:
            raise DesignError(f"{function.id}: {type(error).__name__}") from error
    return sorted(facts, key=lambda fact: (fact["line"], fact["id"]))


def build_facts(project, options):
    paths = options.get("designFiles", [])
    tests = set(options.get("testFiles", []))
    contexts = {
        path: project.contexts[path] for path in paths if path in project.contexts
    }
    production = [c for path, c in contexts.items() if path not in tests]
    index = Index(project, production)
    index.entry_files = set(options.get("entryFiles", []))
    index.distributions = options.get("distributions", [])
    index.callbacks = find_callbacks(index)
    modules = [{"file": p, "role": "test"} for p in contexts if p in tests]
    types, callables = [], []
    for module in index.modules.values():
        modules.append(module_entry(module, options))
        types.extend(module_types(index, module))
        callables.extend(module_callables(index, module))
    modules.sort(key=lambda fact: fact["file"])
    return {"modules": modules, "types": types, "callables": callables}
