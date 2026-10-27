<script lang="ts">
	import { MODIFIERS, keyToByte, keyByteToLabel } from '$lib/elfkey/codes';

	let { modifiers = $bindable([]), keys = $bindable([]) }: {
		modifiers: string[];
		keys: string[];
	} = $props();

	let capturing = $state(false);
	let manualKey = $state('');

	/**
	 * Resolves a typed key name to a `KeyboardEvent.code`, e.g. `F13`, `f13`,
	 * `Numpad7`, `a`. `keyToByte` is authoritative: anything it maps to a
	 * nonzero byte is valid.
	 */
	function resolveKeyName(input: string): string | null {
		const trimmed = input.trim();
		if (!trimmed) return null;
		const upper = trimmed.toUpperCase();
		const candidates = [
			trimmed,
			upper,
			/^[A-Z]$/.test(upper) ? `Key${upper}` : '',
			/^[0-9]$/.test(trimmed) ? `Digit${trimmed}` : ''
		];
		for (const candidate of candidates) {
			if (candidate && keyToByte(candidate) > 0) return candidate;
		}
		return null;
	}

	function addManualKey() {
		const name = resolveKeyName(manualKey);
		manualKey = '';
		if (!name || keys.includes(name) || keys.length >= 6) return;
		keys = [...keys, name];
	}

	const manualInvalid = $derived(manualKey.trim().length > 0 && !resolveKeyName(manualKey));

	function toggleModifier(code: string) {
		modifiers = modifiers.includes(code)
			? modifiers.filter((c) => c !== code)
			: [...modifiers, code];
	}

	function clear() {
		modifiers = [];
		keys = [];
	}

	function isModifier(code: string): boolean {
		return MODIFIERS.some((m) => m.code === code);
	}

	/** True for elements that handle typing themselves. */
	function isTextEntry(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		if (target.isContentEditable) return true;
		return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
	}

	function onKeyDown(event: KeyboardEvent) {
		if (!capturing) return;
		// Typing in a field, e.g. the key-name box, must not be captured.
		if (isTextEntry(event.target)) return;
		event.preventDefault();
		event.stopPropagation();
		if (event.code === 'Escape') {
			capturing = false;
			return;
		}
		if (isModifier(event.code)) {
			if (!modifiers.includes(event.code)) modifiers = [...modifiers, event.code];
			return;
		}
		if (!keys.includes(event.code) && keys.length < 6) keys = [...keys, event.code];
	}
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="keyboard">
	<p class="hint">Hold modifiers, then press a key. Press <kbd>Esc</kbd> to finish.</p>
	<div class="modifiers">
		{#each MODIFIERS as mod (mod.code)}
			<button
				type="button"
				class="mod"
				class:active={modifiers.includes(mod.code)}
				onclick={() => toggleModifier(mod.code)}>{mod.label}</button
			>
		{/each}
	</div>
	<button
		type="button"
		class="capture"
		class:active={capturing}
		onclick={() => (capturing = !capturing)}>
		{#if keys.length}
			{keys.map((k) => keyByteToLabel(keyToByte(k)) || k).join(' + ')}
		{:else}
			Click, then press a key
		{/if}
	</button>
	<button type="button" class="clear" onclick={clear}>Clear</button>

	<div class="manual">
		<label>
			<span class="label">Or type a key name</span>
			<input
				type="text"
				bind:value={manualKey}
				placeholder="F13, F24, Numpad7, CapsLock"
				class:invalid={manualInvalid}
				onfocus={() => (capturing = false)}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						addManualKey();
					}
				}}
			/>
		</label>
		<button type="button" onclick={addManualKey} disabled={!manualKey.trim() || manualInvalid}>
			Add
		</button>
	</div>
	{#if manualInvalid}
		<p class="error">Not a key the device supports.</p>
	{/if}
</div>

<style>
	.keyboard {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.hint {
		flex-basis: 100%;
		margin: 0 0 0.25rem;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.modifiers {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}
	button {
		border: 1px solid var(--border);
		background: var(--surface);
		color: inherit;
		border-radius: 6px;
		padding: 0.4rem 0.7rem;
		cursor: pointer;
		font: inherit;
	}
	button:hover {
		border-color: var(--accent);
	}
	.mod.active,
	.capture.active {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.capture {
		min-width: 12rem;
		text-align: left;
	}
	.clear {
		margin-left: auto;
	}
	.manual {
		display: flex;
		flex-basis: 100%;
		align-items: flex-end;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}
	.manual label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
	}
	.label {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.manual input {
		font: inherit;
		color: inherit;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.4rem 0.6rem;
		width: 100%;
	}
	.manual input.invalid {
		border-color: #d9534f;
	}
	.error {
		flex-basis: 100%;
		margin: 0;
		font-size: 0.8rem;
		color: #d9534f;
	}
</style>
