import { describe, expect, it } from 'vitest'
import {
    buildOamsModel,
    commandForOamsDevice,
    oamsExists,
    withOamsFamilyPreviews,
} from '@/components/panels/Oams/oamsAdapter'

function unit(overrides: Record<string, unknown> = {}) {
    return {
        connected: true,
        current_kd: 0.03,
        current_ki: 0.02,
        current_kp: 0.01,
        current_spool: 1,
        f1s_hes_value: [0, 1, 0, 0],
        fps_lower_threshold: 0.3,
        fps_upper_threshold: 0.7,
        fps_value: 0.5,
        hub_hes_value: [0, 1, 0, 0],
        kd: 3,
        ki: 2,
        kp: 1,
        oams_idx: 7,
        ...overrides,
    }
}

describe('oamsAdapter', () => {
    it('detects the manager and returns an empty model without it', () => {
        expect(oamsExists(undefined)).toBe(false)
        expect(oamsExists({ oams_manager: {} })).toBe(true)
        expect(buildOamsModel(undefined)).toEqual({ toolheads: [] })
        expect(buildOamsModel({})).toEqual({ toolheads: [] })
    })

    it('builds one toolhead from the published topology and status objects', () => {
        const model = buildOamsModel({
            'aht3x oams1': { humidity: 18.4, temperature: 24.5 },
            'fps lane1': { extruder: 'extruder1', fps_value: 0.62 },
            'oams oams1': unit(),
            oams_manager: {
                current_group: 'T1',
                lanes: { lane1: { op: 'loaded' } },
                topology: {
                    fps: ['lane1'],
                    groups: { T1: { bays: ['oams1-1'], lane: 'lane1' } },
                    oams: { oams1: { idx: 7, lane: 'lane1' } },
                },
            },
        })

        expect(model.toolheads).toHaveLength(1)
        expect(model.toolheads[0].name).toBe('extruder1')
        expect(model.toolheads[0].filament_groups).toEqual(['T1'])
        expect(model.toolheads[0].fps[0].value).toBe(0.62)
        const oams = model.toolheads[0].fps[0].oams[0]
        expect(oams).toMatchObject({
            follower_loop: { d: 3, i: 2, p: 1 },
            humidity_rh: 18.4,
            index: 7,
            name: 'oams1',
            rewind_loop: { d: 0.03, i: 0.02, p: 0.01 },
            state: 'online',
            temperature_c: 24.5,
        })
        expect(oams.bays[1]).toMatchObject({ filament_group: 'T1', state: 'loaded' })
    })

    it('keeps multiple FPS lanes isolated and exposes unbound groups on each', () => {
        const model = buildOamsModel({
            'fps left': { extruder: 'extruder', fps_value: 0.2 },
            'fps right': { extruder: 'extruder1', fps_value: 0.8 },
            'oams left_oams': unit({ oams_idx: 1 }),
            'oams right_oams': unit({ oams_idx: 2 }),
            oams_manager: {
                lanes: { left: {}, right: {} },
                topology: {
                    fps: ['left', 'right'],
                    groups: {
                        T10: { bays: ['right_oams-0'], lane: 'right' },
                        T2: { bays: ['left_oams-0'], lane: 'left' },
                        T3: { bays: [], lane: null },
                    },
                    oams: {
                        left_oams: { idx: 1, lane: 'left' },
                        right_oams: { idx: 2, lane: 'right' },
                    },
                },
            },
        })

        expect(model.toolheads.map((toolhead) => toolhead.name)).toEqual(['extruder', 'extruder1'])
        expect(model.toolheads[0].filament_groups).toEqual(['T2', 'T3'])
        expect(model.toolheads[1].filament_groups).toEqual(['T3', 'T10'])
        expect(model.toolheads[0].fps[0].oams[0].name).toBe('left_oams')
        expect(model.toolheads[1].fps[0].oams[0].name).toBe('right_oams')
    })

    it('falls back to a synthetic FPS for an older single-unit payload', () => {
        const model = buildOamsModel({
            'oams legacy': unit({ connected: false, fps_value: 2 }),
            oams_manager: { current_group: null, lanes: {} },
        })

        expect(model.toolheads).toHaveLength(1)
        expect(model.toolheads[0].fps[0].name).toBe('fps')
        expect(model.toolheads[0].fps[0].value).toBe(1)
        expect(model.toolheads[0].fps[0].oams[0].state).toBe('offline')
    })

    it('renders a single-bay AMS HT from the manager capability contract', () => {
        const model = buildOamsModel({
            oams_manager: {
                devices: {
                    ht: {
                        bay_count: 1,
                        capabilities: {
                            bays: 1,
                            display_name: 'AMS HT',
                            dryer: true,
                            family: 'ams_ht',
                            heater_count: 1,
                            vent_count: 2,
                        },
                        connected: true,
                        family: 'ams_ht',
                        f1s_hes_value: [1],
                        hub_hes_value: [0],
                        oams_idx: 3,
                        supported_actions: ['dryer_start', 'dryer_stop', 'rfid_scan'],
                        telemetry: {
                            dryer: { chamber_c: 52.5, humidity_gm3: 8.25, state_name: 'hold' },
                            rfid: { result_name: 'ok', uid: '01020304' },
                        },
                        thermal: { temperature_c: 72, time_to_trip_s: 900, valid: true },
                    },
                },
                lanes: { fps: {} },
                topology: {
                    fps: ['fps'],
                    groups: { T0: { bays: ['ht-0'], lane: 'fps' } },
                    oams: { ht: { bays: 1, family: 'ams_ht', idx: 3, lane: 'fps' } },
                },
            },
        })

        const ht = model.toolheads[0].fps[0].oams[0]
        expect(ht.bays).toHaveLength(1)
        expect(ht.bays[0].state).toBe('inserted')
        expect(ht.display_name).toBe('AMS HT')
        expect(ht.capabilities.vent_count).toBe(2)
        expect(ht.temperature_c).toBe(52.5)
        expect(ht.humidity_gm3).toBe(8.25)
        expect(ht.rfid[0].uid).toBe('01020304')
    })

    it('keeps AMS 2 Pro at four bays and exposes its two heater/fan modules', () => {
        const model = buildOamsModel({
            'oams ams2': unit({ bay_count: 4, family: 'ams2' }),
            oams_manager: {
                lanes: { fps: {} },
                topology: {
                    fps: ['fps'],
                    groups: {},
                    oams: {
                        ams2: {
                            bays: 4,
                            capabilities: { dryer: true, fan_count: 2, heater_count: 2 },
                            family: 'ams2',
                            idx: 2,
                            lane: 'fps',
                        },
                    },
                },
            },
        })

        const ams2 = model.toolheads[0].fps[0].oams[0]
        expect(ams2.bays).toHaveLength(4)
        expect(ams2.display_name).toBe('AMS 2 Pro')
        expect(ams2.capabilities).toMatchObject({ dryer: true, fan_count: 2, heater_count: 2 })
    })
    it('adds read-only AMS1 and AMS2 previews without duplicating connected families', () => {
        const model = buildOamsModel({
            'oams ht': unit({ bay_count: 1, family: 'ams_ht', oams_idx: 3 }),
            oams_manager: { current_group: null, lanes: {} },
        })
        const preview = withOamsFamilyPreviews(model)
        const devices = preview.toolheads[0].fps[0].oams

        expect(devices.map((device) => device.family)).toEqual(['ams_ht', 'ams1', 'ams2'])
        expect(devices.filter((device) => device.preview)).toHaveLength(2)
        expect(
            devices.filter((device) => device.preview).every((device) => device.supported_actions.length === 0)
        ).toBe(true)
        expect(devices.find((device) => device.family === 'ams2')?.bays).toHaveLength(4)
        expect(withOamsFamilyPreviews(preview)).toBe(preview)
    })

    it('never builds commands for previews or unsupported actions', () => {
        const preview = withOamsFamilyPreviews({ toolheads: [] })
        const ams2Preview = preview.toolheads[0].fps[0].oams.find((device) => device.family === 'ams2')
        expect(ams2Preview).toBeDefined()
        expect(commandForOamsDevice(ams2Preview!, { action: 'dryer_stop' })).toBeNull()

        const model = buildOamsModel({
            'oams ams2': unit({
                capabilities: { dryer_target_max_c: 65, dryer_target_min_c: 35 },
                family: 'ams2',
                supported_actions: ['dryer_start', 'dryer_stop'],
            }),
            oams_manager: { current_group: null, lanes: {} },
        })
        const real = model.toolheads[0].fps[0].oams[0]
        expect(commandForOamsDevice(real, { action: 'dryer_start', duration: 60, target: 70 })).toBe(
            'OAMS_DRYER_START OAMS=7 TARGET=65 DURATION=60'
        )
        expect(commandForOamsDevice(real, { action: 'rfid_scan' })).toBeNull()
    })
})
