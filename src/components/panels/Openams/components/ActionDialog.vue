<template>
    <dialog
        ref="dlg"
        class="oams-dialog"
        :aria-labelledby="headId"
        data-dialog="action"
        @cancel="dismiss"
        @close="dismiss">
        <div v-if="dialog" class="dlg-body">
            <h4 :id="headId" class="dlg-head">{{ heading }}</h4>
            <p v-if="dialog.mode === 'confirm'" class="dlg-text">{{ text }}</p>
            <template v-else>
                <div v-for="field in fields" :key="field.id" class="dlg-field">
                    <label :for="fieldId(field)">
                        {{ field.label }}
                        <span v-if="field.unit" class="dlg-unit">{{ field.unit }}</span>
                    </label>
                    <input
                        v-if="field.kind === 'toggle'"
                        :id="fieldId(field)"
                        type="checkbox"
                        :data-field="field.id"
                        :checked="checked(field)"
                        @change="onToggle(field, $event)" />
                    <select
                        v-else-if="field.kind === 'select'"
                        :id="fieldId(field)"
                        :data-field="field.id"
                        :value="value(field)"
                        @change="onSelect(field, $event)">
                        <option v-for="option in field.options" :key="option.value" :value="option.value">
                            {{ option.label }}
                        </option>
                    </select>
                    <input
                        v-else
                        :id="fieldId(field)"
                        type="number"
                        :data-field="field.id"
                        :min="field.min"
                        :max="field.max"
                        :step="field.step"
                        :value="value(field)"
                        @input="onNumber(field, $event)" />
                </div>
            </template>
            <div class="dlg-actions">
                <button type="button" class="dlg-btn" data-role="cancel" @click="dismiss">{{ cancelLabel }}</button>
                <button type="button" class="dlg-btn primary" :data-action="dialog.action.id" @click="ok">
                    {{ submitLabel }}
                </button>
            </div>
        </div>
    </dialog>
</template>

<script lang="ts">
import { Component, Inject, Prop, Vue, Watch } from 'vue-property-decorator'
import type { ViewField, ViewLabels } from '../logic/index'
import { INTERACT, type Interactivity } from '../interact'

let seq = 0

/** The panel's one dialog (docs/design/UNIFIED_UI.md 7: a native <dialog> with
 *  showModal(), in the top layer, with focus trapping and Escape for free). A
 *  form is where the task happens (principle 11); a confirm is shown verbatim
 *  before the action resolves, and only for a drastic one (principle 7). */
@Component
export default class ActionDialog extends Vue {
    @Prop({ default: null }) readonly labels!: ViewLabels | null
    @Inject(INTERACT) readonly ctrl!: Interactivity

    headId = `oams-dialog-head-${++seq}`

    get dialog() {
        return this.ctrl.dialog
    }

    get fields(): ViewField[] {
        return this.dialog?.action.form?.fields ?? []
    }

    /** A confirm is shown exactly as the core wrote it. */
    get heading(): string {
        const d = this.dialog
        if (!d) return ''
        return d.mode === 'confirm' ? (d.action.confirm?.title ?? d.action.label) : d.action.label
    }

    get text(): string {
        return this.dialog?.action.confirm?.text ?? ''
    }

    /** Buttons are verbs: the action's own label, or the confirmation's. */
    get submitLabel(): string {
        const d = this.dialog
        if (!d) return ''
        return d.mode === 'confirm' ? (d.action.confirm?.ok_label ?? d.action.label) : d.action.label
    }

    get cancelLabel(): string {
        return this.labels?.cancel ?? ''
    }

    fieldId(field: ViewField): string {
        return `${this.headId}-${field.id}`
    }

    /** A number or a select's option value, as the input wants it. */
    value(field: ViewField): string | number {
        const v = this.dialog?.values[field.id]
        return typeof v === 'boolean' ? Number(v) : (v ?? field.value)
    }

    checked(field: ViewField): boolean {
        return !!this.dialog?.values[field.id]
    }

    set(field: ViewField, value: string | number | boolean): void {
        this.ctrl.setValue(field.id, value)
    }

    onToggle(field: ViewField, event: Event): void {
        this.set(field, (event.target as HTMLInputElement).checked)
    }

    onSelect(field: ViewField, event: Event): void {
        this.set(field, Number((event.target as HTMLSelectElement).value))
    }

    onNumber(field: ViewField, event: Event): void {
        this.set(field, Number((event.target as HTMLInputElement).value))
    }

    @Watch('dialog')
    onDialog(): void {
        this.$nextTick(() => {
            const el = this.el
            if (!el) return
            if (this.dialog && !el.open) el.showModal()
            else if (!this.dialog && el.open) el.close()
        })
    }

    ok(): void {
        this.ctrl.submit()
    }

    /** Escape, the Cancel button, or the backdrop: nothing is sent. */
    dismiss(): void {
        this.ctrl.cancel()
    }

    private get el(): HTMLDialogElement | null {
        return (this.$refs.dlg as HTMLDialogElement | undefined) ?? null
    }
}
</script>

<style lang="scss" scoped>
@use '../tokens' as *;

.oams-dialog {
    width: min(400px, calc(100vw - 32px));
    margin: auto;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--oams-text, currentColor) 14%, var(--oams-pop-base, #14161a));
    border-radius: 16px;
    background: var(--oams-pop-base, #14161a);
    color: inherit;
    font-family: var(--oams-font-ui, inherit);
    font-size: var(--oams-fs-body);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.4);

    &::backdrop {
        background: rgba(0, 0, 0, 0.45);
    }
}

.dlg-body {
    padding: 18px 18px 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.dlg-head {
    font-size: var(--oams-fs-section);
    font-weight: var(--oams-fw-section);
    line-height: 1.3;
}

.dlg-text {
    line-height: 1.45;
}

.dlg-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 32px;

    label {
        display: flex;
        align-items: baseline;
        gap: 6px;
    }

    input[type='number'],
    select {
        width: 128px;
        min-height: 32px;
        padding: 4px 8px;
        border: 1px solid var(--oams-line);
        border-radius: 8px;
        background: var(--oams-surface-3);
        color: inherit;
        font: inherit;
    }

    input[type='checkbox'] {
        width: 20px;
        height: 20px;
        accent-color: var(--oams-accent);
    }
}

.dlg-unit {
    font-size: var(--oams-fs-meta);
    color: var(--oams-text-muted);
}

.dlg-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
}

.dlg-btn {
    @include oams-focus;
    min-height: 34px;
    min-width: 24px;
    margin: 0;
    padding: 7px 14px;
    border: 1px solid var(--oams-line);
    border-radius: 9px;
    background: var(--oams-surface-2);
    color: inherit;
    font: inherit;
    font-size: 13px;
    cursor: pointer;

    &:hover {
        background: var(--oams-surface-3);
    }

    &.primary {
        background: var(--oams-accent);
        border-color: transparent;
        color: #fff;
    }
}
</style>
