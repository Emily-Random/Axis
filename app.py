import argparse
import os
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path


def load_dotenv(dotenv_path: Path) -> dict[str, str]:
    if not dotenv_path.exists():
        return {}

    out: dict[str, str] = {}
    for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if not key:
            continue
        out[key] = value
    return out


def wait_for_port(host: str, port: int, timeout_s: float) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.8):
                return True
        except OSError:
            time.sleep(0.15)
    return False


def is_port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.35):
            return True
    except OSError:
        return False


def find_free_port(host: str) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def terminate_process(proc: subprocess.Popen, name: str, timeout_s: float = 6.0) -> None:
    if proc.poll() is not None:
        return
    try:
        proc.terminate()
    except Exception:
        return
    try:
        proc.wait(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        try:
            proc.kill()
        except Exception:
            return


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Axis servers and open the web app.")
    parser.add_argument("--no-open", action="store_true", help="Do not open the browser automatically.")
    parser.add_argument(
        "--mcp",
        action="store_true",
        help="Start the MCP server (usually started by your MCP client config instead).",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host to wait on (default: 127.0.0.1).")
    parser.add_argument("--timeout", type=float, default=20.0, help="Seconds to wait for the web server.")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent
    env = os.environ.copy()
    env.update(load_dotenv(repo_root / ".env"))

    requested_port = int(env.get("PORT", "3000"))
    port = requested_port
    if is_port_open(args.host, port):
        port = find_free_port(args.host)
        env["PORT"] = str(port)
        print(
            f"Port {requested_port} is already in use; starting Axis on port {port} instead.",
            file=sys.stderr,
        )

    url = f"http://localhost:{port}/index.html"

    web_proc = subprocess.Popen(
        ["node", "server.js"],
        cwd=str(repo_root),
        env=env,
    )

    mcp_proc: subprocess.Popen | None = None
    if args.mcp:
        mcp_proc = subprocess.Popen(
            ["node", "mcp_server.mjs"],
            cwd=str(repo_root),
            env=env,
            stdin=subprocess.PIPE,
        )

    ready = wait_for_port(args.host, port, args.timeout)
    if not ready:
        terminate_process(web_proc, "web")
        if mcp_proc:
            terminate_process(mcp_proc, "mcp")
        print(f"Failed to start web server on port {port} within {args.timeout}s.", file=sys.stderr)
        return 1

    if not args.no_open:
        try:
            webbrowser.open(url, new=2)
        except Exception:
            pass

    try:
        while True:
            web_code = web_proc.poll()
            if web_code is not None:
                return int(web_code)
            if mcp_proc is not None:
                mcp_code = mcp_proc.poll()
                if mcp_code is not None:
                    mcp_proc = None
            time.sleep(0.25)
    except KeyboardInterrupt:
        pass
    finally:
        terminate_process(web_proc, "web")
        if mcp_proc:
            terminate_process(mcp_proc, "mcp")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
