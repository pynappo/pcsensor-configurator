# ElfKey Web

A Linux/web replacement for `SetupElfKey-3.2.1-win-x64.exe`, used to configure
PCsensor ElfKey foot switches (e.g. `3553:b001 PCsensor FootSwitch`) over USB.

Built with SvelteKit and WebUSB — no Electron, no native dependencies. Any
Chromium-based browser can use it from `localhost` or an HTTPS origin.

## Requirements

- Chrome / Chromium / Edge / Brave (Firefox does not implement WebUSB)
- Node.js 20+ for the dev server

## Quick start

```bash
npm install
npm run setup:udev   # once, needs sudo: installs the udev rule
npm run dev          # http://localhost:5173
```

Then in the browser: **Connect device** → pick the PCsensor device → choose a
key → assign an action → **Save to device**. The value is read back from the
device afterwards and shown in the panel.

## Device permissions

WebUSB normally asks polkit for permission every time a device is opened, which
fails on many Linux setups. The bundled rule
[`udev/70-elfkey.rules`](udev/70-elfkey.rules) tags PCsensor devices with
`uaccess`, so the logged-in seat owner gets direct access without a prompt.

`scripts/setup-udev.sh` installs it and replays the `add` events for attached
devices, so no replug is needed. To check it took effect, the node must carry an
ACL naming your user:

```bash
getfacl /dev/hidraw2 | grep user:   # expect: user:yourname:rw-
```

The rule must be numbered below `73-seat-late.rules`, which is what runs the
`uaccess` builtin and matches `TAG=="uaccess"` exactly — a tag added by a
later-numbered file is never honoured.

The rule covers vendor IDs `3553` (PCsensor), plus `1a86`, `2329`, `248a` which
some ElfKey variants use.

### Unbinding from usbhid

Permissions alone are not enough: Chromium refuses to claim an interface the
kernel `usbhid` driver holds. Check and release it while configuring:

```bash
basename $(readlink -f /sys/bus/usb/devices/1-5:1.1/driver)   # usbhid
sudo sh -c 'echo -n 1-5:1.1 > /sys/bus/usb/drivers/usbhid/unbind'
```

Replugging restores the binding. This also stops the pedal from sending
keystrokes while it is unbound.


## What is supported

| Action   | Notes                                                        |
| -------- | ------------------------------------------------------------ |
| Keyboard | Up to 6 keys plus any modifier combination                   |
| Mouse    | Left/right/middle/back/forward buttons, X/Y movement, wheel  |
| Media    | Volume, playback, browser and power keys                     |
| Text     | Types a string; ASCII letters, digits and punctuation only   |

Not yet implemented: macros, function layers, LED settings, game pad mode,
MIDI, Bluetooth/2.4 GHz pairing and firmware updates. Those exist in the
Windows app and could be added on top of the same transport.

## Protocol reference

Derived from the Electron app inside the 3.2.1 Windows installer. All messages
are exactly 8 bytes on the HID configuration interface (usage page 1, no report
ID, endpoints 8 bytes).

| Purpose      | Command                                  |
| ------------ | ---------------------------------------- |
| Read model   | `01 83 08 00 00 00 00 00`                |
| Read key     | `01 82 08 <key> 00 00 00 00`             |
| Write key    | `01 81 <len> <key> 00 00 00 00`          |

Writes then stream payload reports. A key reply is `[len, key, kind, ...]`
where `kind` is `0x01` keyboard, `0x02` mouse, `0x04` text, `0x07` media.
`len` counts the whole payload including the two header bytes; longer values
continue in further 8-byte reports whose first byte repeats the previous byte.

## Development

```bash
npm test        # protocol encoder/decoder unit tests
npm run check   # svelte-check + TypeScript
npm run build
```

The USB log panel in the UI shows every frame sent and received, which is the
fastest way to confirm behaviour against real hardware.

Source layout:

- `src/lib/elfkey/transport.ts` — WebUSB interface discovery, read/write, log
- `src/lib/elfkey/device.ts` — protocol client (`readKey`, `writeKey`)
- `src/lib/elfkey/codes.ts` — key/character code tables
- `src/routes/+page.svelte` — UI
