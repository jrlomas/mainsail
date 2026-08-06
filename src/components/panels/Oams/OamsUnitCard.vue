<template>
    <div class="oams-card" :class="{ 'oams-card--preview': oams.preview, 'oams-card--selected': hasSelectedGroup }">
        <div class="oams-card-header">
            <label class="entity-name-wrap">
                <span class="entity-label">{{ $t('Panels.OamsPanel.Oams') }}</span>
                <span class="entity-name-label oams-title-input">{{ oams.name }}</span>
            </label>
            <div class="oams-chip-row">
                <span class="oams-chip">#{{ oams.index }}</span>
                <span class="oams-chip">{{ oams.type }}</span>
                <span
                    class="oams-chip oams-chip--state"
                    :class="'oams-chip--' + (oams.preview ? 'preview' : oams.state)">
                    {{ connectionLabel }}
                </span>
            </div>
            <button
                v-if="oams.state === 'online' || oams.preview"
                type="button"
                class="oams-settings-btn"
                :title="$t('Panels.OamsPanel.OamsSettings')"
                @click="openSettings">
                ⚙
            </button>
        </div>

        <div class="oams-bays-container">
            <div
                v-for="(bay, index) in oams.bays"
                :key="oams.name + '-bay-' + index"
                class="oams-bay"
                :class="bayClasses(bay)"
                :title="(bay.filament_group || $t('Panels.OamsPanel.Unassigned')) + ' • ' + bayStateLabel(bay.state)"
                @click="onBayClick(index)">
                <span class="oams-spool">
                    <span class="oams-spool-fill" :style="spoolFillStyle(bay)" />
                    <span v-if="showMaterialLabels && bay.material" class="oams-spool-material">
                        {{ bay.material }}
                    </span>
                </span>
                <span class="oams-bay-state-icon" :style="bayIconStyle(bay)" />
            </div>
        </div>

        <div class="oams-env-row" :aria-label="$t('Panels.OamsPanel.Environment')">
            <div
                class="oams-env-pill oams-env-pill--temp"
                :class="tempPillClass"
                :title="$t('Panels.OamsPanel.Temperature')">
                <span class="oams-env-label">{{ $t('Panels.OamsPanel.Temp') }}</span>
                <span class="oams-env-value">{{ tempDisplay }}</span>
            </div>
            <div class="oams-env-pill oams-env-pill--humidity" :class="humidityPillClass" :title="humidityLabel">
                <span class="oams-env-label">{{ humidityLabel }}</span>
                <span class="oams-env-value">{{ humidityDisplay }}</span>
            </div>
        </div>

        <div v-if="settingsOpen" class="oams-settings-overlay" @click="settingsOpen = false">
            <div class="oams-settings-dialog" @click.stop>
                <h4 class="oams-settings-title">{{ $t('Panels.OamsPanel.OamsSettingsHeader') }}</h4>

                <oams-device-details :oams="oams" @device-action="$emit('device-action', $event)" />

                <div v-if="canConfigurePid" class="oams-settings-section">
                    <span class="oams-settings-section-title">{{ $t('Panels.OamsPanel.RewindLoop') }}</span>
                    <div class="oams-settings-grid">
                        <label v-for="k in pidKeys" :key="'rw-' + k" class="oams-settings-input-wrap">
                            <span class="oams-settings-input-label">{{ k.toUpperCase() }}</span>
                            <input
                                v-model.number="rewindDraft[k]"
                                class="oams-settings-input"
                                type="number"
                                step="0.01" />
                        </label>
                    </div>
                </div>

                <div v-if="canConfigurePid" class="oams-settings-section">
                    <span class="oams-settings-section-title">{{ $t('Panels.OamsPanel.FollowerLoop') }}</span>
                    <div class="oams-settings-grid">
                        <label v-for="k in pidKeys" :key="'fl-' + k" class="oams-settings-input-wrap">
                            <span class="oams-settings-input-label">{{ k.toUpperCase() }}</span>
                            <input
                                v-model.number="followerDraft[k]"
                                class="oams-settings-input"
                                type="number"
                                step="0.01" />
                        </label>
                    </div>
                </div>

                <div class="oams-settings-actions">
                    <button type="button" class="oams-settings-btn-secondary" @click="settingsOpen = false">
                        {{ canConfigurePid ? $t('Panels.OamsPanel.Cancel') : $t('Panels.OamsPanel.Close') }}
                    </button>
                    <button v-if="canConfigurePid" type="button" class="oams-settings-btn-primary" @click="savePid">
                        {{ $t('Panels.OamsPanel.Save') }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { Component, Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { OamsBay, OamsPidLoop, OamsUnit } from '@/components/panels/Oams/types'
import OamsDeviceDetails from '@/components/panels/Oams/OamsDeviceDetails.vue'

@Component({ components: { OamsDeviceDetails } })
export default class OamsUnitCard extends Mixins(BaseMixin) {
    @Prop({ required: true, type: Object }) declare readonly oams: OamsUnit
    @Prop({ default: null, type: String }) declare readonly selectedGroup: string | null
    @Prop({ default: true, type: Boolean }) declare readonly showMaterialLabels: boolean

    pidKeys: Array<keyof OamsPidLoop> = ['p', 'i', 'd']
    settingsOpen = false
    rewindDraft: OamsPidLoop = { p: 0, i: 0, d: 0 }
    followerDraft: OamsPidLoop = { p: 0, i: 0, d: 0 }

    get hasSelectedGroup(): boolean {
        return this.selectedGroup !== null && this.oams.bays.some((b) => b.filament_group === this.selectedGroup)
    }

    get canConfigurePid(): boolean {
        return !this.oams.preview && this.oams.supported_actions.includes('configure_pid')
    }

    get connectionLabel(): string {
        if (this.oams.preview) return this.$t('Panels.OamsPanel.Preview').toString()
        return this.$t(`Panels.OamsPanel.${this.oams.state === 'online' ? 'Online' : 'Offline'}`).toString()
    }

    get tempDisplay(): string {
        return this.oams.temperature_c === null ? '—' : `${this.oams.temperature_c.toFixed(1)}°C`
    }

    get humidityDisplay(): string {
        if (this.oams.humidity_gm3 !== null) return `${this.oams.humidity_gm3.toFixed(2)} g/m³`
        return this.oams.humidity_rh === null ? '—' : `${Math.round(this.oams.humidity_rh)}%`
    }

    get humidityLabel(): string {
        const key = this.oams.humidity_gm3 === null ? 'Humidity' : 'AbsoluteHumidity'
        return this.$t(`Panels.OamsPanel.${key}`).toString()
    }

    // Neutral base pill when no sensor; coloured by reading when present.
    get tempPillClass(): string {
        const t = this.oams.temperature_c
        if (t === null) return ''
        const state = t > 30 ? 'hot' : t < 18 ? 'cool' : 'ideal'
        return `oams-env-pill--temp-${state}`
    }

    get humidityPillClass(): string {
        if (this.oams.humidity_gm3 !== null) return ''
        const h = this.oams.humidity_rh
        if (h === null) return ''
        const state = h >= 35 ? 'high' : h >= 20 ? 'watch' : 'ideal'
        return `oams-env-pill--humidity-${state}`
    }

    bayClasses(bay: OamsBay) {
        const selected = this.selectedGroup !== null
        return {
            ['oams-bay--' + bay.state]: true,
            'oams-bay--highlight': selected && bay.filament_group === this.selectedGroup,
            'oams-bay--dim': selected && bay.filament_group !== this.selectedGroup,
        }
    }

    bayStateLabel(state: string): string {
        const map: Record<string, string> = {
            inserted: this.$t('Panels.OamsPanel.Inserted').toString(),
            loaded: this.$t('Panels.OamsPanel.Loaded').toString(),
            empty: this.$t('Panels.OamsPanel.Empty').toString(),
        }
        return map[state] ?? state
    }

    spoolFillStyle(bay: OamsBay) {
        const ratio = bay.total_weight > 0 ? Math.max(0, Math.min(1, bay.current_weight / bay.total_weight)) : 0
        return { height: `${ratio * 100}%`, backgroundColor: bay.color }
    }

    bayIconStyle(bay: OamsBay) {
        const filled = bay.state === 'inserted' || bay.state === 'loaded'
        const style: Record<string, string> = {}
        if (filled) {
            style.backgroundColor = bay.color
            style.borderColor = bay.color
        } else if (bay.state === 'empty') {
            style.backgroundColor = this.hexWithAlpha(bay.color, '2e')
            style.borderColor = this.hexWithAlpha(bay.color, '88')
        }
        if (bay.state === 'inserted') style['--_dot-glow'] = this.hexWithAlpha(bay.color, '66')
        return style
    }

    hexWithAlpha(color: string, alphaHex: string): string {
        return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alphaHex}` : color
    }

    onBayClick(index: number) {
        if (this.oams.preview) return
        if (this.selectedGroup !== null) this.$emit('assign-bay', index)
    }

    openSettings() {
        this.rewindDraft = { ...this.oams.rewind_loop }
        this.followerDraft = { ...this.oams.follower_loop }
        this.settingsOpen = true
    }

    savePid() {
        this.$emit('save-pid', { rewind: { ...this.rewindDraft }, follower: { ...this.followerDraft } })
        this.settingsOpen = false
    }
}
</script>
