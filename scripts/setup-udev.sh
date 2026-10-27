#!/usr/bin/env bash
# Installs the udev rule that lets Chromium use WebUSB with PCsensor devices
# without running as root.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rule="$repo/udev/70-elfkey.rules"
target="/etc/udev/rules.d/70-elfkey.rules"

if [[ ! -f "$rule" ]]; then
	echo "Cannot find $rule" >&2
	exit 1
fi

echo "Installing $target"
sudo install -m 0644 "$rule" "$target"
sudo udevadm control --reload-rules

# Replay `add` events for attached devices: permissions and ACLs are only
# written then, not on `change`.
echo "Re-applying permissions to attached devices"
sudo udevadm trigger --action=add --subsystem-match=usb --subsystem-match=hidraw

echo
echo "Done. Reload the page in Chromium (a replug is not required)."
echo "Verify the ACL names your user:"
echo "  getfacl /dev/hidraw2 | grep user"
