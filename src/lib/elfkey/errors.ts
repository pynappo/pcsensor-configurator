/** Error raised for device and protocol failures. */
export class DeviceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DeviceError';
	}
}
