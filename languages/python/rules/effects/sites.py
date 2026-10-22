import ast


def outer_calls(nodes):
    calls = [node for node in nodes if isinstance(node, ast.Call)]
    receivers = {
        id(call.func.value) for call in calls if isinstance(call.func, ast.Attribute)
    }
    kept = [call for call in calls if id(call) not in receivers]
    return sorted(kept, key=lambda call: (call.lineno, call.col_offset))
