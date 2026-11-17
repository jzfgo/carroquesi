"""Routes are registered with `router.get(path)(endpoint)`, never as a decorator.

mutmut skips every decorated function, so a decorated endpoint gets no
mutants and mutation testing reports coverage that does not exist.

Only route decorators are flagged: mutmut adds decorators of its own to
the copy of the code it tests, and this test runs there too.
"""

import ast
from pathlib import Path

ROUTERS = Path(__file__).resolve().parent.parent / "app" / "routers"
ROUTE_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "api_route"}


def _is_route_decorator(node: ast.expr) -> bool:
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in ROUTE_METHODS
    )


def _route_decorated(source: str) -> list[str]:
    return [
        f"{node.lineno} {node.name}"
        for node in ast.walk(ast.parse(source))
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
        and any(_is_route_decorator(d) for d in node.decorator_list)
    ]


def test_no_endpoint_in_routers_has_a_route_decorator():
    decorated = [
        f"{path.name}:{found}"
        for path in sorted(ROUTERS.glob("*.py"))
        for found in _route_decorated(path.read_text())
    ]
    assert decorated == [], (
        "mutmut does not mutate decorated functions. Register the route after "
        "the function instead, e.g. router.get('/path')(endpoint):\n" + "\n".join(decorated)
    )


def test_the_check_sees_a_route_decorator_and_ignores_others():
    source = (
        "@router.post('', status_code=201)\n"
        "def create(): ...\n"
        "@_mutmut_mutated(mutants)\n"
        "def helper(): ...\n"
    )
    assert _route_decorated(source) == ["2 create"]
