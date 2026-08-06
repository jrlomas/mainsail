<template>
    <section class="fps-card" :class="cardClasses">
        <div class="fps-header">
            <label class="entity-name-wrap">
                <span class="entity-label">{{ $t('Panels.OamsPanel.Fps') }}</span>
                <span class="entity-name-label fps-title-input">{{ fps.name }}</span>
            </label>
            <div class="fps-header-actions">
                <div v-if="!minimized" class="fps-gauge fps-gauge--inline">
                    <span class="fps-gauge-end">0</span>
                    <div class="fps-bar-track fps-bar-track--inline">
                        <div class="fps-bar-fill" :style="{ width: percent + '%' }" />
                        <span class="fps-threshold-stem" :style="{ left: lower * 100 + '%' }" />
                        <span class="fps-threshold-stem" :style="{ left: upper * 100 + '%' }" />
                        <span
                            class="fps-threshold-marker fps-threshold-marker--lower"
                            :style="{ left: lower * 100 + '%' }"
                            :title="$t('Panels.OamsPanel.LowerThreshold') + ': ' + lowerDisplay">
                            <span class="fps-threshold-label">{{ lowerDisplay }}</span>
                        </span>
                        <span
                            class="fps-threshold-marker fps-threshold-marker--upper"
                            :style="{ left: upper * 100 + '%' }"
                            :title="$t('Panels.OamsPanel.UpperThreshold') + ': ' + upperDisplay">
                            <span class="fps-threshold-label">{{ upperDisplay }}</span>
                        </span>
                        <span class="fps-bar-value">{{ valueDisplay }}</span>
                    </div>
                    <span class="fps-gauge-end">1</span>
                </div>
                <button
                    type="button"
                    class="panel-toggle-btn"
                    :title="minimized ? $t('Panels.OamsPanel.Expand') : $t('Panels.OamsPanel.Minimize')"
                    @click="minimized = !minimized">
                    {{ minimized ? '+' : '−' }}
                </button>
            </div>
        </div>

        <template v-if="!minimized">
            <div class="fps-gauge fps-gauge--below">
                <span class="fps-gauge-end">0</span>
                <div class="fps-bar-track fps-bar-track--below">
                    <div class="fps-bar-fill" :style="{ width: percent + '%' }" />
                    <span class="fps-threshold-stem" :style="{ left: lower * 100 + '%' }" />
                    <span class="fps-threshold-stem" :style="{ left: upper * 100 + '%' }" />
                    <span class="fps-bar-value">{{ valueDisplay }}</span>
                </div>
                <span class="fps-gauge-end">1</span>
            </div>
            <div class="fps-oams-grid">
                <oams-unit-card
                    v-for="(unit, oamsIndex) in fps.oams"
                    :key="fps.name + '-' + unit.index"
                    :oams="unit"
                    :selected-group="selectedGroup"
                    :show-material-labels="showMaterialLabels"
                    @assign-bay="(bayIndex) => $emit('assign-bay', oamsIndex, bayIndex)"
                    @device-action="(payload) => $emit('device-action', oamsIndex, payload)"
                    @save-pid="(payload) => $emit('save-pid', oamsIndex, payload)" />
                <div v-if="oamsSlots === 1" class="oams-card oams-card--placeholder" aria-hidden="true" />
            </div>
        </template>
    </section>
</template>

<script lang="ts">
import { Component, Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { FpsUnit } from '@/components/panels/Oams/types'
import OamsUnitCard from '@/components/panels/Oams/OamsUnitCard.vue'

@Component({ components: { OamsUnitCard } })
export default class OamsFpsCard extends Mixins(BaseMixin) {
    @Prop({ required: true, type: Object }) declare readonly fps: FpsUnit
    @Prop({ default: null, type: String }) declare readonly selectedGroup: string | null
    @Prop({ default: true, type: Boolean }) declare readonly showMaterialLabels: boolean

    minimized = false

    get clamped(): number {
        return Math.max(0, Math.min(1, this.fps.value))
    }

    get percent(): number {
        return this.clamped * 100
    }

    get lower(): number {
        return Math.max(0, Math.min(1, this.fps.fps_lower_threshold))
    }

    get upper(): number {
        return Math.max(this.lower, Math.min(1, this.fps.fps_upper_threshold))
    }

    get valueDisplay(): string {
        return (Math.ceil(this.clamped * 100) / 100).toFixed(2)
    }

    get lowerDisplay(): string {
        return this.lower.toFixed(2)
    }

    get upperDisplay(): string {
        return this.upper.toFixed(2)
    }

    get oamsSlots(): number {
        return Math.min(2, Math.max(1, this.fps.oams.length))
    }

    get cardClasses() {
        return {
            'fps-card--single': this.oamsSlots === 1,
            'fps-card--double': this.oamsSlots !== 1,
            'fps-card--minimized': this.minimized,
        }
    }
}
</script>
