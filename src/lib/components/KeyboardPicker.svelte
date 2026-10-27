<script lang="ts">
	import { MODIFIERS } from '$lib/elfkey/codes';

	let { modifiers = $bindable([]), keys = $bindable([]) }: {
		modifiers: string[];
		keys: string[];
	} = $props();

	let capturing = $state(false);

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

	function onKeyDown(event: KeyboardEvent) {
		if (!capturing) return;
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
			{keys.join(' + ')}
		{:else}
			{modifiers.length ? 'Click, then press a key' : 'Click, then press a key'}
		{/if}
	</button>
	<button type="button" class="clear" onclick={clear}>Clear</button>
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
</style>
