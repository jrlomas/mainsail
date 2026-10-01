<template>
    <panel
        v-if="klipperReadyForGui"
        :title="$t('Panels.OpenamsPanel.Headline')"
        :icon="mdiViewGrid"
        :collapsible="true"
        card-class="openams-control-panel">
        <v-card-text class="pt-1">
            <openams-view :logic="adapter.logic" :language="language" theme="host" @request="onRequest" />
        </v-card-text>
    </panel>
</template>
<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import { mdiViewGrid } from '@mdi/js'
import BaseMixin from '@/components/mixins/base'
import { EventBus } from '@/plugins/eventBus'
import { OpenamsAdapter, OPENAMS_SPOOLMAN_STATUS, panelLanguage } from './Openams/adapter'
import type { OpenamsStoreState } from './Openams/adapter'
import OpenamsView from './Openams/components/OpenamsView.vue'
import type { ActionResult } from './Openams/logic'

/** The words of a refused call: Mainsail's socket rejects with the JSON-RPC
 *  error, `{ code, message }`. */
function errorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'message' in error)
        return String((error as { message: unknown }).message)

    return String(error)
}

@Component({ components: { OpenamsView } })
export default class OpenamsPanel extends Mixins(BaseMixin) {
    mdiViewGrid = mdiViewGrid

    adapter = new OpenamsAdapter()

    private unwatch: (() => void) | null = null
    private onSpoolmanStatus: ((payload: unknown) => void) | null = null

    mounted() {
        this.unwatch = this.$watch(
            () => this.openamsStoreState,
            () => this.feed(),
            { deep: true }
        )
        this.onSpoolmanStatus = (payload: unknown) => this.adapter.applyComponentStatus(payload)
        EventBus.$on(OPENAMS_SPOOLMAN_STATUS, this.onSpoolmanStatus)

        this.feed()
        this.requestComponentStatus()
    }

    beforeDestroy() {
        this.unwatch?.()
        if (this.onSpoolmanStatus) EventBus.$off(OPENAMS_SPOOLMAN_STATUS, this.onSpoolmanStatus)
    }

    /** Only the slices the logic reads, so the watcher is not woken by the rest
     *  of the (constantly changing) printer and server state. */
    get openamsStoreState(): OpenamsStoreState {
        return {
            printer: {
                oams_manager: this.$store.state.printer.oams_manager,
                print_stats: this.$store.state.printer.print_stats,
                toolhead: this.$store.state.printer.toolhead,
                current_file: this.$store.state.printer.current_file,
                ...this.openamsUiObjects,
            },
            server: { spoolman: { spools: this.$store.state.server?.spoolman?.spools } },
        }
    }

    get openamsUiObjects(): Record<string, unknown> {
        const printer: Record<string, unknown> = this.$store.state.printer
        const objects: Record<string, unknown> = {}

        for (const [key, value] of Object.entries(printer)) {
            if (key.startsWith('openams_ui ')) objects[key] = value
        }

        return objects
    }

    /** The language the panel is drawn in, which is the page's: inside
     *  Mainsail the language is the user's choice in Mainsail, not the panel's
     *  (principle 1, we are a guest), so the panel has no picker of its own and
     *  reads the host's locale.
     *
     *  A getter, not a field read once: that makes it a computed property, and
     *  vue-i18n keeps `locale` in a reactive `_vm` of its own, so picking a
     *  language in Mainsail re-reads this and hands the view a new one. */
    get language(): string {
        return panelLanguage(this.$i18n.locale)
    }

    /** What the user chose in the panel, sent the way Mainsail sends its own:
     *  G-code through the gcode script call (so it shows in the console), an RPC
     *  by its method, a refusal as Mainsail's transient error. A `local` result
     *  is display-only and goes nowhere.
     *
     *  The spool edit is the one call waited on: the printer can refuse it in
     *  words of its own ("Spoolman is offline"), which go back to the panel with
     *  `done`, and the vendor list is read again after it (the host may have
     *  added one). */
    onRequest(result: ActionResult, done?: (message?: string) => void) {
        const socket = this.$socket as unknown as {
            emit: (method: string, params?: unknown) => void
            emitAndWait: (method: string, params?: unknown) => Promise<unknown>
        }

        switch (result.kind) {
            case 'gcode':
                socket.emit('printer.gcode.script', { script: result.script })
                break
            case 'rpc':
                if (result.method === 'server.openams_spoolman.edit') {
                    socket.emitAndWait(result.method, result.params).then(
                        () => {
                            done?.()
                            this.requestVendors()
                        },
                        (error: unknown) => done?.(errorMessage(error))
                    )
                } else {
                    socket.emit(result.method, result.params)
                }
                break
            case 'error':
                this.$toast.error(result.reason)
                break
            default:
                break
        }
    }

    feed() {
        this.adapter.feedStore(this.openamsStoreState)
    }

    async requestComponentStatus() {
        // The status call is not one of the typed Moonraker RPC methods, so this
        // is the one place the panel reaches past that list.
        const socket = this.$socket as unknown as {
            emitAndWait: (method: string, params?: unknown) => Promise<unknown>
        }

        try {
            const status = await socket.emitAndWait('server.openams_spoolman.status')

            this.adapter.applyComponentStatus(status)
            if ((status as { edit?: unknown } | null)?.edit === true) this.requestVendors()
        } catch (e) {
            window.console.warn('[OpenAMS]: server.openams_spoolman.status failed', e)
        }
    }

    /** The names the spool editor offers as vendors: Spoolman's own list, read
     *  the way Mainsail reads its spools (through the proxy). A host whose
     *  component can edit has Spoolman, so this only runs then. */
    async requestVendors() {
        const socket = this.$socket as unknown as {
            emitAndWait: (method: string, params?: unknown) => Promise<unknown>
        }

        try {
            this.adapter.applyVendorList(
                await socket.emitAndWait('server.spoolman.proxy', { request_method: 'GET', path: '/v1/vendor' })
            )
        } catch (e) {
            window.console.warn('[OpenAMS]: the Spoolman vendor list failed', e)
        }
    }
}
</script>
