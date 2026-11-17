"""Routes are registered with `router.get(path)(endpoint)`, never as a decorator.

mutmut skips every decorated function, so a decorated endpoint gets no
mutants and mutation testing reports coverage that does not exist.
"""

import ast
from pathlib import Path

ROUTERS = Path(__file__).resolve().parent.parent / "app" / "routers"


def test_no_function_in_routers_has_a_decorator():
    decorated = [
        f"{path.name}:{node.lineno} {node.name}"
        for path in sorted(ROUTERS.glob("*.py"))
        for node in ast.walk(ast.parse(path.read_text()))
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) and node.decorator_list
    ]
    assert decorated == [], (
        "mutmut does not mutate decorated functions. Register the route after "
        "the function instead, e.g. router.get('/path')(endpoint):\n" + "\n".join(decorated)
    )
