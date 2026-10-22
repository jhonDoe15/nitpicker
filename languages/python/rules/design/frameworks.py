HTTP_VERBS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}
FRAMEWORKS = [
    (
        ("unittest",),
        {"TestCase", "IsolatedAsyncioTestCase"},
        {
            "setUp",
            "tearDown",
            "setUpClass",
            "tearDownClass",
            "asyncSetUp",
            "asyncTearDown",
            "run",
        },
        ("test",),
    ),
    (("threading", "multiprocessing"), {"Thread", "Process"}, {"run"}, ()),
    (
        ("json",),
        {"JSONEncoder", "JSONDecoder"},
        {"default", "encode", "iterencode", "decode", "raw_decode"},
        (),
    ),
    (
        ("logging",),
        {"Handler", "StreamHandler", "FileHandler", "Filter", "Formatter"},
        {
            "emit",
            "handle",
            "filter",
            "format",
            "formatTime",
            "formatException",
            "flush",
            "close",
        },
        (),
    ),
    (
        ("ast",),
        {"NodeVisitor", "NodeTransformer"},
        {"visit", "generic_visit"},
        ("visit_",),
    ),
    (
        ("http",),
        {"BaseHTTPRequestHandler", "SimpleHTTPRequestHandler"},
        {"log_message", "handle"},
        ("do_",),
    ),
    (("html",), {"HTMLParser"}, set(), ("handle_",)),
    (
        ("cmd",),
        {"Cmd"},
        {"default", "emptyline", "precmd", "postcmd", "preloop", "postloop"},
        ("do_", "help_", "complete_"),
    ),
    (
        ("socketserver",),
        {"BaseRequestHandler", "StreamRequestHandler"},
        {"handle", "setup", "finish"},
        (),
    ),
    (
        ("asyncio",),
        {"Protocol", "DatagramProtocol", "BaseProtocol"},
        {
            "connection_made",
            "connection_lost",
            "data_received",
            "eof_received",
            "datagram_received",
        },
        (),
    ),
    (
        ("django",),
        {"Model"},
        {"save", "delete", "clean", "full_clean", "get_absolute_url"},
        (),
    ),
    (
        ("django",),
        {
            "View",
            "TemplateView",
            "ListView",
            "DetailView",
            "CreateView",
            "UpdateView",
            "DeleteView",
            "FormView",
        },
        HTTP_VERBS
        | {
            "dispatch",
            "setup",
            "get_context_data",
            "get_queryset",
            "get_object",
            "form_valid",
            "form_invalid",
            "get_success_url",
        },
        (),
    ),
    (("django",), {"BaseCommand"}, {"handle", "add_arguments"}, ()),
    (("django",), {"Form", "ModelForm"}, {"save", "clean"}, ("clean_",)),
    (
        ("django",),
        {"ModelAdmin", "AppConfig", "Field"},
        {
            "ready",
            "save_model",
            "get_queryset",
            "has_add_permission",
            "has_change_permission",
            "has_delete_permission",
            "from_db_value",
            "to_python",
            "get_prep_value",
        },
        (),
    ),
    (
        ("rest_framework",),
        {
            "APIView",
            "ViewSet",
            "GenericViewSet",
            "ModelViewSet",
            "GenericAPIView",
            "ReadOnlyModelViewSet",
        },
        HTTP_VERBS
        | {
            "list",
            "create",
            "retrieve",
            "update",
            "partial_update",
            "destroy",
            "get_queryset",
            "get_serializer_class",
            "perform_create",
            "perform_update",
            "perform_destroy",
            "get_permissions",
        },
        (),
    ),
    (
        ("rest_framework",),
        {"Serializer", "ModelSerializer"},
        {"create", "update", "validate", "to_representation", "to_internal_value"},
        ("validate_",),
    ),
    (("flask",), {"MethodView", "Flask"}, HTTP_VERBS | {"dispatch_request"}, ()),
    (("torch",), {"Module"}, {"forward"}, ()),
    (
        ("enum",),
        {"Enum", "IntEnum", "StrEnum", "Flag", "IntFlag"},
        {"_generate_next_value_", "_missing_"},
        (),
    ),
]


def framework_match(name, method):
    root, last = name.split(".")[0], name.rsplit(".", 1)[-1]
    for roots, classes, members, prefixes in FRAMEWORKS:
        if root in roots and last in classes:
            if method in members or method.startswith(prefixes):
                return True
    return False
