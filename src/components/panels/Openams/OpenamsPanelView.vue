<template>
    <div>
        <div v-for="toolhead in view.toolheads" :key="toolhead.id" class="mb-2">
            <div class="text--secondary">{{ toolhead.title }} ({{ toolhead.subtitle }})</div>
            <div v-for="tile in tiles(toolhead.units)" :key="tile.slot_id" class="text--disabled">
                {{ tile.label }}: {{ tile.state }}
            </div>
        </div>
        <div v-for="unit in view.unassigned_units" :key="unit.id" class="mb-2">
            <div class="text--secondary">{{ unit.title }} ({{ unit.subtitle }})</div>
            <div v-for="tile in tiles([unit])" :key="tile.slot_id" class="text--disabled">
                {{ tile.label }}: {{ tile.state }}
            </div>
        </div>
        <div v-if="view.toolheads.length === 0 && view.unassigned_units.length === 0" class="text--disabled">
            {{ $t('Panels.OpenamsPanel.NoUnits') }}
        </div>
    </div>
</template>
<script lang="ts">
import { Component, Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import type { Core, View, ViewTile, ViewUnit } from './logic'

@Component
export default class OpenamsPanelView extends Mixins(BaseMixin) {
    @Prop({ required: true }) declare readonly logic: Core

    view: View = this.logic.view()

    private unsubscribe: (() => void) | null = null

    created() {
        this.unsubscribe = this.logic.subscribe((view: View) => {
            this.view = view
        })
    }

    beforeDestroy() {
        this.unsubscribe?.()
    }

    tiles(units: ViewUnit[]): ViewTile[] {
        return units.flatMap((unit) => unit.bays)
    }
}
</script>
