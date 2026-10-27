/**
 * Minimal WebHID typings. TypeScript's bundled DOM lib does not declare the
 * WebHID API, so we declare the slice we use.
 */

interface HIDReportItem {
	isAbsolute: boolean;
	isArray: boolean;
	isConstant: boolean;
	isLinear: boolean;
	isRange: boolean;
	isVolatile: boolean;
	hasNull: boolean;
	usages?: number[];
	usageMinimum?: number;
	usageMaximum?: number;
	reportSize: number;
	reportCount: number;
	unitExponent: number;
	unit: number;
	logicalMinimum: number;
	logicalMaximum: number;
	physicalMinimum: number;
	physicalMaximum: number;
	strings?: string[];
}

interface HIDReportInfo {
	reportId: number;
	items: HIDReportItem[];
}

interface HIDCollectionInfo {
	usagePage?: number;
	usage?: number;
	type: number;
	children: HIDCollectionInfo[];
	inputReports: HIDReportInfo[];
	outputReports: HIDReportInfo[];
	featureReports: HIDReportInfo[];
}

interface HIDDevice extends EventTarget {
	readonly opened: boolean;
	readonly vendorId: number;
	readonly productId: number;
	readonly productName: string;
	readonly collections: HIDCollectionInfo[];
	readonly oninputreport: ((this: HIDDevice, ev: HIDInputReportEvent) => unknown) | null;
	open(): Promise<void>;
	close(): Promise<void>;
	sendReport(reportId: number, data: BufferSource): Promise<void>;
	sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
	receiveFeatureReport(reportId: number): Promise<DataView>;
}

interface HIDInputReportEvent extends Event {
	readonly device: HIDDevice;
	readonly reportId: number;
	readonly data: DataView;
}

interface HIDConnectionEvent extends Event {
	readonly device: HIDDevice;
}

interface HIDDeviceFilter {
	vendorId?: number;
	productId?: number;
	usagePage?: number;
	usage?: number;
}

interface HIDDeviceRequestOptions {
	filters: HIDDeviceFilter[];
	exclusionFilters?: HIDDeviceFilter[];
}

interface HID extends EventTarget {
	readonly onconnect: ((this: HID, ev: HIDConnectionEvent) => unknown) | null;
	readonly ondisconnect: ((this: HID, ev: HIDConnectionEvent) => unknown) | null;
	getDevices(): Promise<HIDDevice[]>;
	requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
}

interface Navigator {
	readonly hid: HID;
}
