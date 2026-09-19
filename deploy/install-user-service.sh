#!/bin/sh
set -eu

repository=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
config_dir=${XDG_CONFIG_HOME:-"$HOME/.config"}/paper2agent-nvl-asthma
unit_dir=${XDG_CONFIG_HOME:-"$HOME/.config"}/systemd/user

mkdir -p "$config_dir" "$unit_dir"
if [ ! -f "$config_dir/runtime.env" ]; then
  install -m 0600 "$repository/deploy/runtime.env.example" "$config_dir/runtime.env"
fi
install -m 0644 "$repository/deploy/systemd/paper2agent-nvl-asthma.service" \
  "$unit_dir/paper2agent-nvl-asthma.service"
systemctl --user daemon-reload
systemctl --user enable paper2agent-nvl-asthma.service

printf 'Installed %s\n' "$unit_dir/paper2agent-nvl-asthma.service"
printf 'Review %s before starting the service.\n' "$config_dir/runtime.env"
