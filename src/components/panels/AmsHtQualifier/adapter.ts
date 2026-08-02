import { PrinterState } from '@/store/printer/types'
import { AmsHtQualifierStatus } from '@/components/panels/AmsHtQualifier/types'

export interface AmsHtQualifierModel extends AmsHtQualifierStatus {
    available: boolean
    stale: boolean
}

const STALE_TELEMETRY_SECONDS = 2

export function buildAmsHtQualifierModel(printer: PrinterState | undefined): AmsHtQualifierModel {
    const status = printer?.ams_ht_qualifier as AmsHtQualifierStatus | undefined
    if (!status) return { available: false, connected: false, stale: true }

    const age = status.telemetry_age
    return {
        ...status,
        available: true,
        stale: age === null || age === undefined || age > STALE_TELEMETRY_SECONDS,
        dryer: { ...status.dryer },
        sensors: { ...status.sensors },
        motor: { ...status.motor },
        rfid: { ...status.rfid },
    }
}
