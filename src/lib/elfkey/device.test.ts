import { describe, expect, it } from 'vitest';
import { ElfKeyDevice, type KeyAction } from './device';
import type { HidTransport, Report } from './transport';

/**
 * Replaces the USB transport with an in-memory one. `responses` are queued
 * reports handed out by `read`; every `writeWait` is recorded verbatim.
 */
/** Records the command bytes handed to the transport, padded to 8. */
function record(report: Report): number[] {
	const bytes = Array.from(report).slice(0, 8);
	while (bytes.length < 8) bytes.push(0);
	return bytes;
}

function fakeTransport(responses: number[][]) {
	const written: Report[] = [];
	const queue = [...responses];
	const transport = {
		written,
		device: { vendorId: 0x3553, productId: 0xb001 },
		async writeWait(report: Report) {
			written.push(record(report));
		},
		async write(report: Report) {
			written.push(record(report));
		},
		async read() {
			return queue.length ? Uint8Array.from(queue.shift()!) : null;
		},
		async drain() {},
		discard() {},
		async close() {},
		exclusive<T>(fn: () => Promise<T>) {
			return fn();
		}
	};
	return transport as unknown as HidTransport & { written: Report[] };
}

/**
 * Connects with `responses` queued after the key-count probe. The probe reads
 * key 1 upward, so one key record followed by an end-of-table reply is queued
 * in front: key detection then stops at 1.
 */
async function connect(responses: number[][]) {
	const transport = fakeTransport([
		MODEL_REPORT,
		MODEL_REPORT_2,
		[0x08, 0x01, 0x00, 0x05, 0, 0, 0, 0],
		[0x39, 0xe3, 0x39, 0xe3, 0x39, 0xe3, 0x39, 0xe3],
		...responses
	]);
	const device = await ElfKeyDevice.connect(transport);
	return { device, transport };
}

// Model text fills every byte of each report, NUL padded.
const MODEL_REPORT = [0x46, 0x6f, 0x6f, 0x74, 0x53, 0x77, 0x69, 0x74]; // "FootSwit"
const MODEL_REPORT_2 = [0x63, 0x68, 0x31, 0x2e, 0x33, 0x00, 0x00, 0x00]; // "ch1.3"
const READ_KEY = [0x82, 8, 1, 0, 0, 0, 0, 0];


describe('model identification', () => {
	it('concatenates model chunks and parses the version', async () => {
		const { device, transport } = await connect([]);
		expect(device.info.model).toBe('FootSwitch1.3');
		expect(device.info.version).toBe(1.3);
		expect(device.info.keyCount).toBe(1);
		expect(transport.written[0]).toEqual([0x83, 0x08, 0, 0, 0, 0, 0, 0]);
	});
});

describe('reading a key', () => {
	it('decodes a keyboard action', async () => {
		const { device } = await connect([
			// length, kind, mods, KeyB
			[0x08, 0x01, 0x03, 0x05, 0, 0, 0, 0]
		]);
		const action = await device.readKey(1);
		expect(action).toEqual({
			kind: 'keyboard',
			modifiers: ['ControlLeft', 'ShiftLeft'],
			keys: ['KeyB']
		});
	});

	it('decodes a media action', async () => {
		const { device } = await connect([[0x08, 0x07, 0x01, 0, 0, 0, 0, 0]]);
		expect(await device.readKey(1)).toEqual({ kind: 'media', media: 1 });
	});

	it('decodes a mouse action, treating deltas as signed bytes', async () => {
		const { device } = await connect([[0x08, 0x02, 0, 0, 0x03, 0xff, 0x05, 0]]);
		expect(await device.readKey(1)).toMatchObject({
			kind: 'mouse',
			buttons: ['Left', 'Right'],
			x: -1,
			y: 5
		});
	});

	it('decodes a text action spanning two reports', async () => {
		const text = 'Hello, world';
		const bytes = Array.from(text, (ch) => {
			const table: Record<string, number> = { ' ': 44, ',': 54 };
			if (table[ch]) return table[ch];
			return ch >= 'a' && ch <= 'z' ? ch.charCodeAt(0) - 93 : ch.charCodeAt(0) + 67;
		});
		const first = [text.length + 2, 0x04, ...bytes.slice(0, 6)];
		const second = [...bytes.slice(6), 0, 0];
		const { device } = await connect([first, second]);
		expect(await device.readKey(1)).toEqual({ kind: 'string', text });
	});
});

describe('writing a key', () => {
	async function write(action: KeyAction) {
		const { device, transport } = await connect([[0x08, 0x01, 0, 0, 0, 0, 0, 0]]);
		transport.written.length = 0;
		await device.writeKey(1, action);
		return transport.written;
	}

	it('writes a keyboard action', async () => {
		const written = await write({
			kind: 'keyboard',
			modifiers: ['ControlLeft', 'AltLeft'],
			keys: ['KeyC']
		});
		expect(written).toEqual([
			[0x81, 8, 1, 0, 0, 0, 0, 0],
			[8, 0x01, 0x05, 0x06, 0, 0, 0, 0],
			READ_KEY
		]);
	});

	it('writes a mouse action with signed deltas', async () => {
		const written = await write({
			kind: 'mouse',
			buttons: ['Mouse-Middle'],
			x: -10,
			y: 20,
			wheel: 1
		});
		expect(written).toEqual([
			[0x81, 8, 1, 0, 0, 0, 0, 0],
			[8, 0x02, 0, 0, 0x04, 0xf6, 0x14, 0x01],
			READ_KEY
		]);
	});

	it('writes a media action', async () => {
		const written = await write({ kind: 'media', media: 3 });
		expect(written).toEqual([
			[0x81, 8, 1, 0, 0, 0, 0, 0],
			[8, 0x07, 3, 0, 0, 0, 0, 0],
			READ_KEY
		]);
	});

	it('splits a text action into a header chunk plus 8-byte chunks', async () => {
		const written = await write({ kind: 'string', text: 'abcdefghij' });
		expect(written).toEqual([
			[0x81, 12, 1, 0, 0, 0, 0, 0],
			[12, 0x04, 4, 5, 6, 7, 8, 9],
			[10, 11, 12, 13, 0, 0, 0, 0],
			READ_KEY
		]);
	});

	it('refuses text the device cannot send', async () => {
		await expect(write({ kind: 'string', text: 'héllo' })).rejects.toThrow(/not supported/);
	});
});
