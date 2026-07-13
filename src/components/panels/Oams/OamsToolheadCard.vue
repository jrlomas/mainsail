<template>
    <section class="toolhead-card">
        <div class="toolhead-header">
            <label class="entity-name-wrap">
                <span class="entity-label">{{ $t('Panels.OamsPanel.Toolhead') }}</span>
                <span class="entity-name-label toolhead-title-input">{{ toolhead.name }}</span>
            </label>
            <span
                class="toolhead-state-badge"
                :class="'toolhead-state-badge--' + resolvedState"
                :title="$t('Panels.OamsPanel.State') + ': ' + stateLabel(resolvedState)">
                <span class="toolhead-state-icon" :class="'toolhead-state-icon--' + resolvedState" aria-hidden="true" />
                <span class="toolhead-state-text">{{ stateLabel(resolvedState) }}</span>
            </span>
        </div>

        <aside class="toolhead-groups-panel">
            <div class="toolhead-section-header">
                <h3 class="toolhead-groups-title">{{ $t('Panels.OamsPanel.FilamentGroups') }}</h3>
                <button type="button" class="panel-toggle-btn" @click="groupsMinimized = !groupsMinimized">
                    {{ groupsMinimized ? '+' : '−' }}
                </button>
            </div>
            <span class="toolhead-range">{{ rangeLabel }}</span>
            <template v-if="!groupsMinimized">
                <div class="toolhead-group-actions">
                    <button type="button" class="toolhead-group-action-btn" @click="$emit('add-group')">
                        {{ $t('Panels.OamsPanel.AddGroup') }}
                    </button>
                    <button
                        type="button"
                        class="toolhead-group-action-btn"
                        :disabled="selectedGroup === null"
                        @click="removeSelected">
                        {{ $t('Panels.OamsPanel.RemoveGroup') }}
                    </button>
                    <button
                        type="button"
                        class="toolhead-group-action-btn toolhead-group-action-btn--load"
                        :class="{ 'toolhead-group-action-btn--unload': isSelectedGroupLoaded }"
                        :disabled="selectedGroup === null || (!isSelectedGroupLoaded && !canLoadSelected)"
                        @click="loadOrUnloadSelected">
                        {{ isSelectedGroupLoaded ? $t('Panels.OamsPanel.Unload') : $t('Panels.OamsPanel.Load') }}
                    </button>
                </div>
                <div class="toolhead-groups-list">
                    <button
                        v-for="group in filamentGroups"
                        :key="toolhead.name + '-' + group"
                        type="button"
                        class="toolhead-group-btn"
                        :class="{
                            'toolhead-group-btn--active': selectedGroup === group,
                            'toolhead-group-btn--loaded': loadedGroup === group,
                            'toolhead-group-btn--has-spool': groupsWithInserted.has(group),
                        }"
                        @click="toggleSelect(group)">
                        {{ group }}
                    </button>
                </div>
                <p class="toolhead-groups-hint">{{ $t('Panels.OamsPanel.GroupsHint') }}</p>
            </template>
        </aside>

        <div class="toolhead-fps-list">
            <oams-fps-card
                v-for="(fps, fpsIndex) in toolhead.fps"
                :key="toolhead.name + '-' + fps.name"
                :fps="fps"
                :selected-group="selectedGroup"
                :show-material-labels="showMaterialLabels"
                @assign-bay="(oamsIndex, bayIndex) => onAssignBay(fpsIndex, oamsIndex, bayIndex)"
                @save-pid="(oamsIndex, payload) => $emit('save-pid', fpsIndex, oamsIndex, payload)" />
        </div>
    </section>
</template>

<script lang="ts">
import { Component, Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { ToolheadUnit } from '@/components/panels/Oams/types'
import OamsFpsCard from '@/components/panels/Oams/OamsFpsCard.vue'

@Component({ components: { OamsFpsCard } })
export default class OamsToolheadCard extends Mixins(BaseMixin) {
    @Prop({ required: true, type: Object }) declare readonly toolhead: ToolheadUnit
    @Prop({ default: true, type: Boolean }) declare readonly showMaterialLabels: boolean

    selectedGroup: string | null = null
    groupsMinimized = false

    get filamentGroups(): string[] {
        return this.toolhead.filament_groups
    }

    get rangeLabel(): string {
        const g = this.filamentGroups
        if (g.length === 0) return this.$t('Panels.OamsPanel.NoGroups').toString()
        const range = g.length === 1 ? g[0] : `${g[0]} – ${g[g.length - 1]}`
        return this.$t('Panels.OamsPanel.GroupsRange', { range }).toString()
    }

    get hasLoadedBay(): boolean {
        return this.toolhead.fps.some((f) => f.oams.some((o) => o.bays.some((b) => b.state === 'loaded')))
    }

    get resolvedState(): string {
        return this.hasLoadedBay ? 'loaded' : 'ready'
    }

    get isSelectedGroupLoaded(): boolean {
        if (!this.selectedGroup) return false
        return this.bayMatches((b) => b.filament_group === this.selectedGroup && b.state === 'loaded')
    }

    get canLoadSelected(): boolean {
        if (!this.selectedGroup) return false
        return this.bayMatches((b) => b.filament_group === this.selectedGroup && b.state === 'inserted')
    }

    get loadedGroup(): string | null {
        for (const f of this.toolhead.fps)
            for (const o of f.oams)
                for (const b of o.bays) if (b.state === 'loaded' && b.filament_group) return b.filament_group
        return null
    }

    get groupsWithInserted(): Set<string> {
        const result = new Set<string>()
        for (const f of this.toolhead.fps)
            for (const o of f.oams)
                for (const b of o.bays)
                    if ((b.state === 'inserted' || b.state === 'loaded') && b.filament_group)
                        result.add(b.filament_group)
        return result
    }

    bayMatches(predicate: (b: { filament_group: string; state: string }) => boolean): boolean {
        return this.toolhead.fps.some((f) => f.oams.some((o) => o.bays.some(predicate)))
    }

    stateLabel(state: string): string {
        const map: Record<string, string> = {
            loaded: this.$t('Panels.OamsPanel.StateLoaded').toString(),
            ready: this.$t('Panels.OamsPanel.StateReady').toString(),
        }
        return map[state] ?? state
    }

    toggleSelect(group: string) {
        this.selectedGroup = this.selectedGroup === group ? null : group
    }

    removeSelected() {
        if (this.selectedGroup === null) return
        this.$emit('remove-group', this.selectedGroup)
        this.selectedGroup = null
    }

    loadOrUnloadSelected() {
        if (!this.selectedGroup) return
        this.$emit(this.isSelectedGroupLoaded ? 'unload-group' : 'load-group', this.selectedGroup)
        this.selectedGroup = null
    }

    onAssignBay(fpsIndex: number, oamsIndex: number, bayIndex: number) {
        if (!this.selectedGroup) return
        this.$emit('assign-bay', fpsIndex, oamsIndex, bayIndex, this.selectedGroup)
    }
}
</script>
