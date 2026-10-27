/**
 * High-level client for PCsensor configurable keys (ElfKey / FootSwitch).
 *
 * Wire format: fixed 8-byte messages. The first byte is the command opcode;
 * writes that carry variable-length data announce the total length in the
 * command header, then stream payload-only messages of 8 bytes each.
 */
import {
	byteToChar,
	byteToModifiers,
	byteToMouseButtons,
	charToByte,
	keyByteToLabel,
	keyToByte,
	modifiersToByte,
	MEDIA_KEYS,
	mouseButtonsToByte
} from './codes';
import { DeviceError } from './errors';
import { HidTransport, type Bytes } from './transport';

const CMD_READ_MODEL = 0x83;
const CMD_READ_KEY = 0x82;
const CMD_WRITE_KEY = 0x81;

/** Device-side action kinds. The low nibble is the function, bit 7 = hold mode. */
const ACTION = {
	media: 0x07,
	mouse: 0x02,
	keyboard: 0x01,
	string: 0x04
} as const;

export type KeyAction =
	| { kind: 'none' }
	| { kind: 'keyboard'; modifiers: string[]; keys: string[] }
	| { kind: 'mouse'; buttons: string[]; x: number; y: number; wheel: number }
	| { kind: 'media'; media: number }
	| { kind: 'string'; text: string }
	| { kind: 'unknown'; code: number };

export interface DeviceInfo {
	model: string;
	version: number;
	keyCount: number;
	vendorId: number;
	productId: number;
}

export class ElfKeyDevice {
	readonly transport: HidTransport;
	readonly info: DeviceInfo;

	private constructor(transport: HidTransport, info: DeviceInfo) {
		this.transport = transport;
		this.info = info;
	}

	/** Opens the device and identifies its model and firmware version. */
	static async connect(transport: HidTransport): Promise<ElfKeyDevice> {
		await transport.drain();
		const { model, version } = await readModel(transport);
		if (!model) {
			await transport.close();
			throw new DeviceError('Device did not report a model. Is it a supported ElfKey device?');
		}
		const device = new ElfKeyDevice(transport, {
			model,
			version,
			keyCount: 1,
			vendorId: transport.device.vendorId,
			productId: transport.device.productId
		});
		device.info.keyCount = await detectKeyCount(transport, model);
		return device;
	}

	async disconnect(): Promise<void> {
		await this.transport.close();
	}

	/** Reads the action currently assigned to `keyNumber` (1-based). */
	readKey(keyNumber: number): Promise<KeyAction> {
		return this.transport.exclusive(() => this.readKeyUnlocked(keyNumber));
	}

	private async readKeyUnlocked(keyNumber: number): Promise<KeyAction> {
		this.transport.discard();
		await this.transport.writeWait([CMD_READ_KEY, 0x08, keyNumber, 0, 0, 0, 0, 0], 30);
		const header = await this.readResponse(1500);
		if (!header) throw new DeviceError('Device did not respond while reading the key.');
		// Layout: [length, kind, values...]. The key number is not echoed.
		const length = header[0];
		const code = header[1];

		switch (code) {
			case ACTION.keyboard:
			case ACTION.keyboard | 0x80: {
				const keys: string[] = [];
				for (let i = 3; i < 8; i++) {
					const label = keyByteToLabel(header[i]);
					if (label) keys.push(label);
				}
				return { kind: 'keyboard', modifiers: byteToModifiers(header[2]), keys };
			}
			case ACTION.mouse: {
				const signed = (b: number) => (b < 128 ? b : b - 256);
				return {
					kind: 'mouse',
					buttons: byteToMouseButtons(header[4]),
					x: signed(header[5]),
					y: signed(header[6]),
					wheel: signed(header[7])
				};
			}
			case ACTION.media:
				return { kind: 'media', media: header[2] };
			case ACTION.string: {
				const bytes = Array.from(header.slice(2, 8));
				while (bytes.length < length) {
					const chunk = await this.transport.read(1000);
					if (!chunk) break;
					bytes.push(...chunk.slice(0, 8));
				}
				return { kind: 'string', text: bytes.map(byteToChar).join('') };
			}
			default:
				return { kind: 'unknown', code };
		}
	}

	/** Writes a new action for `keyNumber` and verifies it by reading back. */
	async writeKey(keyNumber: number, action: KeyAction): Promise<KeyAction> {
		await this.transport.exclusive(() => this.writeKeyUnlocked(keyNumber, action));
		return this.readKey(keyNumber);
	}

	private async writeKeyUnlocked(keyNumber: number, action: KeyAction): Promise<void> {
		switch (action.kind) {
			case 'keyboard':
				return this.writeKeyboard(keyNumber, action.modifiers, action.keys);
			case 'mouse':
				return this.writeMouse(keyNumber, action);
			case 'media':
				return this.writeMedia(keyNumber, action.media);
			case 'string':
				return this.writeString(keyNumber, action.text);
			case 'none':
			case 'unknown':
				throw new DeviceError('Clearing a key is not supported yet.');
		}
	}

	private async writeKeyboard(
		keyNumber: number,
		modifiers: string[],
		keys: string[]
	): Promise<void> {
		const codes = keys.map(keyToByte).filter((b) => b > 0);
		if (codes.length === 0) throw new DeviceError('Pick at least one key.');
		if (codes.length > 6) throw new DeviceError('A key action supports at most 6 keys.');
		const modByte = modifiersToByte(modifiers);
		const length = codes.length === 6 ? 9 : 8;
		await this.transport.writeWait([CMD_WRITE_KEY, length, keyNumber, 0, 0, 0, 0, 0], 30);
		await this.transport.writeWait(
			[length, ACTION.keyboard, modByte, ...codes.slice(0, 5)],
			20,
			'data'
		);
		if (codes.length > 5) {
			await this.transport.writeWait([codes[5]], 20, 'data');
		}
		await this.transport.drain();
	}

	private async writeMouse(
		keyNumber: number,
		action: { buttons: string[]; x: number; y: number; wheel: number }
	): Promise<void> {
		const buttons = mouseButtonsToByte(action.buttons);
		await this.transport.writeWait([CMD_WRITE_KEY, 8, keyNumber, 0, 0, 0, 0, 0], 30);
		await this.transport.writeWait(
			[
				8,
				ACTION.mouse,
				0,
				0,
				buttons,
				signedByte(action.x),
				signedByte(action.y),
				signedByte(action.wheel)
			],
			20,
			'data'
		);
		await this.transport.drain();
	}

	private async writeMedia(keyNumber: number, media: number): Promise<void> {
		await this.transport.writeWait([CMD_WRITE_KEY, 8, keyNumber, 0, 0, 0, 0, 0], 30);
		await this.transport.writeWait([8, ACTION.media, media, 0, 0, 0, 0, 0], 20, 'data');
		await this.transport.drain();
	}

	private async writeString(keyNumber: number, text: string): Promise<void> {
		const bytes = Array.from(text, (ch) => charToByte(ch));
		const unsupported = Array.from(text).filter((ch, i) => bytes[i] === 0 && ch !== '\0');
		if (unsupported.length) {
			throw new DeviceError(`These characters are not supported by the device: ${[...new Set(unsupported)].join('')}`);
		}
		const total = bytes.length + 2;
		await this.transport.writeWait([CMD_WRITE_KEY, total, keyNumber, 0, 0, 0, 0, 0], 30);
		// First message holds the length header plus the first 6 characters.
		await this.transport.writeWait([total, ACTION.string, ...bytes.slice(0, 6)], 20, 'data');
		for (let i = 6; i < bytes.length; i += 8) {
			await this.transport.writeWait(bytes.slice(i, i + 8), 20, 'data');
		}
		await this.transport.drain();
	}

	/** Collects a response, skipping unsolicited button-press notifications. */
	private async readResponse(timeoutMs: number): Promise<Bytes | null> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const report = await this.transport.read(deadline - Date.now());
			if (!report) return null;
			// 0x81/0x55 is the "key pressed" notification stream.
			if (report[0] === 0x81 && report[1] === 0x55) continue;
			return report;
		}
		return null;
	}
}

/**
 * Reads the model string and firmware version. Every byte of each report is
 * ASCII, with trailing NUL padding, and chunks concatenate directly.
 */
async function readModel(transport: HidTransport): Promise<{ model: string; version: number }> {
	let name = '';
	for (let attempt = 0; attempt < 4 && !/\d+\.\d+$/.test(name); attempt++) {
		await transport.writeWait([CMD_READ_MODEL, 0x08, 0, 0, 0, 0, 0, 0], 40);
		const deadline = Date.now() + 600;
		while (Date.now() < deadline) {
			const report = await transport.read(deadline - Date.now());
			if (!report) break;
			const chunk = Array.from(report);
			if (!chunk.every((b) => b === 0 || (b >= 0x20 && b <= 0x7e))) break;
			name += new TextDecoder().decode(Uint8Array.from(chunk)).replace(/\0+$/, '');
			if (/\d+\.\d+$/.test(name)) break;
		}
	}
	const model = name.trim();
	const match = /(\d+\.\d+)$/.exec(model);
	if (!match || !/^[a-z]/i.test(model) || model.toLowerCase().startsWith('temper')) {
		return { model: '', version: 0 };
	}
	return { model, version: Number.parseFloat(match[1]) };
}

/**
 * Counts how many keys the device answers for. Keys past the end of the table
 * reply with padding rather than a key record, so a valid length byte followed
 * by a known action kind marks a real key.
 */
async function detectKeyCount(transport: HidTransport, model: string): Promise<number> {
	const guess = deriveKeyCount(model);
	let count = 0;
	for (let key = 1; key <= 32; key++) {
		const report = await transport.exclusive(() => queryKey(transport, key));
		if (!isValidKeyReply(report)) break;
		count = key;
	}
	return count || guess || 1;
}

async function queryKey(transport: HidTransport, keyNumber: number): Promise<Bytes | null> {
	transport.discard();
	await transport.writeWait([CMD_READ_KEY, 0x08, keyNumber, 0, 0, 0, 0, 0], 30);
	const deadline = Date.now() + 400;
	while (Date.now() < deadline) {
		const report = await transport.read(deadline - Date.now());
		if (!report) return null;
		if (report[0] === 0x81 && report[1] === 0x55) continue;
		return report;
	}
	return null;
}

/**
 * A real key record is `[length, keyNumber, kind, ...]`; keys past the end of
 * the table are answered with padding instead.
 */
function isValidKeyReply(report: Bytes | null): boolean {
	if (!report || report.length < 4) return false;
	const length = report[0];
	const kind = report[1];
	const knownKinds: number[] = [ACTION.keyboard, ACTION.mouse, ACTION.string, ACTION.media];
	return length >= 2 && length <= 16 && knownKinds.includes(kind);
}

function deriveKeyCount(model: string): number {
	const name = model.toLowerCase();
	if (name.includes('diy100key')) return 100;
	const match = /btc24k(\d+)/.exec(name);
	if (match) return Number(match[1]);
	if (/1key|footswitch1|usb1rd|^fs1|usw1|irsw2[01]|pt23u|ms23|hk31|cswitch1/.test(name)) return 1;
	if (/2key|footswitch2|usb2|^fs2|usw2|pt23a|fs2c/.test(name)) return 2;
	if (/3key|footswitch3|usbswitch3|usw3|^fs2[03]|fs20pro|hk33|cswitch3/.test(name)) return 3;
	if (/4key|usb5key|hk4|fs2016g2a/.test(name)) return 4;
	const digit = /(\d+)key/.exec(name);
	return digit ? Number(digit[1]) : 1;
}

/** Reports whether the browser exposes WebUSB at all. */
export function isWebHidAvailable(): boolean {
	return typeof navigator !== 'undefined' && 'hid' in navigator;
}

function signedByte(n: number): number {
	const clamped = Math.max(-127, Math.min(127, Math.trunc(n)));
	return clamped < 0 ? clamped + 256 : clamped;
}

export function describeAction(action: KeyAction): string {
	switch (action.kind) {
		case 'none':
			return '(nothing assigned)';
		case 'keyboard':
			return [...action.modifiers.map(modifierLabel), ...action.keys].join(' + ');
		case 'mouse':
			return `Mouse ${action.buttons.join('+')} (${action.x}, ${action.y})`;
		case 'media':
			return `Media: ${MEDIA_KEYS[action.media] ?? `#${action.media}`}`;
		case 'string':
			return `Text: "${action.text}"`;
		case 'unknown':
			return `Unknown action (code ${action.code})`;
	}
}

function modifierLabel(code: string): string {
	const match = /^(Left|Right)?(Control|Shift|Alt|Meta)$/.exec(code);
	if (!match) return code;
	const side = match[1] === 'Right' ? 'R' : '';
	const names: Record<string, string> = { Control: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Meta: 'Win' };
	return `${side}${names[match[2]]}`;
}
