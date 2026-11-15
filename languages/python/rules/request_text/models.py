import ast

from signatures.annotations import members_of

STRIP_NAMES = {"str_strip_whitespace", "anystr_strip_whitespace"}
CONSTRAINT = "strip_whitespace"


def class_index(project):
    def build(_):
        index = {}
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.ClassDef):
                    index.setdefault(node.name, node)
        return index

    return project.memo("request-model-classes", build)


def is_true(node):
    return isinstance(node, ast.Constant) and node.value is True


def sets_strip(cls):
    for node in ast.walk(cls):
        if isinstance(node, ast.keyword) and node.arg in STRIP_NAMES and is_true(node.value):
            return True
        if isinstance(node, ast.Assign) and is_true(node.value):
            if any(isinstance(target, ast.Name) and target.id in STRIP_NAMES for target in node.targets):
                return True
    return False


def base_classes(cls, index):
    names = [base.id if isinstance(base, ast.Name) else getattr(base, "attr", "") for base in cls.bases]
    return [index[name] for name in names if name in index and index[name] is not cls]


def lineage(cls, index):
    chain = [cls]
    for each in chain:
        chain.extend(base for base in base_classes(each, index) if base not in chain)
    return chain


def strips_every_string(cls, index):
    return any(sets_strip(each) for each in lineage(cls, index))


def text_fields(cls, index):
    fields = set()
    for each in lineage(cls, index):
        for node in each.body:
            if (
                isinstance(node, ast.AnnAssign)
                and isinstance(node.target, ast.Name)
                and members_of(node.annotation) == ["str"]
                and CONSTRAINT not in ast.unparse(node.annotation)
            ):
                fields.add(node.target.id)
    return fields


def model_of(annotation, project):
    members = [name for name in members_of(annotation) if name != "None"]
    index = class_index(project)
    return index.get(members[0]) if len(members) == 1 else None
