#!/bin/sh
set -eu
cd "$(dirname "$0")"
task_port=${OU_PORT:-8147}
case "$task_port" in ''|*[!0-9]*) printf '%s\n' 'Choose a numeric OU_PORT.'; exit 1;; esac
task_url="http://127.0.0.1:$task_port"
task_open_game() {
 if [ -d "/Applications/Google Chrome.app" ]; then open -a "Google Chrome" "$task_url"
 else open "$task_url"
 fi
}
task_health=$(curl -fsS --max-time 1 "$task_url/health.json" 2>/dev/null || true)
case "$task_health" in *'"application":"orderup-browser"'*) task_open_game; exit 0;; esac
if command -v node >/dev/null 2>&1; then task_node=$(command -v node)
elif [ -x /opt/homebrew/bin/node ]; then task_node=/opt/homebrew/bin/node
elif [ -x /usr/local/bin/node ]; then task_node=/usr/local/bin/node
else printf '%s\n' 'Node.js is required to open the local game.'; exit 1
fi
OU_PORT="$task_port" "$task_node" tools/serve.mjs &
task_server_pid=$!
trap 'kill "$task_server_pid" 2>/dev/null || true' EXIT INT TERM
task_attempt=0
while [ "$task_attempt" -lt 50 ]; do
 task_health=$(curl -fsS --max-time 1 "$task_url/health.json" 2>/dev/null || true)
 case "$task_health" in *'"application":"orderup-browser"'*) task_open_game; wait "$task_server_pid"; exit 0;; esac
 kill -0 "$task_server_pid" 2>/dev/null || exit 1
 task_attempt=$((task_attempt + 1))
 sleep 0.1
done
printf '%s\n' 'The local game server did not start.'
exit 1
