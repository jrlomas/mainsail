import { describe, expect, it } from 'vitest'
import {
    buildAmsHtQualifierModel,
    buildAmsHtQualifierModels,
    getAmsHtDryerActions,
} from '@/components/panels/AmsHtQualifier/adapter'

describe('AMS HT qualifier adapter', () => {
    it('is unavailable without the standalone host object', () => {
        expect(buildAmsHtQualifierModels(undefined)).toEqual([])
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

    it('discovers, names, and sorts multiple qualifier objects', () => {
        const models = buildAmsHtQualifierModels({
            'ams_ht_qualifier right': {
                name: 'Right Dryer',
                instance: 'right',
                connected: true,
                telemetry_age: 0.2,
            },
            'ams_ht_qualifier left': {
                name: 'Left Dryer',
                instance: 'left',
                connected: true,
                telemetry_age: 0.1,
            },
        } as never)

        expect(models.map((model) => model.name)).toEqual(['Left Dryer', 'Right Dryer'])
        expect(models.map((model) => model.instance)).toEqual(['left', 'right'])
        expect(models[0].objectName).toBe('ams_ht_qualifier left')
    })

    it('derives a readable name and selector from a prefixed legacy status object', () => {
        const [model] = buildAmsHtQualifierModels({
            'ams_ht_qualifier tool_room': { connected: true, telemetry_age: 0.1 },
        } as never)

        expect(model.name).toBe('Tool Room')
        expect(model.instance).toBe('tool_room')
    })

    it('marks telemetry stale after two seconds', () => {
        const model = buildAmsHtQualifierModel({
            ams_ht_qualifier: { connected: true, telemetry_age: 2.1 },
        } as never)

        expect(model.stale).toBe(true)
    })

    it('offers only state-valid dryer actions and allows restart from cooldown', () => {
        expect(getAmsHtDryerActions('off', 'none')).toEqual({ start: true, stop: false, clearFault: false })
        expect(getAmsHtDryerActions('cooldown', 'none')).toEqual({ start: true, stop: false, clearFault: false })
        expect(getAmsHtDryerActions('preheat', 'none')).toEqual({ start: false, stop: true, clearFault: false })
        expect(getAmsHtDryerActions('hold', 'fan_stalled')).toEqual({
            start: false,
            stop: false,
            clearFault: true,
        })
    })
})
