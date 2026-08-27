#!/bin/sh
set -eu

STACK_DIR=${HERMES_STACK_DIR:-/home/leandro/stacks/hermes}
PORTAINER_URL=${PORTAINER_URL:-https://192.168.1.11:9443}
ENV_FILE="$STACK_DIR/.env"

if [ "$(id -u)" -ne 0 ] && [ ! -w "$ENV_FILE" ]; then
  echo "Execute este assistente com acesso ao .env da stack." >&2
  exit 1
fi

export PORTAINER_URL STACK_DIR ENV_FILE

exec python3 - <<'PY'
import getpass
import json
import os
import ssl
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

tty_in = open("/dev/tty", "r", buffering=1)
tty_out = open("/dev/tty", "w", buffering=1)

def prompt(message):
    tty_out.write(message)
    tty_out.flush()
    return tty_in.readline().rstrip("\r\n")

base_url = os.environ["PORTAINER_URL"].rstrip("/")
stack_dir = os.environ["STACK_DIR"]
env_file = os.environ["ENV_FILE"]

def request(path, method="GET", payload=None, headers=None):
    body = None if payload is None else json.dumps(payload).encode()
    request_headers = {"Accept": "application/json"}
    if body is not None:
        request_headers["Content-Type"] = "application/json"
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(
        base_url + path,
        data=body,
        headers=request_headers,
        method=method,
    )
    context = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(request, context=context, timeout=20) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")
        try:
            detail = json.loads(detail).get("message", "")
        except json.JSONDecodeError:
            detail = ""
        print(f"Portainer recusou a operação (HTTP {error.code}). {detail}".strip(), file=sys.stderr)
        raise SystemExit(1)
    except urllib.error.URLError as error:
        print(f"Não foi possível alcançar o Portainer: {error.reason}", file=sys.stderr)
        raise SystemExit(1)

username = prompt("Usuário do Portainer: ").strip()
password = getpass.getpass("Senha do Portainer (não será exibida): ", stream=tty_out)
description = prompt("Descrição do token [Hermes Home Lab - read-only]: ").strip()
description = description or "Hermes Home Lab - read-only"

_, auth = request("/api/auth", method="POST", payload={"Username": username, "Password": password})
jwt = auth.get("jwt")
if not jwt:
    print("O Portainer não retornou uma sessão válida.", file=sys.stderr)
    raise SystemExit(1)

auth_headers = {"Authorization": f"Bearer {jwt}"}
_, user = request("/api/users/me", headers=auth_headers)
user_id = user.get("Id")
if not user_id:
    print("Não foi possível identificar o usuário autenticado.", file=sys.stderr)
    raise SystemExit(1)

_, token_response = request(
    f"/api/users/{user_id}/tokens",
    method="POST",
    payload={"description": description, "password": password},
    headers=auth_headers,
)
raw_api_key = token_response.get("rawAPIKey")
if not raw_api_key:
    print("O Portainer não retornou a chave criada.", file=sys.stderr)
    raise SystemExit(1)

existing = []
if os.path.exists(env_file):
    with open(env_file, encoding="utf-8") as stream:
        existing = [
            line.rstrip("\n")
            for line in stream
            if not line.startswith(("PORTAINER_URL=", "PORTAINER_API_KEY=", "PORTAINER_TLS_VERIFY=", "PORTAINER_READ_ONLY=", "PORTAINER_NO_PROXY=", "PORTAINER_PROFILES="))
        ]

values = [
    f"PORTAINER_URL={base_url}",
    f"PORTAINER_API_KEY={raw_api_key}",
    "PORTAINER_TLS_VERIFY=0",
    "PORTAINER_READ_ONLY=1",
    "PORTAINER_NO_PROXY=1",
    "PORTAINER_PROFILES=BASE,DOCKER",
]
content = "\n".join(existing + values) + "\n"
directory = os.path.dirname(env_file) or "."
fd, temporary = tempfile.mkstemp(prefix="hermes-env-", dir=directory, text=True)
try:
    os.chmod(temporary, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        stream.write(content)
    os.replace(temporary, env_file)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)

subprocess.run(
    [
        "docker", "exec", "hermes_agent", "sh", "-lc",
        "sed -i '/^  portainer:/,/^#/{s/enabled: false/enabled: true/}' /opt/data/config.yaml",
    ],
    check=True,
    stdout=subprocess.DEVNULL,
)

subprocess.run(
    ["docker", "compose", "--env-file", env_file, "-f", f"{stack_dir}/docker-compose.yml", "up", "-d", "--force-recreate", "hermes"],
    cwd=stack_dir,
    check=True,
    stdout=subprocess.DEVNULL,
)

test = subprocess.run(
    ["docker", "exec", "hermes_agent", "/opt/hermes/.venv/bin/hermes", "mcp", "test", "portainer"],
    cwd=stack_dir,
    text=True,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
)
print("Token do Portainer criado e gravado somente no .env protegido da stack.")
print(f"Teste MCP: {'OK' if test.returncode == 0 else 'falhou'}")
if test.returncode != 0:
    print("O token foi preservado; revise a saída do teste e não o cole no chat.")
    print("\n".join(test.stdout.splitlines()[-12:]))
    raise SystemExit(test.returncode)
PY
