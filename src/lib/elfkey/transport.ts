/**
 * WebHID transport for PCsensor configurable devices.
 *
 * WebUSB refuses the configuration interface because it is a HID device, so
 * the browser's HID API is used instead. Messages are fixed 8-byte output
 * reports; replies arrive as 8-byte input reports.
 */
import { DeviceError } from './errors';

/** Vendor IDs known to ship PCsensor-configurable devices. */
export const KNOWN_VENDOR_IDS = [0x3553, 0x1a86, 0x2329, 0x248a] as const;

export type Bytes = Uint8Array;
export type Report = number[] | Bytes;

export const REPORT_SIZE = 8;

/** Usage page carrying the 8-byte configuration channel. */
export const CONFIG_USAGE_PAGE = 0x0001;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TransportLogEntry {
	dir: 'tx' | 'rx' | 'info' | 'error';
	bytes: number[];
	text: string;
	at: number;
}

/**
 * Report ID to use for the configuration channel, taken from the descriptor.
 * FS2020 pedals declare output report 0, so the leading 0x01 the device expects
 * is payload rather than a report ID.
 */
function resolveReportId(device: HIDDevice): number {
	const outputs = device.collections
		.filter((c) => c.usagePage === CONFIG_USAGE_PAGE)
		.flatMap((c) => c.outputReports);
	return outputs[0]?.reportId ?? 0;
}

/** First byte of every command frame. */
export const FRAME_PREFIX = 0x01;

/**
 * A device is usable when it exposes the 8-byte configuration channel. Pedals
 * present a second HID interface for keystrokes, which shares the product name
 * and cannot carry configuration commands.
 */
export function isConfigDevice(device: HIDDevice): boolean {
	if (!(KNOWN_VENDOR_IDS as readonly number[]).includes(device.vendorId)) return false;
	return device.collections.some(
		(c) => c.usagePage === CONFIG_USAGE_PAGE && c.outputReports.length > 0
	);
}

function describe(device: HIDDevice): string {
	const hex = (n: number) => n.toString(16).padStart(4, '0');
	return `${device.productName || 'Unknown device'} (${hex(device.vendorId)}:${hex(device.productId)})`;
}

export class HidTransport {
	readonly device: HIDDevice;
	readonly log: TransportLogEntry[] = [];
	readonly reportId: number;
	private queue: Bytes[] = [];
	private waiters: ((value: Bytes | null) => void)[] = [];
	private listener: (event: HIDInputReportEvent) => void;

	private constructor(device: HIDDevice, reportId: number) {
		this.device = device;
		this.reportId = reportId;
		this.listener = (event) => {
			const view = event.data;
			const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
			this.record('rx', Array.from(bytes), '');
			const waiter = this.waiters.shift();
			if (waiter) waiter(bytes);
			else this.queue.push(bytes);
		};
		device.addEventListener('inputreport', this.listener as EventListener);
	}

	/** Returns devices the user has already granted access to. */
	static async list(): Promise<HIDDevice[]> {
		if (!('hid' in navigator)) return [];
		const devices = await navigator.hid.getDevices();
		return devices.filter(isConfigDevice);
	}

	/** Opens the browser device picker. Returns null when the user cancels. */
	static async request(): Promise<HIDDevice | null> {
		if (!('hid' in navigator)) throw new DeviceError('WebHID is not available in this browser.');
		try {
			const devices = await navigator.hid.requestDevice({
				filters: KNOWN_VENDOR_IDS.map((vendorId) => ({ vendorId }))
			});
			return devices.find(isConfigDevice) ?? null;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'NotFoundError') return null;
			throw err;
		}
	}

	static async open(device: HIDDevice): Promise<HidTransport> {
		if (!device.opened) await device.open();
		const transport = new HidTransport(device, resolveReportId(device));
		transport.record('info', [transport.reportId], `opened ${describe(device)}`);
		return transport;
	}

	get label(): string {
		return describe(this.device);
	}

	private record(dir: TransportLogEntry['dir'], bytes: number[], text: string): void {
		this.log.push({ dir, bytes, text, at: Date.now() });
		if (this.log.length > 500) this.log.shift();
	}

	/** Reads and discards queued input, e.g. unsolicited button presses. */
	async drain(): Promise<void> {
		this.queue.length = 0;
		for (let i = 0; i < 32; i++) {
			const report = await this.read(30);
			if (!report) return;
		}
	}

	/**
	 * Drops reports buffered from before the next request. Replies are not
	 * tagged with the key they answer, so a late reply from a previous request
	 * would otherwise be returned for the current one.
	 */
	discard(): void {
		this.queue.length = 0;
	}

	/**
	 * Sends one 8-byte frame. Commands are prefixed with 0x01; data reports are
	 * sent verbatim, since the payload's own length byte is its first byte.
	 */
	async write(report: Report, kind: FrameKind = 'command'): Promise<void> {
		const bytes = kind === 'command' ? toFrame(report) : toBytes(report);
		this.record('tx', Array.from(bytes), '');
		try {
			await this.device.sendReport(this.reportId, bytes.buffer as ArrayBuffer);
		} catch (err) {
			this.record('error', [], String((err as Error).message));
			throw new DeviceError(`Write failed: ${(err as Error).message}`);
		}
	}

	/** Sends one message and waits until the device has surely processed it. */
	async writeWait(report: Report, delayMs = 20, kind: FrameKind = 'command'): Promise<void> {
		await this.write(report, kind);
		await sleep(delayMs);
	}

	/** Reads one input report, or null on timeout. */
	read(timeoutMs = 1000): Promise<Bytes | null> {
		const queued = this.queue.shift();
		if (queued) return Promise.resolve(queued);
		return new Promise((resolve) => {
			let settled = false;
			const finish = (value: Bytes | null) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve(value);
			};
			const timer = setTimeout(() => {
				const index = this.waiters.indexOf(finish);
				if (index !== -1) this.waiters.splice(index, 1);
				finish(null);
			}, timeoutMs);
			this.waiters.push(finish);
		});
	}

	/** Serialises a write-then-read exchange so responses cannot interleave. */
	private locked: Promise<unknown> = Promise.resolve();

	exclusive<T>(fn: () => Promise<T>): Promise<T> {
		const run = this.locked.then(fn, fn);
		this.locked = run.catch(() => undefined);
		return run;
	}

	async close(): Promise<void> {
		this.record('info', [], 'closed');
		this.device.removeEventListener('inputreport', this.listener as EventListener);
		this.queue.length = 0;
		for (const waiter of this.waiters.splice(0)) waiter(null);
		await this.device.close();
	}
}

/**
 * Frame kind: `command` frames are prefixed with 0x01 and carry 7 command
 * bytes; `data` frames are sent verbatim from the payload's first byte.
 */
export type FrameKind = 'command' | 'data';

/**
 * Builds a command frame: the 0x01 prefix then the command bytes, padded to
 * 8 bytes.
 */
function toFrame(report: Report): Bytes {
	const out = new Uint8Array(REPORT_SIZE);
	out[0] = FRAME_PREFIX;
	out.set(Array.from(report).slice(0, REPORT_SIZE - 1), 1);
	return out;
}

/** Right-pads command bytes to the fixed 8-byte message size. */
export function toBytes(report: Report): Bytes {
	const out = new Uint8Array(REPORT_SIZE);
	out.set(Array.from(report).slice(0, REPORT_SIZE));
	return out;
}

export function toHex(bytes: ArrayLike<number>): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}
