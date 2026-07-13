<template>
    <panel
        :icon="mdiCircleMultiple"
        :title="$t('Panels.OamsPanel.Headline')"
        card-class="oams-control-panel"
        :collapsible="true">
        <div class="oams-panel" :class="{ 'theme-light': !isDark }" :lang="lang">
            <div class="oams-panel-body">
                <p v-if="hasGaps" class="app-warning">{{ $t('Panels.OamsPanel.WarningGaps') }}</p>
                <p v-if="model.toolheads.length === 0" class="app-loading">{{ $t('Panels.OamsPanel.NoData') }}</p>
                <oams-toolhead-card
                    v-for="(toolhead, toolheadIndex) in model.toolheads"
                    :key="toolheadIndex"
                    :toolhead="toolhead"
                    :show-material-labels="showMaterialLabels"
                    @add-group="addGroup"
                    @remove-group="removeGroup"
                    @load-group="loadGroup"
                    @unload-group="unloadGroup(toolheadIndex)"
                    @assign-bay="
                        (fpsIndex, oamsIndex, bayIndex, group) =>
                            assignBay(toolheadIndex, fpsIndex, oamsIndex, bayIndex, group)
                    "
                    @save-pid="
                        (fpsIndex, oamsIndex, payload) => savePid(toolheadIndex, fpsIndex, oamsIndex, payload)
                    " />
            </div>
        </div>
    </panel>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import Panel from '@/components/ui/Panel.vue'
import { mdiCircleMultiple } from '@mdi/js'
import { buildOamsModel } from '@/components/panels/Oams/oamsAdapter'
import { OamsPidLoop, OamsSystemModel } from '@/components/panels/Oams/types'
import OamsToolheadCard from '@/components/panels/Oams/OamsToolheadCard.vue'
import '@/components/panels/Oams/oams-ui.scss'

@Component({ components: { Panel, OamsToolheadCard } })
export default class OamsPanel extends Mixins(BaseMixin) {
    mdiCircleMultiple = mdiCircleMultiple
    showMaterialLabels = true

    get isDark(): boolean {
        return this.$vuetify.theme.dark
    }

    get lang(): string {
        return this.$store.state.gui?.general?.language ?? 'en'
    }

    get model(): OamsSystemModel {
        return buildOamsModel(this.$store.state.printer)
    }

    get filamentGroups(): string[] {
        const groups = this.model.toolheads.flatMap((toolhead) => toolhead.filament_groups)
        return [...new Set(groups)]
    }

    // Sequence gap check across global filament groups (T0, T1, ...).
    get hasGaps(): boolean {
        const nums = this.filamentGroups
            .map((g) => Number(g.replace(/^T/, '')))
            .filter((n) => !Number.isNaN(n))
            .sort((a, b) => a - b)
        for (let i = 1; i < nums.length; i += 1) if (nums[i] !== nums[i - 1] + 1) return true
        return false
    }

    sendGcode(gcode: string): void {
        this.$store.dispatch('printer/sendGcode', gcode)
    }

    addGroup(): void {
        const max = this.filamentGroups.reduce((acc, g) => {
            const n = Number(g.replace(/^T/, ''))
            return Number.isNaN(n) ? acc : Math.max(acc, n)
        }, -1)
        this.sendGcode(`OAMSM_CREATE_GROUP GROUP=T${max + 1}`)
    }

    removeGroup(group: string): void {
        this.sendGcode(`OAMSM_DELETE_GROUP GROUP=${group}`)
    }

    loadGroup(group: string): void {
        this.sendGcode(`OAMSM_LOAD_FILAMENT GROUP=${group}`)
    }

    unloadGroup(toolheadIndex: number): void {
        const fps = this.model.toolheads[toolheadIndex]?.fps[0]
        if (!fps) return
        this.sendGcode(`OAMSM_UNLOAD_FILAMENT FPS=${fps.name}`)
    }

    assignBay(toolheadIndex: number, fpsIndex: number, oamsIndex: number, bayIndex: number, group: string): void {
        const unit = this.model.toolheads[toolheadIndex]?.fps[fpsIndex]?.oams[oamsIndex]
        if (!unit) return
        const bay = unit.bays[bayIndex]
        // Toggle: clicking a bay already in the selected group removes it.
        const command = bay?.filament_group === group ? 'OAMSM_UNASSIGN_BAY' : 'OAMSM_ASSIGN_BAY'
        this.sendGcode(`${command} GROUP=${group} OAMS=${unit.name} BAY=${bayIndex}`)
    }

    savePid(
        toolheadIndex: number,
        fpsIndex: number,
        oamsIndex: number,
        payload: { rewind: OamsPidLoop; follower: OamsPidLoop }
    ): void {
        const unit = this.model.toolheads[toolheadIndex]?.fps[fpsIndex]?.oams[oamsIndex]
        if (!unit) return
        const { rewind, follower } = payload
        // follower_loop = hub-motor (pressure) PID; rewind_loop = rewind-current PID.
        this.sendGcode(`OAMS_PID_SET OAMS=${unit.index} P=${follower.p} I=${follower.i} D=${follower.d}`)
        this.sendGcode(`OAMS_CURRENT_PID_SET OAMS=${unit.index} P=${rewind.p} I=${rewind.i} D=${rewind.d}`)
    }
}
</script>
