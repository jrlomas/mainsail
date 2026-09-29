<template>
    <panel
        v-if="klipperReadyForGui"
        :title="$t('Panels.OpenamsPanel.Headline')"
        :icon="mdiViewGrid"
        :collapsible="true"
        card-class="openams-control-panel">
        <v-card-text class="pt-1">
            <openams-panel-view :logic="adapter.logic" />
        </v-card-text>
    </panel>
</template>
<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import { mdiViewGrid } from '@mdi/js'
import BaseMixin from '@/components/mixins/base'
import { EventBus } from '@/plugins/eventBus'
import { OpenamsAdapter, OPENAMS_SPOOLMAN_STATUS } from '@/components/panels/Openams/adapter'
import type { OpenamsStoreState } from '@/components/panels/Openams/adapter'

@Component
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
            this.adapter.applyComponentStatus(await socket.emitAndWait('server.openams_spoolman.status'))
        } catch (e) {
            window.console.warn('[OpenAMS]: server.openams_spoolman.status failed', e)
        }
    }
}
</script>
