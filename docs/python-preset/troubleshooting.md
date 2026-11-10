# Troubleshooting

[Troubleshooting](../troubleshooting.md) has the cause and the fix for every failure that is not a
finding. The ones this preset meets:

- [The Python environment cannot be found](../troubleshooting.md#the-python-environment-cannot-be-found):
  `uv sync`, `poetry install` or `python.environment`.
- [A Python tool is missing](../troubleshooting.md#a-python-tool-is-missing) from that environment.
- [The base needs its own Python environment](../troubleshooting.md#the-base-needs-its-own-python-environment)
  when its dependency files differ from the head's.
- [A Python tool fails](../troubleshooting.md#a-python-tool-fails) and
  [mutmut fails](../troubleshooting.md#mutmut-fails).
- [A project tool config is missing or broken](../troubleshooting.md#a-project-tool-config-is-missing-or-broken)
  for mypy, pyright, ruff and black.
- [Windows and WSL](../troubleshooting.md#windows-and-wsl): mutmut needs `fork`.
- Every preset: [Exit code 2 and tool errors](../troubleshooting.md#exit-code-2-and-tool-errors), [no merge base](../troubleshooting.md#no-merge-base) (a shallow clone), [tests fail](../troubleshooting.md#tests-fail) and [on the base](../troubleshooting.md#tests-fail-on-the-base), [another run is in progress](../troubleshooting.md#another-run-is-in-progress) and [a policy-loosened finding](../troubleshooting.md#a-policy-loosened-finding).
