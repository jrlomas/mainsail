import { describe, expect, it } from 'vitest'
import { buildAmsHtQualifierModel } from '@/components/panels/AmsHtQualifier/adapter'

describe('AMS HT qualifier adapter', () => {
    it('is unavailable without the standalone host object', () => {
        expect(buildAmsHtQualifierModel(undefined)).toEqual({ available: false, connected: false, stale: true })
    })

    it('preserves nested telemetry and detects fresh data', () => {
        const model = buildAmsHtQualifierModel({
            ams_ht_qualifier: {
                connected: true,
                telemetry_age: 0.4,
                dryer: { state: 'hold', chamber_temperature: 61.5 },
                sensors: { encoder_clicks: -25 },
            },
        } as never)

        expect(model.available).toBe(true)
        expect(model.stale).toBe(false)
        expect(model.dryer?.state).toBe('hold')
        expect(model.sensors?.encoder_clicks).toBe(-25)
    })

    it('marks telemetry stale after two seconds', () => {
        const model = buildAmsHtQualifierModel({
            ams_ht_qualifier: { connected: true, telemetry_age: 2.1 },
        } as never)

        expect(model.stale).toBe(true)
    })
})
