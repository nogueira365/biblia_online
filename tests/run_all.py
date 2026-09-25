"""Roda todos os testes do Bíblia Live: sincronização (Node) e ponta a ponta (Playwright).

Uso: python tests/run_all.py
"""
import subprocess, sys
from pathlib import Path

TESTS = Path(__file__).resolve().parent
ROOT = TESTS.parent

suites = [["node", str(TESTS / "sync.test.js")]]
suites += [[sys.executable, str(path)] for path in sorted((TESTS / "e2e").glob("*.py"))]

failed = []
for command in suites:
    name = Path(command[1]).name
    print(f"\n===== {name} =====", flush=True)
    if subprocess.run(command, cwd=ROOT).returncode != 0:
        failed.append(name)

print("\n" + ("Todas as suítes passaram." if not failed else f"Falharam: {', '.join(failed)}"))
sys.exit(1 if failed else 0)
