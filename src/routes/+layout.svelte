<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	:global(:root) {
		--bg: #0f1115;
		--surface: #171a21;
		--border: #2a2f3a;
		--muted: #8b94a3;
		--accent: #4d8bf5;
		--text: #e6e9ef;
		color-scheme: dark;
	}

	@media (prefers-color-scheme: light) {
		:global(:root) {
			--bg: #f7f8fa;
			--surface: #ffffff;
			--border: #dfe3e8;
			--muted: #667085;
			--accent: #2f6fdd;
			--text: #1a1d23;
			color-scheme: light;
		}
	}

	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			sans-serif;
		line-height: 1.5;
	}

	:global(button) {
		font: inherit;
		background: var(--bg);
		border: 1px solid var(--border);
		color: inherit;
		border-radius: 6px;
		padding: 0.45rem 0.8rem;
		cursor: pointer;
	}

	:global(button:hover:not(:disabled)) {
		border-color: var(--accent);
	}

	:global(button:disabled) {
		opacity: 0.55;
		cursor: default;
	}

	:global(button.active),
	:global(button.primary) {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}

	:global(code) {
		background: var(--bg);
		border-radius: 4px;
		padding: 0.1rem 0.3rem;
		font-size: 0.9em;
	}

	:global(kbd) {
		border: 1px solid var(--border);
		border-bottom-width: 2px;
		border-radius: 4px;
		padding: 0 0.3rem;
		font-size: 0.85em;
	}
</style>
