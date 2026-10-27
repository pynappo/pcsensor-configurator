/**
 * Key-code tables for PCsensor devices, derived from SetupElfKey 3.2.1.
 *
 * The device stores a key action as a small byte stream. Each byte names one
 * keyboard key ("usage"), a modifier bitmask, or a printable character.
 */

/** Modifier byte: left/right Ctrl, Shift, Alt, Meta (Win/Cmd). */
export const MODIFIERS = [
	{ code: 'ControlLeft', label: 'Ctrl', bit: 1 },
	{ code: 'ShiftLeft', label: 'Shift', bit: 2 },
	{ code: 'AltLeft', label: 'Alt', bit: 4 },
	{ code: 'MetaLeft', label: 'Win', bit: 8 },
	{ code: 'ControlRight', label: 'RightCtrl', bit: 16 },
	{ code: 'ShiftRight', label: 'RightShift', bit: 32 },
	{ code: 'AltRight', label: 'RightAlt', bit: 64 },
	{ code: 'MetaRight', label: 'RightMeta', bit: 128 }
] as const;

export type ModifierCode = (typeof MODIFIERS)[number]['code'];

/** Non `KeyboardEvent.code` keys, mapped to their wire byte. */
const SPECIAL_KEYS: Record<string, number> = {
	Enter: 40,
	Esc: 41,
	Backspace: 42,
	Tab: 43,
	Space: 44,
	'-': 45,
	'=': 46,
	'[': 47,
	']': 48,
	'\\': 49,
	';': 51,
	"'": 52,
	'`': 53,
	',': 54,
	'.': 55,
	'/': 56,
	CapsLock: 57,
	Delete: 76,
	End: 77,
	Home: 74,
	Insert: 73,
	PageDown: 78,
	PageUp: 75,
	Right: 79,
	Left: 80,
	Down: 81,
	Up: 82,
	NumLock: 83,
	ScrollLock: 71,
	Pause: 72,
	PrintScreen: 70,
	ContextMenu: 101,
	Numpad0: 98,
	NumpadEnter: 88,
	'Numpad.': 99,
	'Numpad+': 87,
	'Numpad-': 86,
	'Numpad*': 85,
	'Numpad/': 84
};

/** Mouse button bitmask: left, right, middle, back, forward. */
export const MOUSE_BUTTONS = [
	{ code: 'Mouse-Left', label: 'Left', bit: 1 },
	{ code: 'Mouse-Right', label: 'Right', bit: 2 },
	{ code: 'Mouse-Middle', label: 'Middle', bit: 4 },
	{ code: 'Mouse-Backward', label: 'Back', bit: 8 },
	{ code: 'Mouse-Forward', label: 'Forward', bit: 16 }
] as const;

/** Media wire byte -> human label. Index is the wire byte. */
export const MEDIA_KEYS = [
	'',
	'Volume Down',
	'Volume Up',
	'Mute',
	'Play/Pause',
	'Previous Track',
	'Next Track',
	'Stop',
	'Open Player',
	'Browser Home',
	'Stop Page',
	'Browser Back',
	'Browser Forward',
	'Refresh Page',
	'My Computer',
	'Open Email',
	'Calculator',
	'Search Files',
	'Shut Down',
	'Sleep'
] as const;

/** Every wire byte value accepted by `readKey`'s printable-character check. */
const PUNCTUATION: Record<string, [number, number]> = {
	// char: [non-JIS byte, JIS byte]
	'!': [158, 158],
	'@': [159, 47],
	'#': [160, 160],
	$: [161, 161],
	'%': [162, 162],
	'^': [163, 46],
	'&': [164, 163],
	'*': [165, 180],
	'(': [166, 165],
	')': [167, 166],
	' ': [44, 44],
	'-': [45, 45],
	_: [173, 232],
	'=': [46, 173],
	'+': [174, 179],
	'[': [47, 48],
	'{': [175, 176],
	']': [48, 49],
	'}': [176, 177],
	'\\': [49, 104],
	'|': [177, 234],
	';': [51, 51],
	':': [179, 52],
	"'": [52, 179],
	'"': [180, 180],
	'`': [53, 53],
	'~': [181, 181],
	',': [54, 54],
	'<': [182, 182],
	'.': [55, 55],
	'>': [183, 183],
	'/': [56, 56],
	'?': [184, 184]
};

/**
 * Encodes a keyboard key name (browser `KeyboardEvent.code`, or a name from
 * SPECIAL_KEYS) to its wire byte. Returns 0 when the key is unsupported.
 */
export function keyToByte(key: string): number {
	let m: RegExpExecArray | null;
	if ((m = /^Key([A-Z])$/.exec(key))) return m[1].charCodeAt(0) - 61;
	if ((m = /^Digit([1-9])$/.exec(key))) return m[1].charCodeAt(0) - 19;
	if ((m = /^Numpad([1-9])$/.exec(key))) return m[1].charCodeAt(0) + 40;
	if ((m = /^F([1-9]|1[0-9]|2[0-4])$/.exec(key))) {
		const n = Number(m[1]);
		return n <= 12 ? n + 57 : n + 91;
	}
	if (key === 'Digit0' || key === 'NumpadInsert') return 39;
	return SPECIAL_KEYS[key] ?? 0;
}

/**
 * Decodes a wire byte to a `KeyboardEvent.code`; empty string when unknown.
 * The result round-trips through `keyToByte`.
 */
export function keyByteToLabel(byte: number): string {
	if (byte >= 4 && byte <= 29) return `Key${String.fromCharCode(byte + 61)}`;
	if (byte >= 30 && byte <= 38) return `Digit${byte - 29}`;
	if (byte === 39) return 'Digit0';
	if (byte >= 58 && byte <= 69) return `F${byte - 57}`;
	if (byte >= 104 && byte <= 115) return `F${byte - 91}`;
	for (const [name, code] of Object.entries(SPECIAL_KEYS)) if (code === byte) return name;
	return '';
}

/** Encodes one printable character for a text-string action. */
export function charToByte(ch: string, jis = false): number {
	if (ch >= 'a' && ch <= 'z') return ch.charCodeAt(0) - 93;
	if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) + 67;
	if (ch >= '1' && ch <= '9') return ch.charCodeAt(0) - 19;
	if (ch === '0') return 39;
	if (ch === '\n') return 40;
	const pair = PUNCTUATION[ch];
	if (pair) return jis ? pair[1] : pair[0];
	return 0;
}

/** Decodes a text-string action byte back to a character. */
export function byteToChar(byte: number): string {
	if (byte >= 4 && byte <= 29) return String.fromCharCode(byte + 93);
	if (byte >= 132 && byte <= 157) return String.fromCharCode(byte - 67);
	if (byte >= 30 && byte <= 38) return String(byte - 29);
	if (byte === 39) return '0';
	if (byte === 40) return '\n';
	if (byte === 43) return '\t';
	for (const [ch, [plain]] of Object.entries(PUNCTUATION)) if (plain === byte) return ch;
	return '';
}

export function modifiersToByte(codes: readonly string[]): number {
	return MODIFIERS.reduce((acc, m) => (codes.includes(m.code) ? acc | m.bit : acc), 0);
}

export function byteToModifiers(byte: number): string[] {
	return MODIFIERS.filter((m) => byte & m.bit).map((m) => m.code);
}

export function mouseButtonsToByte(names: readonly string[]): number {
	return MOUSE_BUTTONS.reduce((acc, b) => (names.includes(b.code) ? acc | b.bit : acc), 0);
}

export function byteToMouseButtons(byte: number): string[] {
	return MOUSE_BUTTONS.filter((b) => byte & b.bit).map((b) => b.label);
}
