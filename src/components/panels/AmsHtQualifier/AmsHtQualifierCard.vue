<template>
    <v-card outlined class="mb-4">
        <v-card-title class="py-2">
            <span>{{ model.name }}</span>
            <v-spacer />
            <v-btn icon :title="$t('Panels.AmsHtQualifierPanel.Refresh')" @click="sendGcode('AMS_HT_REFRESH')">
                <v-icon>{{ mdiRefresh }}</v-icon>
            </v-btn>
        </v-card-title>
        <v-divider />

        <v-card-text>
            <v-alert v-if="!model.connected" dense text type="error">
                {{ $t('Panels.AmsHtQualifierPanel.Disconnected') }}
            </v-alert>
            <v-alert v-else-if="model.stale" dense text type="warning">
                {{ $t('Panels.AmsHtQualifierPanel.Stale') }}
            </v-alert>
            <v-alert v-if="hasFault" dense text type="error">
                {{ $t('Panels.AmsHtQualifierPanel.Fault') }}: {{ model.dryer.fault }}
            </v-alert>
            <v-alert v-if="ventErrorLabels.length" dense text type="warning">
                {{ $t('Panels.AmsHtQualifierPanel.VentActuationWarning') }}:
                {{ ventErrorLabels.join(', ') }}
            </v-alert>

            <v-row dense>
                <v-col cols="6" sm="3">
                    <div class="text-caption text--secondary">{{ $t('Panels.AmsHtQualifierPanel.Chamber') }}</div>
                    <div class="text-h6">{{ temperature(model.dryer && model.dryer.chamber_temperature) }}</div>
                </v-col>
                <v-col cols="6" sm="3">
                    <div class="text-caption text--secondary">{{ $t('Panels.AmsHtQualifierPanel.HeaterNtc') }}</div>
                    <div class="text-h6">{{ temperature(model.dryer && model.dryer.heater_temperature) }}</div>
                </v-col>
                <v-col cols="6" sm="3">
                    <div class="text-caption text--secondary">{{ $t('Panels.AmsHtQualifierPanel.Fan') }}</div>
                    <div class="text-h6">{{ integer(model.dryer && model.dryer.fan_rpm) }} RPM</div>
                </v-col>
                <v-col cols="6" sm="3">
                    <div class="text-caption text--secondary">{{ $t('Panels.AmsHtQualifierPanel.Humidity') }}</div>
                    <div class="text-h6">{{ decimal(model.dryer && model.dryer.absolute_humidity) }} g/m³</div>
                </v-col>
            </v-row>

            <v-tabs v-model="tab" grow show-arrows class="mt-2">
                <v-tab>{{ $t('Panels.AmsHtQualifierPanel.Dryer') }}</v-tab>
                <v-tab>{{ $t('Panels.AmsHtQualifierPanel.Motion') }}</v-tab>
                <v-tab>{{ $t('Panels.AmsHtQualifierPanel.Rfid') }}</v-tab>
                <v-tab>{{ $t('Panels.AmsHtQualifierPanel.Diagnostics') }}</v-tab>
            </v-tabs>
            <v-tabs-items v-model="tab">
                <v-tab-item>
                    <v-row dense class="mt-2">
                        <v-col cols="12" sm="4">
                            <v-text-field
                                v-model.number="targetTemperature"
                                :label="$t('Panels.AmsHtQualifierPanel.Target')"
                                type="number"
                                min="30"
                                max="80"
                                suffix="°C"
                                outlined
                                dense />
                        </v-col>
                        <v-col cols="12" sm="4">
                            <v-text-field
                                v-model.number="durationHours"
                                :label="$t('Panels.AmsHtQualifierPanel.Duration')"
                                type="number"
                                min="0"
                                max="168"
                                step="0.25"
                                :disabled="holdAfter"
                                :suffix="$t('Panels.AmsHtQualifierPanel.Hours')"
                                outlined
                                dense />
                        </v-col>
                        <v-col cols="12" sm="4">
                            <v-switch v-model="holdAfter" :label="$t('Panels.AmsHtQualifierPanel.HoldAfter')" />
                        </v-col>
                    </v-row>
                    <v-simple-table dense>
                        <tbody>
                            <tr class="primary-state-row">
                                <th>{{ $t('Panels.AmsHtQualifierPanel.State') }}</th>
                                <td>{{ displayState(dryerState) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.Remaining') }}</th>
                                <td>{{ duration(model.dryer && model.dryer.remaining) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.HeaterPower') }}</th>
                                <td>{{ percent(model.dryer && model.dryer.heater_power) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.FanTarget') }}</th>
                                <td>{{ percent(model.dryer && model.dryer.fan_target) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.FanPwm') }}</th>
                                <td>{{ percent(model.dryer && model.dryer.fan_pwm) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.Vents') }}</th>
                                <td>{{ displayState(model.dryer && model.dryer.vent_position) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.Door') }}</th>
                                <td>{{ booleanState(model.dryer && model.dryer.door_closed, 'Closed', 'Open') }}</td>
                            </tr>
                        </tbody>
                    </v-simple-table>
                    <div class="d-flex flex-wrap mt-4">
                        <v-btn
                            v-if="showStartDryer"
                            color="error"
                            class="mr-2 mb-2"
                            :disabled="!canCommand"
                            @click="startDryer">
                            {{ $t('Panels.AmsHtQualifierPanel.StartDryer') }}
                        </v-btn>
                        <v-btn
                            v-if="showStopDryer"
                            class="mr-2 mb-2"
                            :disabled="!canCommand"
                            @click="sendGcode('AMS_HT_DRYER_STOP')">
                            {{ $t('Panels.AmsHtQualifierPanel.StopCooldown') }}
                        </v-btn>
                        <v-btn
                            v-if="hasFault"
                            class="mb-2"
                            :disabled="!canCommand"
                            @click="sendGcode('AMS_HT_CLEAR_FAULT')">
                            {{ $t('Panels.AmsHtQualifierPanel.ClearFault') }}
                        </v-btn>
                    </div>
                </v-tab-item>

                <v-tab-item>
                    <v-row v-if="followerActions.start" dense class="mt-2">
                        <v-col cols="12">
                            <v-select
                                v-model="followDirection"
                                :items="directionItems"
                                :label="$t('Panels.AmsHtQualifierPanel.Direction')"
                                outlined
                                dense />
                        </v-col>
                    </v-row>
                    <v-simple-table dense>
                        <tbody>
                            <tr class="primary-state-row">
                                <th>{{ $t('Panels.AmsHtQualifierPanel.FilamentState') }}</th>
                                <td>{{ filamentState }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.FollowerState') }}</th>
                                <td>{{ followerState }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.Motor') }}</th>
                                <td>{{ motorState }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.Speed') }}</th>
                                <td>
                                    {{ decimal(model.motor && model.motor.rpm) }} RPM /
                                    {{ decimal(model.motor && model.motor.frequency) }} Hz
                                </td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.Vent1Hes') }}</th>
                                <td>
                                    {{
                                        ventSensorState(
                                            model.sensors && model.sensors.vent1_open,
                                            model.sensors && model.sensors.vent1_counts,
                                            model.sensors && model.sensors.vent1_error
                                        )
                                    }}
                                </td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.Vent2Hes') }}</th>
                                <td>
                                    {{
                                        ventSensorState(
                                            model.sensors && model.sensors.vent2_open,
                                            model.sensors && model.sensors.vent2_counts,
                                            model.sensors && model.sensors.vent2_error
                                        )
                                    }}
                                </td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.VentVerification') }}</th>
                                <td>
                                    {{
                                        booleanState(
                                            model.sensors && model.sensors.vent_sensors_valid,
                                            'Valid',
                                            'Settling'
                                        )
                                    }}
                                    · {{ $t('Panels.AmsHtQualifierPanel.Retries') }}:
                                    {{ integer(model.sensors && model.sensors.vent_retry_count) }}
                                </td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.MotorTemperature') }}</th>
                                <td>{{ temperature(model.motor && model.motor.temperature) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.CurrentAdc') }}</th>
                                <td>{{ integer(model.motor && model.motor.current_adc) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.Buffer') }}</th>
                                <td>{{ percent(model.sensors && model.sensors.buffer) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.Encoder') }}</th>
                                <td>{{ integer(model.sensors && model.sensors.encoder_clicks) }}</td>
                            </tr>
                        </tbody>
                    </v-simple-table>
                    <div class="d-flex flex-wrap mt-4">
                        <v-btn
                            v-if="motionActions.load"
                            color="warning"
                            class="mr-2 mb-2"
                            :disabled="!canCommand"
                            @click="confirmCommand('LoadConfirm', 'AMS_HT_LOAD BAY=0')">
                            {{ $t('Panels.AmsHtQualifierPanel.Load') }}
                        </v-btn>
                        <v-btn
                            v-if="motionActions.unload"
                            color="warning"
                            class="mr-2 mb-2"
                            :disabled="!canCommand"
                            @click="confirmCommand('UnloadConfirm', 'AMS_HT_UNLOAD')">
                            {{ $t('Panels.AmsHtQualifierPanel.Unload') }}
                        </v-btn>
                        <v-btn
                            v-if="followerActions.start"
                            class="mr-2 mb-2"
                            :disabled="!canCommand"
                            @click="startFollower">
                            {{ $t('Panels.AmsHtQualifierPanel.StartFollower') }}
                        </v-btn>
                        <v-btn
                            v-if="followerActions.stop"
                            class="mb-2"
                            :disabled="!canCommand"
                            @click="sendGcode('AMS_HT_FOLLOW ENABLE=0')">
                            {{ $t('Panels.AmsHtQualifierPanel.StopFollower') }}
                        </v-btn>
                    </div>
                </v-tab-item>

                <v-tab-item>
                    <v-simple-table dense class="mt-2">
                        <tbody>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.RfidResult') }}</th>
                                <td>{{ displayState(model.rfid && model.rfid.result) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.RfidVersion') }}</th>
                                <td>{{ hexadecimal(model.rfid && model.rfid.version, 2) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.RfidUid') }}</th>
                                <td>{{ value(model.rfid && model.rfid.uid) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.RfidUidLength') }}</th>
                                <td>{{ integer(model.rfid && model.rfid.uid_length) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.RfidSak') }}</th>
                                <td>{{ hexadecimal(model.rfid && model.rfid.sak, 2) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.RfidAtqa') }}</th>
                                <td>{{ hexadecimal(model.rfid && model.rfid.atqa, 4) }}</td>
                            </tr>
                        </tbody>
                    </v-simple-table>
                    <div class="d-flex flex-wrap mt-4">
                        <v-btn class="mb-2" :disabled="!canCommand" @click="sendGcode('AMS_HT_RFID_SCAN')">
                            {{ $t('Panels.AmsHtQualifierPanel.ScanRfid') }}
                        </v-btn>
                    </div>
                </v-tab-item>

                <v-tab-item>
                    <v-simple-table dense class="mt-2">
                        <tbody>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.F1s') }}</th>
                                <td>
                                    {{
                                        sensorState(
                                            model.sensors && model.sensors.filament_present,
                                            model.sensors && model.sensors.f1s_counts
                                        )
                                    }}
                                </td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.Hub') }}</th>
                                <td>
                                    {{
                                        sensorState(
                                            model.sensors && model.sensors.hub_filament_present,
                                            model.sensors && model.sensors.hub_counts
                                        )
                                    }}
                                </td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.Door') }}</th>
                                <td>
                                    {{ booleanState(model.sensors && model.sensors.door_closed, 'Closed', 'Open') }} ({{
                                        integer(model.sensors && model.sensors.door_counts)
                                    }})
                                </td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.LastCommand') }}</th>
                                <td>{{ value(model.last_command) }} / {{ value(model.last_result) }}</td>
                            </tr>
                            <tr>
                                <th>{{ $t('Panels.AmsHtQualifierPanel.TelemetryAge') }}</th>
                                <td>{{ decimal(model.telemetry_age) }} s</td>
                            </tr>
                            <tr v-if="model.last_error">
                                <th>{{ $t('Panels.AmsHtQualifierPanel.Error') }}</th>
                                <td>{{ model.last_error }}</td>
                            </tr>
                        </tbody>
                    </v-simple-table>
                </v-tab-item>
            </v-tabs-items>
        </v-card-text>
    </v-card>
</template>

<script lang="ts">
import { Component, Mixins, Prop } from 'vue-property-decorator'
import { mdiRefresh } from '@mdi/js'
import BaseMixin from '@/components/mixins/base'
import {
    AmsHtDryerActions,
    AmsHtFollowerActions,
    AmsHtMotionActions,
    AmsHtQualifierModel,
    commandForAmsHt,
    getAmsHtDryerActions,
    getAmsHtFollowerActions,
    getAmsHtFollowerState,
    getAmsHtMotionActions,
} from '@/components/panels/AmsHtQualifier/adapter'

@Component
export default class AmsHtQualifierCard extends Mixins(BaseMixin) {
    @Prop({ required: true }) readonly model!: AmsHtQualifierModel

    mdiRefresh = mdiRefresh
    tab = 0
    targetTemperature = 70
    durationHours = 1
    holdAfter = false
    followDirection = 'FORWARD'

    get canCommand(): boolean {
        return Boolean(this.model.connected && !this.model.stale)
    }

    get hasFault(): boolean {
        return this.dryerActions.clearFault
    }

    get dryerState(): string {
        return this.model.dryer?.state || ''
    }

    get dryerActions(): AmsHtDryerActions {
        return getAmsHtDryerActions(this.dryerState, this.model.dryer?.fault)
    }

    get showStartDryer(): boolean {
        return this.dryerActions.start
    }

    get showStopDryer(): boolean {
        return this.dryerActions.stop
    }

    get directionItems(): Array<{ text: string; value: string }> {
        return [
            { text: this.$t('Panels.AmsHtQualifierPanel.Forward').toString(), value: 'FORWARD' },
            { text: this.$t('Panels.AmsHtQualifierPanel.Reverse').toString(), value: 'REVERSE' },
        ]
    }

    get motorState(): string {
        if (!this.model.motor?.enabled) return this.$t('Panels.AmsHtQualifierPanel.Stopped').toString()
        return this.model.motor.forward
            ? this.$t('Panels.AmsHtQualifierPanel.Forward').toString()
            : this.$t('Panels.AmsHtQualifierPanel.Reverse').toString()
    }

    get motionActions(): AmsHtMotionActions {
        return getAmsHtMotionActions(this.model.sensors?.hub_filament_present)
    }

    get followerActions(): AmsHtFollowerActions {
        return getAmsHtFollowerActions(this.followerStateValue)
    }

    get followerStateValue(): string {
        return getAmsHtFollowerState(this.model)
    }

    get followerState(): string {
        const key =
            this.followerStateValue === 'disabled'
                ? 'Disabled'
                : this.followerStateValue === 'forward'
                  ? 'Forward'
                  : 'Reverse'
        return this.$t(`Panels.AmsHtQualifierPanel.${key}`).toString()
    }

    get filamentState(): string {
        return this.booleanState(this.model.sensors?.hub_filament_present, 'Loaded', 'Unloaded')
    }

    get ventErrorLabels(): string[] {
        const labels: string[] = []
        if (this.model.sensors?.vent1_error) labels.push(this.$t('Panels.AmsHtQualifierPanel.Vent1').toString())
        if (this.model.sensors?.vent2_error) labels.push(this.$t('Panels.AmsHtQualifierPanel.Vent2').toString())
        return labels
    }

    sendGcode(command: string): void {
        this.$store.dispatch('printer/sendGcode', commandForAmsHt(this.model, command))
    }

    confirmCommand(messageKey: string, command: string): void {
        if (!window.confirm(this.$t(`Panels.AmsHtQualifierPanel.${messageKey}`).toString())) return
        this.sendGcode(command)
    }

    startDryer(): void {
        const target = Math.min(80, Math.max(30, Number(this.targetTemperature)))
        const seconds = this.holdAfter ? 0 : Math.round(Math.min(168, Math.max(0, Number(this.durationHours))) * 3600)
        if (!window.confirm(this.$t('Panels.AmsHtQualifierPanel.DryerConfirm', { target }).toString())) return
        this.sendGcode(
            `AMS_HT_DRYER_START TARGET=${target.toFixed(1)} DURATION=${seconds} HOLD=${this.holdAfter ? 1 : 0}`
        )
    }

    startFollower(): void {
        this.confirmCommand('FollowerConfirm', `AMS_HT_FOLLOW ENABLE=1 DIRECTION=${this.followDirection}`)
    }

    value(value: unknown): string {
        return value === undefined || value === null || value === '' ? '—' : String(value)
    }

    displayState(value: string | null | undefined): string {
        if (!value) return '—'
        return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
    }

    hexadecimal(value: number | null | undefined, width: number): string {
        if (value === undefined || value === null) return '—'
        return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`
    }

    integer(value: number | null | undefined): string {
        return value === undefined || value === null ? '—' : Math.round(value).toLocaleString()
    }

    decimal(value: number | null | undefined): string {
        return value === undefined || value === null ? '—' : value.toFixed(1)
    }

    temperature(value: number | null | undefined): string {
        return value === undefined || value === null ? '—' : `${value.toFixed(1)} °C`
    }

    percent(value: number | null | undefined): string {
        return value === undefined || value === null ? '—' : `${(value * 100).toFixed(1)}%`
    }

    duration(seconds: number | null | undefined): string {
        if (seconds === undefined || seconds === null) return '—'
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        const remainder = Math.floor(seconds % 60)
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`
    }

    booleanState(state: boolean | null | undefined, trueKey: string, falseKey: string): string {
        if (state === undefined || state === null) return '—'
        return this.$t(`Panels.AmsHtQualifierPanel.${state ? trueKey : falseKey}`).toString()
    }

    sensorState(state: boolean | null | undefined, counts: number | null | undefined): string {
        const label = this.booleanState(state, 'Present', 'Clear')
        return `${label} (${this.integer(counts)})`
    }

    ventSensorState(
        state: boolean | null | undefined,
        counts: number | null | undefined,
        error: boolean | null | undefined
    ): string {
        const position = this.booleanState(state, 'Open', 'Closed')
        const warning = error ? ` · ${this.$t('Panels.AmsHtQualifierPanel.ActuationFailed')}` : ''
        return `${position} (${this.integer(counts)})${warning}`
    }
}
</script>

<style scoped>
.primary-state-row th,
.primary-state-row td {
    font-size: 1.25rem !important;
    font-weight: 500;
    text-align: left;
}
</style>
