from collections import Counter

from checks.common import finding
from route_auth.common import MINIMUM, THRESHOLD
from route_auth.drf_views import drf_handlers
from route_auth.fastapi_routes import fastapi_handlers
from route_auth.flask_routes import flask_handlers

GUARDED = True
RULE = "route-without-auth"
FRAMEWORKS = {
    "FastAPI": (fastapi_handlers, "Depends({})"),
    "Django REST framework": (drf_handlers, "permission_classes with {}"),
    "Flask": (flask_handlers, "@{}"),
}


def handlers_of(context, framework):
    reader = FRAMEWORKS[framework][0]
    return context.project.memo(
        ("route-handlers", framework, context.path), lambda _: reader(context)
    )


def majority(project, framework):
    def build(_):
        counted = [
            handler
            for context in project.contexts.values()
            if not context.tests
            for handler in handlers_of(context, framework)
            if not handler.public
        ]
        guarded = [handler for handler in counted if handler.auth]
        if len(counted) < MINIMUM or len(guarded) == len(counted):
            return None
        if len(guarded) / len(counted) < THRESHOLD:
            return None
        names = Counter(name for handler in guarded for name in handler.auth)
        shape = FRAMEWORKS[framework][1].format(names.most_common(1)[0][0])
        return shape, len(guarded), len(counted)

    return project.memo(("route-auth-majority", framework), build)


def check(context):
    if context.tests:
        return []
    found = []
    for framework in FRAMEWORKS:
        shape = majority(context.project, framework)
        if shape is None:
            continue
        for handler in handlers_of(context, framework):
            if handler.auth or handler.public:
                continue
            subject = f"{handler.name}|{framework}|{shape[0]}|{shape[1]} of {shape[2]}"
            found.append(finding(context.path, RULE, subject, handler.node))
    return found
