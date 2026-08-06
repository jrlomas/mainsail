<template>
    <div class="oams-device-details">
        <div v-if="oams.capability_warnings.length" class="oams-device-warning-list">
            <p v-for="warning in oams.capability_warnings" :key="warning" class="app-warning">{{ warning }}</p>
        </div>

        <div class="oams-device-metrics oams-device-metrics--capabilities">
            <div v-for="metric in capabilityMetrics" :key="metric.label" class="oams-device-metric">
                <span class="oams-device-metric-label">{{ metric.label }}</span>
                <strong class="oams-device-metric-value">{{ metric.value }}</strong>
            </div>
        </div>

        <div v-if="faultMessages.length" class="oams-device-warning-list">
            <p v-for="fault in faultMessages" :key="fault" class="app-warning">{{ fault }}</p>
        </div>

        <section v-if="hasDryer" class="oams-device-section">
            <div class="oams-device-section-header">
                <h5>{{ $t('Panels.OamsPanel.Dryer') }}</h5>
                <span class="oams-chip">{{ statusText(dryerState) }}</span>
            </div>
            <div class="oams-device-metrics">
                <div v-for="metric in dryerMetrics" :key="metric.label" class="oams-device-metric">
                    <span class="oams-device-metric-label">{{ metric.label }}</span>
                    <strong class="oams-device-metric-value">{{ metric.value }}</strong>
                </div>
            </div>
            <div v-if="canStartDryer" class="oams-device-control-grid">
                <label class="oams-settings-input-wrap">
                    <span class="oams-settings-input-label">{{ $t('Panels.OamsPanel.TargetTemperature') }}</span>
                    <input
                        v-model.number="dryerTarget"
                        class="oams-settings-input"
                        type="number"
                        step="1"
                        :min="dryerMinimum"
                        :max="dryerMaximum" />
                </label>
                <label class="oams-settings-input-wrap">
                    <span class="oams-settings-input-label">{{ $t('Panels.OamsPanel.DurationMinutes') }}</span>
                    <input
                        v-model.number="dryerDurationMinutes"
                        class="oams-settings-input"
                        type="number"
                        step="1"
                        min="1"
                        max="10080" />
                </label>
                <button type="button" class="oams-settings-btn-primary" @click="startDryer">
                    {{ $t('Panels.OamsPanel.StartDryer') }}
                </button>
                <button
                    v-if="can('dryer_stop')"
                    type="button"
                    class="oams-settings-btn-secondary"
                    @click="emitAction('dryer_stop')">
                    {{ $t('Panels.OamsPanel.StopDryer') }}
                </button>
            </div>
            <p v-else class="oams-device-note">{{ $t('Panels.OamsPanel.ControlUnavailable') }}</p>
        </section>

        <section v-if="hasMotionStatus" class="oams-device-section">
            <div class="oams-device-section-header">
                <h5>{{ $t('Panels.OamsPanel.FollowerHealth') }}</h5>
                <span v-if="followerState" class="oams-chip">{{ statusText(followerState) }}</span>
            </div>
            <div class="oams-device-metrics">
                <div v-for="metric in motionMetrics" :key="metric.label" class="oams-device-metric">
                    <span class="oams-device-metric-label">{{ metric.label }}</span>
                    <strong class="oams-device-metric-value">{{ metric.value }}</strong>
                </div>
            </div>
        </section>

        <section v-if="hasPathStatus" class="oams-device-section">
            <div class="oams-device-section-header">
                <h5>{{ $t('Panels.OamsPanel.PathAndVents') }}</h5>
            </div>
            <div class="oams-device-metrics">
                <div v-for="metric in pathMetrics" :key="metric.label" class="oams-device-metric">
                    <span class="oams-device-metric-label">{{ metric.label }}</span>
                    <strong class="oams-device-metric-value">{{ metric.value }}</strong>
                </div>
            </div>
        </section>

        <section v-if="oams.capabilities.rfid" class="oams-device-section">
            <div class="oams-device-section-header">
                <h5>{{ $t('Panels.OamsPanel.Rfid') }}</h5>
                <button
                    v-if="can('rfid_scan')"
                    type="button"
                    class="oams-settings-btn-secondary"
                    @click="emitAction('rfid_scan')">
                    {{ $t('Panels.OamsPanel.Scan') }}
                </button>
            </div>
            <p v-if="oams.rfid.length === 0" class="oams-device-note">{{ $t('Panels.OamsPanel.NotScanned') }}</p>
            <div v-for="entry in oams.rfid" :key="entry.source + '-' + entry.reader" class="oams-rfid-row">
                <span>{{ $t('Panels.OamsPanel.Reader') }} {{ entry.reader }}</span>
                <strong>{{ entry.material || statusText(entry.status) }}</strong>
                <code v-if="entry.uid">{{ entry.uid.toUpperCase() }}</code>
            </div>
        </section>

        <div v-if="hasDeviceActions" class="oams-device-actions">
            <button
                v-if="can('calibrate_ptfe')"
                type="button"
                class="oams-settings-btn-secondary"
                @click="emitAction('calibrate_ptfe')">
                {{ $t('Panels.OamsPanel.CalibratePtfe') }}
            </button>
            <button
                v-if="can('calibrate_hub_hes')"
                type="button"
                class="oams-settings-btn-secondary"
                @click="emitAction('calibrate_hub_hes')">
                {{ $t('Panels.OamsPanel.CalibrateHubHes') }}
            </button>
            <button
                v-if="can('clear_fault')"
                type="button"
                class="oams-settings-btn-secondary"
                @click="emitAction('clear_fault')">
                {{ $t('Panels.OamsPanel.ClearFault') }}
            </button>
            <button
                v-if="can('clear_errors')"
                type="button"
                class="oams-settings-btn-secondary"
                @click="emitAction('clear_errors')">
                {{ $t('Panels.OamsPanel.ClearErrors') }}
            </button>
        </div>
    </div>
</template>

<script lang="ts">
import { Component, Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { OamsTelemetryChannel, OamsUnit } from '@/components/panels/Oams/types'

interface DeviceMetric {
    label: string
    value: string
}

@Component
export default class OamsDeviceDetails extends Mixins(BaseMixin) {
    @Prop({ required: true, type: Object }) declare readonly oams: OamsUnit

    dryerTarget = 55
    dryerDurationMinutes = 60

    get dryer(): OamsTelemetryChannel | undefined {
        return this.oams.telemetry.dryer
    }

    get follower(): OamsTelemetryChannel | undefined {
        return this.oams.telemetry.follower
    }

    get dryerState(): unknown {
        return this.dryer?.state_name
    }

    get followerState(): unknown {
        return this.follower?.state_name
    }

    get motor(): OamsTelemetryChannel | undefined {
        return this.oams.telemetry.motor
    }

    get ptfe(): OamsTelemetryChannel | undefined {
        return this.oams.telemetry.ptfe
    }

    get vent(): OamsTelemetryChannel | undefined {
        return this.oams.telemetry.vent
    }

    get hasDryer(): boolean {
        return this.oams.capabilities.dryer === true
    }

    get hasMotionStatus(): boolean {
        return !!this.follower || !!this.motor || this.oams.capabilities.autonomous_follower === true
    }

    get hasPathStatus(): boolean {
        return !!this.ptfe || !!this.vent || (this.oams.capabilities.vent_count ?? 0) > 0
    }

    get canStartDryer(): boolean {
        return this.can('dryer_start')
    }

    get dryerMinimum(): number {
        return this.oams.capabilities.dryer_target_min_c ?? 30
    }

    get dryerMaximum(): number {
        return this.oams.capabilities.dryer_target_max_c ?? 80
    }

    get capabilityMetrics(): DeviceMetric[] {
        return [
            this.metric('Bays', this.oams.bays.length),
            this.metric('Heaters', this.oams.capabilities.heater_count ?? 0),
            this.metric('Fans', this.oams.capabilities.fan_count ?? 0),
            this.metric('Vents', this.oams.capabilities.vent_count ?? 0),
        ]
    }

    get dryerMetrics(): DeviceMetric[] {
        return [
            this.metric('ChamberTemperature', this.number(this.dryer, 'chamber_c'), '°C', 1),
            this.metric('TargetTemperature', this.number(this.dryer, 'target_c'), '°C', 1),
            this.metric('AbsoluteHumidity', this.number(this.dryer, 'humidity_gm3'), ' g/m³', 2),
            this.metric('FanSpeed', this.number(this.dryer, 'fan_rpm'), ' RPM', 0),
            this.metric('Remaining', this.number(this.dryer, 'remaining_s'), ' s', 0),
            this.metric('VentPosition', this.text(this.dryer, 'vent_position_name')),
        ]
    }

    get motionMetrics(): DeviceMetric[] {
        return [
            this.metric('Buffer', this.number(this.follower, 'buffer_permille'), '‰', 0),
            this.metric('LearnedSpeed', this.number(this.follower, 'learned_frequency_hz'), ' Hz', 1),
            this.metric('CommandedSpeed', this.number(this.follower, 'commanded_frequency_hz'), ' Hz', 1),
            this.metric('MotorCurrent', this.number(this.motor, 'current_ma'), ' mA', 0),
            this.metric('MotorTemperature', this.oams.thermal.temperature_c, '°C', 1),
            this.metric('ThermalSlope', this.oams.thermal.slope_c_per_min, ' °C/min', 2),
            this.metric('TimeToTrip', this.oams.thermal.time_to_trip_s, ' s', 0),
            this.metric('StallRecoveries', this.number(this.follower, 'stall_recoveries'), '', 0),
        ]
    }

    get pathMetrics(): DeviceMetric[] {
        return [
            this.metric('PtfeLength', this.number(this.ptfe, 'path_clicks'), ' clicks', 0),
            this.metric('EncoderPosition', this.number(this.ptfe, 'encoder_relative_clicks'), ' clicks', 0),
            this.metric('VentOne', this.text(this.vent, 'vent1_state')),
            this.metric('VentTwo', this.text(this.vent, 'vent2_state')),
        ]
    }

    get faultMessages(): string[] {
        const faults: string[] = []
        const dryerFault = this.text(this.dryer, 'fault_name')
        const followerFault = this.text(this.follower, 'fault_name')
        if (dryerFault && dryerFault !== 'none') faults.push(this.statusText(dryerFault))
        if (followerFault && followerFault !== 'none') faults.push(this.statusText(followerFault))
        return faults
    }

    get hasDeviceActions(): boolean {
        return ['calibrate_ptfe', 'calibrate_hub_hes', 'clear_fault', 'clear_errors'].some((action) => this.can(action))
    }

    mounted(): void {
        const currentTarget = this.number(this.dryer, 'target_c')
        const preferred = currentTarget ?? 55
        this.dryerTarget = Math.max(this.dryerMinimum, Math.min(this.dryerMaximum, preferred))
    }

    can(action: string): boolean {
        return this.oams.supported_actions.includes(action)
    }

    startDryer(): void {
        const target = Math.max(this.dryerMinimum, Math.min(this.dryerMaximum, Number(this.dryerTarget)))
        const minutes = Math.max(1, Math.min(10080, Number(this.dryerDurationMinutes)))
        this.$emit('device-action', { action: 'dryer_start', duration: Math.round(minutes * 60), target })
    }

    emitAction(action: string): void {
        this.$emit('device-action', { action })
    }

    statusText(value: unknown): string {
        if (typeof value !== 'string' || value.length === 0) return this.$t('Panels.OamsPanel.Unknown').toString()
        return value
            .split('_')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ')
    }

    metric(key: string, value: unknown, suffix = '', digits = 0): DeviceMetric {
        const label = this.$t(`Panels.OamsPanel.${key}`).toString()
        if (typeof value === 'number' && Number.isFinite(value)) {
            return { label, value: `${value.toFixed(digits)}${suffix}` }
        }
        if (typeof value === 'string' && value.length) return { label, value: this.statusText(value) }
        return { label, value: '—' }
    }

    number(channel: OamsTelemetryChannel | undefined, key: string): number | null {
        const value = channel?.[key]
        return typeof value === 'number' && Number.isFinite(value) ? value : null
    }

    text(channel: OamsTelemetryChannel | undefined, key: string): string | null {
        const value = channel?.[key]
        return typeof value === 'string' ? value : null
    }
}
</script>
