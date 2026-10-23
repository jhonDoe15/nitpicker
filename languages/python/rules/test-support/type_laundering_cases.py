import ast
import os
import pathlib
import shutil
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from checks import type_laundering
from index.project import Project
from nitpicker_rules import FileContext, check_all, load_checks


def findings(source, path="src/value.py", tests=False):
    project = Project({"testFiles": [path] if tests else []}, [path])
    context = FileContext(path, source, ast.parse(source), project)
    project.add(context)
    return type_laundering.check(context)


def summary(source, **options):
    return [
        (item["rule"], item["line"], item["subject"])
        for item in findings(source, **options)
    ]


class TypeLaunderingCases(unittest.TestCase):
    def test_registered(self):
        self.assertIn(type_laundering, load_checks())

    def test_fixtures_through_all_registered_checks(self):
        root = pathlib.Path(__file__).resolve().parents[1] / "fixtures/type-laundering"
        for side, expected in [
            ("allowed", []),
            ("banned", ["no-explicit-any", "no-typing-cast"]),
        ]:
            with self.subTest(side=side):
                with tempfile.TemporaryDirectory() as directory:
                    shutil.copytree(root / side, directory, dirs_exist_ok=True)
                    paths = [
                        str(file.relative_to(directory))
                        for file in pathlib.Path(directory).rglob("*.py")
                    ]
                    previous = os.getcwd()
                    try:
                        os.chdir(directory)
                        result = check_all(paths, {}, load_checks())
                    finally:
                        os.chdir(previous)
                    self.assertEqual(
                        sorted(item["rule"] for item in result.findings), expected
                    )

    def test_cast_import_forms(self):
        for declaration, call in [
            ("import typing", "typing.cast"),
            ("import typing as t", "t.cast"),
            ("from typing import cast", "cast"),
            ("from typing import cast as narrow", "narrow"),
            ("from typing_extensions import cast as narrow", "narrow"),
        ]:
            with self.subTest(declaration=declaration):
                source = f"{declaration}\ndef decode(value):\n    return {call}(int, value)\n"
                self.assertEqual(summary(source), [("no-typing-cast", 3, "decode")])

    def test_any_import_forms(self):
        for declaration, name in [
            ("from typing import Any", "Any"),
            ("from typing import Any as Opaque", "Opaque"),
            ("import typing as t", "t.Any"),
            ("import typing_extensions as t", "t.Any"),
        ]:
            with self.subTest(declaration=declaration):
                self.assertEqual(
                    summary(
                        f"{declaration}\ndef decode(value: {name}):\n    return value\n"
                    ),
                    [("no-explicit-any", 2, "decode")],
                )

    def test_cast_cannot_be_hidden_by_assigning_an_alias(self):
        self.assertEqual(
            summary(
                "from typing import cast\nnarrow = cast\nvalue = narrow(int, source)\n"
            ),
            [("no-typing-cast", 2, "module")],
        )

    def test_nested_and_quoted_annotations(self):
        for annotation in ["list[Any]", '"dict[str, Any]"', 'list["Any"]']:
            with self.subTest(annotation=annotation):
                self.assertEqual(
                    summary(f"from typing import Any\nvalue: {annotation}\n"),
                    [("no-explicit-any", 2, "module")],
                )

    def test_type_alias(self):
        self.assertEqual(
            summary(
                'from typing import Any, TypeAlias\nPayload: TypeAlias = "list[Any]"\n'
            ),
            [("no-explicit-any", 2, "module")],
        )

    def test_runtime_type_factories(self):
        self.assertEqual(
            summary(
                'from typing import Any, TypedDict\nPayload = TypedDict("Payload", {"body": Any})\n'
            ),
            [("no-explicit-any", 2, "module")],
        )

    def test_scopes_and_return_annotations(self):
        self.assertEqual(
            summary(
                "from typing import Any\nclass Decoder:\n    def decode(self, value: Any) -> Any:\n        body: Any = value\n        return body\n"
            ),
            [
                ("no-explicit-any", 3, "Decoder.decode"),
                ("no-explicit-any", 4, "Decoder.decode"),
            ],
        )

    def test_tests_are_checked(self):
        self.assertEqual(
            summary(
                "from typing import cast\ndef test_value():\n    assert cast(int, value) == 1\n",
                tests=True,
            ),
            [("no-typing-cast", 3, "test_value")],
        )

    def test_strings_literal_and_metadata_are_allowed(self):
        self.assertEqual(
            summary(
                'from typing import Annotated, Any, Literal\nlabel = "Any"\nvalue: Literal["Any"]\ncount: Annotated[int, "Any"]\n'
            ),
            [],
        )

    def test_annotated_type_is_checked(self):
        self.assertEqual(
            summary(
                'from typing import Annotated, Any\nvalue: Annotated["Any", "metadata"]\n'
            ),
            [("no-explicit-any", 2, "module")],
        )

    def test_narrowing_and_unrelated_names_are_allowed(self):
        self.assertEqual(
            summary(
                "from cinema import cast, Any\ndef decode(value: object):\n    if isinstance(value, int):\n        return cast(value)\n    raise ValueError(Any)\n"
            ),
            [],
        )

    def test_parameter_shadowing(self):
        self.assertEqual(
            summary(
                "from typing import cast, Any\ndef decode(cast, Any):\n    return cast(Any)\n"
            ),
            [],
        )

    def test_local_assignment_shadowing(self):
        self.assertEqual(
            summary(
                "import typing as t\ndef decode(value):\n    t = value\n    return t.cast(int, t.Any)\n"
            ),
            [],
        )

    def test_local_import_does_not_leak(self):
        self.assertEqual(
            summary(
                "def first(value):\n    from typing import cast\n    return cast(int, value)\ndef second(cast):\n    return cast(int, 1)\n"
            ),
            [("no-typing-cast", 3, "first")],
        )

    def test_nested_function_inherits_import(self):
        self.assertEqual(
            summary(
                "def outer():\n    from typing import cast\n    def inner(value):\n        return cast(int, value)\n    return inner\n"
            ),
            [("no-typing-cast", 4, "outer.inner")],
        )

    def test_lambda_shadowing(self):
        self.assertEqual(
            summary("from typing import cast\nconvert = lambda cast: cast(int, 1)\n"),
            [],
        )

    def test_comprehension_shadowing(self):
        self.assertEqual(
            summary(
                "from typing import cast\nvalues = [cast(int, 1) for cast in converters]\nother = cast(int, value)\n"
            ),
            [("no-typing-cast", 3, "module")],
        )

    def test_method_skips_class_namespace(self):
        self.assertEqual(
            summary(
                "from typing import cast\nclass Decoder:\n    cast = int\n    def decode(self, value):\n        return cast(int, value)\n"
            ),
            [("no-typing-cast", 5, "Decoder.decode")],
        )

    def test_existing_domain_rule_takes_precedence(self):
        self.assertEqual(
            summary(
                "from typing import Any\ndef decode(value: Any):\n    return value\n",
                path="domain/value.py",
            ),
            [],
        )

    def test_existing_pydantic_rule_takes_precedence(self):
        self.assertEqual(
            summary(
                "from typing import Any\nfrom pydantic import BaseModel\nclass Payload(BaseModel):\n    body: Any\n",
                path="adapters/value.py",
            ),
            [],
        )

    def test_line_moves_keep_subject(self):
        code = (
            "from typing import cast\ndef decode(value):\n    return cast(int, value)\n"
        )
        self.assertEqual(summary(code), [("no-typing-cast", 3, "decode")])
        self.assertEqual(summary("\n\n" + code), [("no-typing-cast", 5, "decode")])


if __name__ == "__main__":
    unittest.main()
