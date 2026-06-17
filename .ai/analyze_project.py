import json
from pathlib import Path

PROJECT_ROOT = Path(r"C:\Users\Pc-Leandro\Desktop\gestor")

SRC_DIR = PROJECT_ROOT / "src"
APP_DIR = SRC_DIR / "app"
COMPONENTS_DIR = SRC_DIR / "components"
WORKERS_DIR = SRC_DIR / "workers"

REPORT_FILE = PROJECT_ROOT / ".ai" / "analysis_report.md"


def count_files(path, pattern="*.ts*"):
    if not path.exists():
        return 0

    return len(list(path.rglob(pattern)))


def find_routes():
    routes = []

    if not APP_DIR.exists():
        return routes

    for page in APP_DIR.rglob("page.tsx"):
        relative = page.relative_to(APP_DIR)

        route = "/" + str(relative.parent).replace("\\", "/")

        if route == "/.":
            route = "/"

        routes.append(route)

    return sorted(set(routes))


def find_api_routes():
    apis = []

    if not APP_DIR.exists():
        return apis

    for route in APP_DIR.rglob("route.ts"):
        relative = route.relative_to(APP_DIR)

        api = "/" + str(relative.parent).replace("\\", "/")

        apis.append(api)

    return sorted(set(apis))


def find_workers():
    workers = []

    if not WORKERS_DIR.exists():
        return workers

    for worker in WORKERS_DIR.glob("*.ts"):
        workers.append(worker.stem)

    return sorted(workers)


def detect_integrations():
    integrations = set()

    package_file = PROJECT_ROOT / "package.json"

    if not package_file.exists():
        return []

    package = json.loads(
        package_file.read_text(encoding="utf-8")
    )

    deps = package.get("dependencies", {})

    mapping = {
        "@supabase/supabase-js": "Supabase",
        "stripe": "Stripe",
        "bullmq": "BullMQ",
        "ioredis": "Redis",
        "openai": "OpenAI",
    }

    for dep in deps:
        if dep in mapping:
            integrations.add(mapping[dep])

    return sorted(integrations)


def generate_report():

    routes = find_routes()
    apis = find_api_routes()
    workers = find_workers()
    integrations = detect_integrations()

    content = "# Relatório de Análise do Projeto\n\n"

    content += "## Estatísticas\n\n"

    content += f"- Rotas: {len(routes)}\n"
    content += f"- APIs: {len(apis)}\n"
    content += f"- Workers: {len(workers)}\n\n"

    content += "## Integrações\n\n"

    for item in integrations:
        content += f"- {item}\n"

    content += "\n## Workers\n\n"

    for worker in workers:
        content += f"- {worker}\n"

    content += "\n## Rotas\n\n"

    for route in routes:
        content += f"- {route}\n"

    content += "\n## APIs\n\n"

    for api in apis:
        content += f"- {api}\n"

    REPORT_FILE.write_text(
        content,
        encoding="utf-8"
    )

    print("Relatório gerado:")
    print(REPORT_FILE)


if __name__ == "__main__":
    generate_report()