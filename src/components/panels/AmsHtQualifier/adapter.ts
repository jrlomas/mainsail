import { PrinterState } from '@/store/printer/types'
import { AmsHtQualifierStatus } from '@/components/panels/AmsHtQualifier/types'

export interface AmsHtQualifierModel extends AmsHtQualifierStatus {
    available: boolean
    stale: boolean
    name: string
    instance: string | null
    objectName: string
}

const STALE_TELEMETRY_SECONDS = 2

export interface AmsHtDryerActions {
    start: boolean
    stop: boolean
    clearFault: boolean
}

export function getAmsHtDryerActions(state?: string, fault?: string): AmsHtDryerActions {
    const clearFault = Boolean(fault && fault !== 'none')
    return {
        start: !clearFault && Boolean(state && ['off', 'cooldown'].includes(state)),
        stop: !clearFault && Boolean(state && ['preheat', 'hold', 'timed_dry'].includes(state)),
        clearFault,
    }
}

export interface AmsHtMotionActions {
    load: boolean
    unload: boolean
}

export interface AmsHtFollowerActions {
    start: boolean
    stop: boolean
}

export function getAmsHtMotionActions(hubFilamentPresent?: boolean | null): AmsHtMotionActions {
    return {
        load: hubFilamentPresent === false,
        unload: hubFilamentPresent === true,
    }
}

export function getAmsHtFollowerActions(state?: string): AmsHtFollowerActions {
    return {
        start: state === 'disabled',
        stop: state === 'forward' || state === 'reverse',
    }
}

export function getAmsHtFollowerState(model: AmsHtQualifierModel): string {
    if (model.follower_state) return model.follower_state
    if (model.last_result === 'accepted') {
        if (model.last_command === 'following_forward' || model.last_command === 'loading') return 'forward'
        if (model.last_command === 'following_reverse') return 'reverse'
    }
    return 'disabled'
}

export function commandForAmsHt(model: AmsHtQualifierModel, command: string): string {
    return model.instance ? `${command} AMS=${model.instance}` : command
}

export function formatAmsHtTemperature(value: unknown): string {
    return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} °C` : '—'
}

function titleFromInstance(instance: string): string {
    return instance.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function buildModel(objectName: string, status: AmsHtQualifierStatus): AmsHtQualifierModel {
    const prefix = 'ams_ht_qualifier '
    const derivedInstance = objectName.startsWith(prefix) ? objectName.slice(prefix.length) : null
    const instance = status.instance === undefined ? derivedInstance : status.instance

    const age = status.telemetry_age
    return {
        ...status,
        available: true,
        stale: age === null || age === undefined || age > STALE_TELEMETRY_SECONDS,
        name: status.name || (instance ? titleFromInstance(instance) : 'AMS HT'),
        instance,
        objectName,
        dryer: { ...status.dryer },
        sensors: { ...status.sensors },
        motor: { ...status.motor },
        rfid: { ...status.rfid },
    }
}

export function buildAmsHtQualifierModels(printer: PrinterState | undefined): AmsHtQualifierModel[] {
    if (!printer) return []

    return Object.entries(printer)
        .filter(([name]) => name === 'ams_ht_qualifier' || name.startsWith('ams_ht_qualifier '))
        .map(([name, status]) => buildModel(name, status as AmsHtQualifierStatus))
        .sort((left, right) => left.name.localeCompare(right.name))
}

export function buildAmsHtQualifierModel(printer: PrinterState | undefined): AmsHtQualifierModel {
    return (
        buildAmsHtQualifierModels(printer)[0] || {
            available: false,
            connected: false,
            stale: true,
            name: 'AMS HT',
            instance: null,
            objectName: 'ams_ht_qualifier',
        }
    )
}
