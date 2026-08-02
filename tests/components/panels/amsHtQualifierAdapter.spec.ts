import { describe, expect, it } from 'vitest'
import {
    buildAmsHtQualifierModel,
    buildAmsHtQualifierModels,
    commandForAmsHt,
    getAmsHtDryerActions,
    getAmsHtFollowerActions,
    getAmsHtMotionActions,
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

    it('uses the Hub HES as the load and unload source of truth', () => {
        expect(getAmsHtMotionActions(false)).toEqual({ load: true, unload: false })
        expect(getAmsHtMotionActions(true)).toEqual({ load: false, unload: true })
        expect(getAmsHtMotionActions(undefined)).toEqual({ load: false, unload: false })
    })

    it('offers only the complementary follower action', () => {
        expect(getAmsHtFollowerActions('disabled')).toEqual({ start: true, stop: false })
        expect(getAmsHtFollowerActions('forward')).toEqual({ start: false, stop: true })
        expect(getAmsHtFollowerActions('reverse')).toEqual({ start: false, stop: true })
        expect(getAmsHtFollowerActions(undefined)).toEqual({ start: false, stop: false })
    })

    it('routes global and per-card commands to the selected qualifier instance', () => {
        const legacy = buildAmsHtQualifierModel({ ams_ht_qualifier: {} } as never)
        const named = buildAmsHtQualifierModel({
            'ams_ht_qualifier left': { instance: 'left' },
        } as never)

        expect(commandForAmsHt(legacy, 'AMS_HT_MOTION_STOP')).toBe('AMS_HT_MOTION_STOP')
        expect(commandForAmsHt(named, 'AMS_HT_MOTION_STOP')).toBe('AMS_HT_MOTION_STOP AMS=left')
    })
})
