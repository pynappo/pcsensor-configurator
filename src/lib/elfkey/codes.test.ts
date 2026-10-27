import { describe, expect, it } from 'vitest';
import {
	byteToChar,
	byteToModifiers,
	byteToMouseButtons,
	charToByte,
	keyByteToLabel,
	keyToByte,
	modifiersToByte,
	mouseButtonsToByte
} from './codes';

describe('keyboard key codes', () => {
	it('encodes letters, digits, function keys and named keys', () => {
		expect(keyToByte('KeyA')).toBe(4);
		expect(keyToByte('KeyZ')).toBe(29);
		expect(keyToByte('Digit1')).toBe(30);
		expect(keyToByte('Digit0')).toBe(39);
		expect(keyToByte('F1')).toBe(58);
		expect(keyToByte('F12')).toBe(69);
		expect(keyToByte('Space')).toBe(44);
		expect(keyToByte('Left')).toBe(80);
	});

	it('encodes every F-key including F13 to F24', () => {
		for (let n = 1; n <= 24; n++) {
			const byte = keyToByte(`F${n}`);
			expect(byte, `F${n}`).toBeGreaterThan(0);
			expect(keyByteToLabel(byte), `F${n}`).toBe(`F${n}`);
		}
		expect(keyToByte('F13')).toBe(104);
		expect(keyToByte('F24')).toBe(115);
	});

	it('returns 0 for keys the device cannot store', () => {
		expect(keyToByte('AudioVolumeUp')).toBe(0);
		expect(keyToByte('Nope')).toBe(0);
	});

	it('round-trips every encodable key', () => {
		const names = [
			'KeyA', 'KeyQ', 'KeyZ', 'Digit1', 'Digit9', 'Digit0', 'F1', 'F12', 'F24',
			'Enter', 'Esc', 'Backspace', 'Tab', 'Space', 'CapsLock', 'Delete', 'Home',
			'End', 'PageUp', 'PageDown', 'Insert', 'Left', 'Right', 'Up', 'Down',
			'Numpad0', 'Numpad+', 'NumpadEnter', 'ContextMenu'
		];
		for (const name of names) {
			const byte = keyToByte(name);
			expect(byte, name).toBeGreaterThan(0);
			expect(keyByteToLabel(byte), name).toBe(name);
		}
	});
});

describe('modifiers and mouse buttons', () => {
	it('packs modifier bitmasks', () => {
		expect(modifiersToByte(['ControlLeft'])).toBe(1);
		expect(modifiersToByte(['ControlLeft', 'ShiftLeft'])).toBe(3);
		expect(modifiersToByte(['MetaRight'])).toBe(128);
		expect(byteToModifiers(5)).toEqual(['ControlLeft', 'AltLeft']);
	});

	it('packs mouse button bitmasks', () => {
		expect(mouseButtonsToByte(['Mouse-Left'])).toBe(1);
		expect(mouseButtonsToByte(['Mouse-Left', 'Mouse-Right', 'Mouse-Forward'])).toBe(19);
		expect(byteToMouseButtons(19)).toEqual(['Left', 'Right', 'Forward']);
	});
});

describe('text-string characters', () => {
	it('encodes the printable ASCII range the device supports', () => {
		expect(charToByte('a')).toBe(4);
		expect(charToByte('z')).toBe(29);
		expect(charToByte('A')).toBe(132);
		expect(charToByte('Z')).toBe(157);
		expect(charToByte('5')).toBe(34);
		expect(charToByte('0')).toBe(39);
		expect(charToByte(' ')).toBe(44);
		expect(charToByte('!')).toBe(158);
		expect(charToByte('\n')).toBe(40);
	});

	it('rejects characters outside the device character set', () => {
		expect(charToByte('é')).toBe(0);
		expect(charToByte('€')).toBe(0);
	});

	it('round-trips every printable character', () => {
		const printable =
			'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890' +
			'!@#$%^&*()-_=+[]{}|;:\'",.<>/?`~ \n';
		for (const ch of printable) {
			const byte = charToByte(ch);
			expect(byte, JSON.stringify(ch)).toBeGreaterThan(0);
			expect(byteToChar(byte), JSON.stringify(ch)).toBe(ch);
		}
	});
});
