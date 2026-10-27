import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HidTransport, isConfigDevice, toBytes } from './transport';

/** Stand-in for HIDDevice that records reports and lets tests emit input. */
class FakeHidDevice extends EventTarget {
	opened = false;
	vendorId = 0x3553;
	productId = 0xb001;
	productName = 'FootSwitch';
	collections = [
		{
			usagePage: 0x0001,
			usage: 0,
			type: 1,
			children: [],
			inputReports: [{ reportId: 0, items: [] }],
			outputReports: [{ reportId: 0, items: [] }],
			featureReports: []
		}
	];
	written: number[][] = [];

	async open() {
		this.opened = true;
	}
	async close() {
		this.opened = false;
	}
	async sendReport(_id: number, data: BufferSource) {
		this.written.push(Array.from(new Uint8Array(data as ArrayBuffer)));
	}

	/** Emits an input report as the browser would. */
	emit(bytes: number[]) {
		const detail = new Event('inputreport');
		Object.assign(detail, { reportId: 0, data: new DataView(Uint8Array.from(bytes).buffer) });
		this.dispatchEvent(detail);
	}
}

async function open() {
	const device = new FakeHidDevice();
	const transport = await HidTransport.open(device as unknown as HIDDevice);
	return { device, transport };
}

describe('HidTransport', () => {
	it('opens the device and picks report ID 0 for unnumbered reports', async () => {
		const { device, transport } = await open();
		expect(device.opened).toBe(true);
		expect(transport.device).toBe(device);
	});

	it('prefixes and pads outgoing frames to 8 bytes', async () => {
		const { device, transport } = await open();
		await transport.write([0x81, 8]);
		expect(device.written[0]).toEqual([0x01, 0x81, 8, 0, 0, 0, 0, 0]);
	});

	it('leaves data frames unprefixed', async () => {
		const { device, transport } = await open();
		await transport.write([0x08, 0x01, 0x08, 0x06, 0, 0, 0, 0], 'data');
		expect(device.written[0]).toEqual([0x08, 0x01, 0x08, 0x06, 0, 0, 0, 0]);
	});

	it('sends on the report ID the descriptor declares', async () => {
		const device = new FakeHidDevice();
		const transport = await HidTransport.open(device as unknown as HIDDevice);
		expect(transport.reportId).toBe(0);
		expect(transport.reportId).not.toBe(1);
	});

	it('delivers an input report to a pending read', async () => {
		const { device, transport } = await open();
		const pending = transport.read(1000);
		device.emit([8, 1, 0x01, 0x05, 0x06, 0, 0, 0]);
		expect(Array.from((await pending)!)).toEqual([8, 1, 0x01, 0x05, 0x06, 0, 0, 0]);
	});

	it('buffers reports that arrive before a read', async () => {
		const { device, transport } = await open();
		device.emit([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(Array.from((await transport.read(10))!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
	});

	it('returns null on timeout and forgets the waiter', async () => {
		const { transport } = await open();
		expect(await transport.read(20)).toBeNull();
		expect(await transport.read(20)).toBeNull();
	});

	it('discards buffered reports so a late reply cannot answer the next read', async () => {
		const { device, transport } = await open();
		// A reply for an earlier request arrives after that read timed out.
		expect(await transport.read(20)).toBeNull();
		device.emit([0x08, 0x01, 0x00, 0x06, 0, 0, 0, 0]);
		await new Promise((resolve) => setTimeout(resolve, 10));

		transport.discard();
		expect(await transport.read(20)).toBeNull();
	});

	it('drains queued reports', async () => {
		const { device, transport } = await open();
		device.emit([9, 9, 9, 9, 9, 9, 9, 9]);
		await transport.drain();
		expect(await transport.read(10)).toBeNull();
	});

	it('stops listening after close', async () => {
		const { device, transport } = await open();
		await transport.close();
		device.emit([1, 1, 1, 1, 1, 1, 1, 1]);
		expect(await transport.read(10)).toBeNull();
	});

	it('serialises exclusive exchanges', async () => {
		const { transport } = await open();
		const order: string[] = [];
		const first = transport.exclusive(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			order.push('first');
		});
		const second = transport.exclusive(async () => {
			order.push('second');
		});
		await Promise.all([first, second]);
		expect(order).toEqual(['first', 'second']);
	});
});

describe('isConfigDevice', () => {
	function device(vendorId: number, collections: unknown[]): HIDDevice {
		return { vendorId, collections, productName: 'FootSwitch' } as unknown as HIDDevice;
	}

	const keystrokeOnly = {
		usagePage: 0x0001,
		usage: 6,
		inputReports: [{ reportId: 1, items: [] }],
		outputReports: [],
		featureReports: [],
		children: [],
		type: 1
	};
	const config = {
		usagePage: 0x0001,
		usage: 0,
		inputReports: [{ reportId: 1, items: [] }],
		outputReports: [{ reportId: 1, items: [] }],
		featureReports: [],
		children: [],
		type: 1
	};

	it('accepts the interface that can carry commands', () => {
		expect(isConfigDevice(device(0x3553, [config]))).toBe(true);
	});

	it('rejects the keystroke-only interface sharing the same name', () => {
		expect(isConfigDevice(device(0x3553, [keystrokeOnly]))).toBe(false);
	});

	it('rejects unknown vendors', () => {
		expect(isConfigDevice(device(0x1234, [config]))).toBe(false);
	});
});

describe('toBytes', () => {
	it('truncates oversized reports', () => {
		expect(toBytes([1, 2, 3, 4, 5, 6, 7, 8, 9])).toHaveLength(8);
	});
});
