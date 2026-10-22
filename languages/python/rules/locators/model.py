INSTANCE_LIBRARIES = {
    "injector": {
        "display": "injector.Injector",
        "classes": ("injector.Injector",),
        "instances": (),
        "methods": ("get", "create_object"),
        "subscript": False,
    },
    "punq": {
        "display": "punq.Container",
        "classes": ("punq.Container",),
        "instances": (),
        "methods": ("resolve", "resolve_all", "instantiate"),
        "subscript": False,
    },
    "lagom": {
        "display": "lagom.Container",
        "classes": ("lagom.Container", "lagom.container.Container"),
        "instances": (),
        "methods": ("resolve",),
        "subscript": True,
    },
    "kink": {
        "display": "kink.di",
        "classes": ("kink.Container", "kink.container.Container"),
        "instances": ("kink.di", "kink.container.di"),
        "methods": (),
        "subscript": True,
    },
}

PROVIDER_LIBRARIES = {
    "dependency_injector": {
        "bases": (
            "dependency_injector.containers.DeclarativeContainer",
            "dependency_injector.containers.DynamicContainer",
        ),
        "providers": "dependency_injector.providers.",
        "methods": (),
        "class_methods": (),
    },
    "that_depends": {
        "bases": ("that_depends.BaseContainer", "that_depends.container.BaseContainer"),
        "providers": "that_depends.providers.",
        "methods": ("resolve", "resolve_sync"),
        "class_methods": ("resolve", "resolver"),
    },
}

SERVICE_PROVIDERS = {
    "Factory",
    "Singleton",
    "ThreadSafeSingleton",
    "ThreadLocalSingleton",
    "ContextLocalSingleton",
    "Callable",
    "Coroutine",
    "Resource",
    "ContextLocalResource",
    "Object",
    "Dependency",
    "ExternalDependency",
    "Selector",
    "Aggregate",
    "AsyncFactory",
    "AsyncSingleton",
    "ContextResource",
    "FactoryAggregate",
    "DelegatedSingleton",
    "DelegatedThreadSafeSingleton",
    "DelegatedThreadLocalSingleton",
    "DelegatedFactory",
    "AbstractFactory",
    "AbstractSingleton",
    "Container",
    "List",
    "Dict",
}

COMPOSITION_BASES = {"injector.Module", "injector.Provider"}

REGISTRATION_METHODS = {"register", "define", "partial", "bind", "multibind", "factory", "singleton"}
REGISTRATION_ATTRIBUTES = {"factories", "services", "binder"}
UNION_WRAPPERS = {"Optional", "Union", "Annotated"}
OWNER_NAMES = {"self", "cls"}
