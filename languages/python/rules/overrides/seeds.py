DJANGO_TEST_CLASSES = (
    "django.test.SimpleTestCase",
    "django.test.TestCase",
    "django.test.TransactionTestCase",
    "django.test.LiveServerTestCase",
    "django.test.testcases.SimpleTestCase",
    "django.test.testcases.TestCase",
    "django.test.testcases.TransactionTestCase",
    "django.test.testcases.LiveServerTestCase",
    "django.contrib.staticfiles.testing.StaticLiveServerTestCase",
    "rest_framework.test.APITestCase",
)
DJANGO_MODELS = ("django.db.models.Model", "django.db.models.base.Model")
DJANGO_MODEL_FORMS = ("django.forms.ModelForm", "django.forms.models.ModelForm")
COORDINATOR_ENTITY = "homeassistant.helpers.update_coordinator.CoordinatorEntity"
CLASS_FIXTURES = ("setUpClass", "tearDownClass")
TEST_CASES = (
    "unittest.TestCase",
    "unittest.IsolatedAsyncioTestCase",
    "unittest.case.TestCase",
    *DJANGO_TEST_CLASSES,
)
TEST_HOOKS = (
    "setUp",
    "tearDown",
    "setUpClass",
    "tearDownClass",
    "asyncSetUp",
    "asyncTearDown",
)

LIBRARY_CONTRACTS = {
    COORDINATOR_ENTITY: {"available": (), "async_added_to_hass": ()},
    **{name: {"save": ("save_base",)} for name in DJANGO_MODELS},
    **{name: {"clean": ()} for name in DJANGO_MODEL_FORMS},
    **{name: {hook: () for hook in CLASS_FIXTURES} for name in DJANGO_TEST_CLASSES},
}
PROJECT_HOOKS = {name: TEST_HOOKS for name in TEST_CASES}


def library_members(libraries):
    found = {}
    for dotted in libraries:
        for member, extra in LIBRARY_CONTRACTS.get(dotted, {}).items():
            found.setdefault(member, (dotted, extra))
    return found


def project_hooks(libraries):
    return {hook for dotted in libraries for hook in PROJECT_HOOKS.get(dotted, ())}
