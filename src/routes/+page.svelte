<script lang="ts">
	import { onMount } from 'svelte';
	import KeyboardPicker from '$lib/components/KeyboardPicker.svelte';
	import { describeAction, ElfKeyDevice, isWebHidAvailable, type KeyAction } from '$lib/elfkey/device';
	import { MEDIA_KEYS, MOUSE_BUTTONS } from '$lib/elfkey/codes';
	import { DeviceError } from '$lib/elfkey/errors';
	import { HidTransport, toHex } from '$lib/elfkey/transport';

	type Mode = 'keyboard' | 'mouse' | 'media' | 'string';

	let hidAvailable = $state(true);
	let device = $state<ElfKeyDevice | null>(null);
	let savedDevices = $state<HIDDevice[]>([]);
	let selectedKey = $state(1);
	let current = $state<KeyAction | null>(null);
	let busy = $state(false);
	let status = $state('');
	let error = $state('');

	let mode = $state<Mode>('keyboard');
	let modifiers = $state<string[]>([]);
	let keys = $state<string[]>([]);
	let mouseButtons = $state<string[]>([]);
	let mouseX = $state(0);
	let mouseY = $state(0);
	let mouseWheel = $state(0);
	let media = $state(1);
	let text = $state('');
	let showLog = $state(false);

	onMount(() => {
		hidAvailable = isWebHidAvailable();
		if (hidAvailable) refreshSaved();
	});

	async function refreshSaved() {
		try {
			savedDevices = await HidTransport.list();
		} catch {
			savedDevices = [];
		}
	}

	function resetForm() {
		modifiers = [];
		keys = [];
		mouseButtons = [];
		mouseX = 0;
		mouseY = 0;
		mouseWheel = 0;
		media = 1;
		text = '';
	}

	/** Mirrors a read-back action into the edit form. */
	function loadForm(action: KeyAction | null) {
		resetForm();
		if (!action) return;
		switch (action.kind) {
			case 'keyboard':
				mode = 'keyboard';
				modifiers = action.modifiers;
				keys = action.keys;
				break;
			case 'mouse':
				mode = 'mouse';
				mouseButtons = action.buttons;
				mouseX = action.x;
				mouseY = action.y;
				mouseWheel = action.wheel;
				break;
			case 'media':
				mode = 'media';
				media = action.media;
				break;
			case 'string':
				mode = 'string';
				text = action.text;
				break;
		}
	}

	async function withBusy(label: string, fn: () => Promise<void>) {
		busy = true;
		error = '';
		status = label;
		try {
			await fn();
			status = 'Done.';
		} catch (err) {
			error = err instanceof DeviceError ? err.message : String(err);
			status = '';
		} finally {
			busy = false;
		}
	}

	async function openDevice(usb: HIDDevice) {
		await withBusy('Opening device…', async () => {
			const transport = await HidTransport.open(usb);
			const connected = await ElfKeyDevice.connect(transport);
			device = connected;
			selectedKey = 1;
			await refreshKey();
		});
	}

	async function connectNew() {
		await withBusy('Waiting for device selection…', async () => {
			const usb = await HidTransport.request();
			if (!usb) {
				status = '';
				return;
			}
			await openDevice2(usb);
		});
	}

	async function openDevice2(usb: HIDDevice) {
		const transport = await HidTransport.open(usb);
		const connected = await ElfKeyDevice.connect(transport);
		device = connected;
		selectedKey = 1;
		await refreshSaved();
		await refreshKey();
	}

	async function disconnect() {
		await withBusy('Disconnecting…', async () => {
			await device?.disconnect();
			device = null;
			current = null;
		});
	}

	/**
	 * Reads `keyNumber` and adopts the result only if it is still the selected
	 * key, so a slow read cannot overwrite the display after the user moves on.
	 */
	async function refreshKey(keyNumber = selectedKey) {
		const target = device;
		if (!target) return;
		const action = await target.readKey(keyNumber);
		if (keyNumber !== selectedKey) return;
		current = action;
		loadForm(action);
	}

	function selectKey(keyNumber: number) {
		selectedKey = keyNumber;
		current = null;
		withBusy(`Reading key ${keyNumber}…`, () => refreshKey(keyNumber));
	}

	function buildAction(): KeyAction {
		switch (mode) {
			case 'keyboard':
				return { kind: 'keyboard', modifiers, keys };
			case 'mouse':
				return { kind: 'mouse', buttons: mouseButtons, x: mouseX, y: mouseY, wheel: mouseWheel };
			case 'media':
				return { kind: 'media', media };
			case 'string':
				return { kind: 'string', text };
		}
	}

	async function save() {
		const target = device;
		const keyNumber = selectedKey;
		if (!target) return;
		await withBusy('Writing to device…', async () => {
			const action = await target.writeKey(keyNumber, buildAction());
			if (keyNumber !== selectedKey) return;
			current = action;
			loadForm(action);
		});
	}

	function toggleMouseButton(code: string) {
		mouseButtons = mouseButtons.includes(code)
			? mouseButtons.filter((c) => c !== code)
			: [...mouseButtons, code];
	}

	const keyNumbers = $derived(
		device ? Array.from({ length: device.info.keyCount }, (_, i) => i + 1) : []
	);
</script>

<main>
	<header>
		<h1>ElfKey</h1>
		<p class="subtitle">Configure PCsensor foot switches and macro keys over USB.</p>
	</header>

	{#if !hidAvailable}
		<div class="panel error">
			<h2>WebHID is not available</h2>
			<p>
				Open this page in Chromium or Chrome, served from <code>localhost</code> or HTTPS. Firefox
				does not implement WebHID.
			</p>
		</div>
	{:else}
		<section class="panel">
			<h2>Device</h2>
			{#if device}
				<div class="device-row">
					<div>
						<strong>{device.info.model}</strong>
						<span class="muted">
							v{device.info.version} · {device.info.keyCount}
							{device.info.keyCount === 1 ? 'key' : 'keys'} · {device.transport.label}
						</span>
					</div>
					<button type="button" onclick={disconnect} disabled={busy}>Disconnect</button>
				</div>
			{:else}
				<div class="device-row">
					<div class="muted">
						{#if savedDevices.length}
							Previously authorised devices:
						{:else}
							No device connected.
						{/if}
					</div>
					<button type="button" class="primary" onclick={connectNew} disabled={busy}>
						Connect device
					</button>
				</div>
				{#if savedDevices.length}
					<ul class="saved">
						{#each savedDevices as usb, index (index)}
							<li>
								<button type="button" onclick={() => withBusy('Connecting…', () => openDevice2(usb))} disabled={busy}>
									{usb.productName ?? 'Unknown device'}
									<span class="muted">
										{usb.vendorId.toString(16).padStart(4, '0')}:{usb.productId
											.toString(16)
											.padStart(4, '0')}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</section>

		{#if device}
			<section class="panel">
				<h2>Keys</h2>
				<div class="keys">
					{#each keyNumbers as n (n)}
						<button
							type="button"
							class="key"
							class:active={n === selectedKey}
							onclick={() => selectKey(n)}
							disabled={busy}>{n}</button
						>
					{/each}
				</div>
				<p class="current" class:pending={!current}>
					Current action:
					<strong>{current ? describeAction(current) : 'reading…'}</strong>
				</p>
			</section>

			<section class="panel">
				<h2>Assign action to key {selectedKey}</h2>
				<div class="modes">
					{#each [{ id: 'keyboard', label: 'Keyboard' }, { id: 'mouse', label: 'Mouse' }, { id: 'media', label: 'Media' }, { id: 'string', label: 'Text' }] as m (m.id)}
						<button
							type="button"
							class:active={mode === m.id}
							onclick={() => (mode = m.id as Mode)}>{m.label}</button
						>
					{/each}
				</div>

				{#if mode === 'keyboard'}
					<KeyboardPicker bind:modifiers bind:keys />
				{:else if mode === 'mouse'}
					<div class="field">
						<span class="label">Buttons</span>
						<div class="buttons">
							{#each MOUSE_BUTTONS as b (b.code)}
								<button
									type="button"
									class:active={mouseButtons.includes(b.code)}
									onclick={() => toggleMouseButton(b.code)}>{b.label}</button
								>
							{/each}
						</div>
					</div>
					<div class="grid">
						<label>Move X <input type="number" min="-127" max="127" bind:value={mouseX} /></label>
						<label>Move Y <input type="number" min="-127" max="127" bind:value={mouseY} /></label>
						<label>Wheel <input type="number" min="-127" max="127" bind:value={mouseWheel} /></label>
					</div>
				{:else if mode === 'media'}
					<label class="field">
						<span class="label">Media key</span>
						<select bind:value={media}>
							{#each MEDIA_KEYS as label, index (index)}
								{#if index > 0}
									<option value={index}>{label}</option>
								{/if}
							{/each}
						</select>
					</label>
				{:else}
					<label class="field">
						<span class="label">Text to type</span>
						<textarea bind:value={text} rows="3" placeholder="e.g. Hello, world!"></textarea>
						<span class="muted">Letters, digits and ASCII punctuation only.</span>
					</label>
				{/if}

				<div class="actions">
					<button type="button" class="primary" onclick={save} disabled={busy}>Save to device</button>
					<button type="button" onclick={() => loadForm(current)} disabled={busy}>Revert</button>
				</div>
			</section>
		{/if}
	{/if}

	{#if status || error}
		<p class="status" class:error={error}>{error || status}</p>
	{/if}

	{#if device?.transport.log.length}
		<section class="panel">
			<button type="button" class="link" onclick={() => (showLog = !showLog)}>
				{showLog ? 'Hide' : 'Show'} USB log ({device.transport.log.length})
			</button>
			{#if showLog}
				<pre class="log">
{#each device.transport.log as entry, i (i)}{entry.dir === 'tx' ? '→' : entry.dir === 'rx' ? '←' : '·'} {entry.text || toHex(entry.bytes)}
{/each}</pre>
			{/if}
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 52rem;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
	}
	h1 {
		margin: 0;
		font-size: 1.6rem;
	}
	.subtitle {
		margin: 0.25rem 0 1.5rem;
		color: var(--muted);
	}
	h2 {
		font-size: 1rem;
		margin: 0 0 0.75rem;
	}
	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 1rem 1.25rem;
		margin-bottom: 1rem;
	}
	.panel.error {
		border-color: #d9534f;
	}
	.device-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.device-row strong {
		display: block;
	}
	.muted {
		color: var(--muted);
		font-size: 0.85rem;
	}
	.saved {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.saved button {
		width: 100%;
		text-align: left;
		display: flex;
		justify-content: space-between;
	}
	.keys {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	/* Fixed height so switching keys never reflows the panel below. */
	.current {
		margin: 0.75rem 0 0;
		min-height: 1.5rem;
		font-size: 0.85rem;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.current strong {
		color: var(--text);
	}
	.current.pending strong {
		font-weight: normal;
		opacity: 0.6;
	}
	.key {
		width: 2.5rem;
		height: 2.5rem;
	}
	.modes {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	.buttons {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-bottom: 1rem;
	}
	.label {
		font-size: 0.85rem;
		color: var(--muted);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.grid label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	textarea,
	select,
	input {
		font: inherit;
		color: inherit;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.45rem 0.6rem;
		width: 100%;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	.status {
		font-size: 0.9rem;
	}
	.status.error {
		color: #d9534f;
	}
	.log {
		font-size: 0.75rem;
		max-height: 18rem;
		overflow: auto;
		margin: 0.75rem 0 0;
		white-space: pre-wrap;
		word-break: break-all;
	}
	.link {
		background: none;
		border: none;
		color: var(--accent);
		cursor: pointer;
		padding: 0;
		font: inherit;
	}
</style>
