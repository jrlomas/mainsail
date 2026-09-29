// The adapter against a small OpenAMS printer: the store Mainsail would hold
// (an oams_manager, two openams_ui units on two FPS lanes), and the logic's
// view must come out with the toolheads and units it holds.

import { describe, expect, it } from 'vitest'
import { OpenamsAdapter } from './adapter'
import type { OpenamsStoreState } from './adapter'

const lane = (id: string, group: string, bay: string) => ({
    id,
    ext: 'extruder',
    op: 'LOADED',
    group,
    bay,
    stage: null,
    runout: 'idle',
    from: null,
    to: null,
    ms: true,
})

const unit = (name: string, idx: number, fps: string, group: string) => ({
    v: 1,
    unit: name,
    idx,
    family: 'ams2',
    serial: '',
    online: true,
    lane: lane(fps, group, `${name}-0`),
    bays: [0, 1, 2, 3].map((id) => ({ id: idx * 4 + id, s: id === 0 ? 'l' : 'e', cal: 'c', sp: null })),
    groups: [{ n: group, b: [`${name}-0`], s: 'r' }],
    env: { t: 24, rh: 31 },
    dryer: null,
    fault: null,
    nf: 0,
    act: [],
})

const manager = {
    ready: true,
    settings: { read_tag_on_insertion: true },
    lanes_by_fps: { fps1: { pressure: 0.5, set_point: 0.5 }, fps2: { pressure: 0.5, set_point: 0.5 } },
}

const printer: Record<string, unknown> = {
    oams_manager: manager,
    'openams_ui oams1': unit('oams1', 1, 'fps1', 'T0'),
    'openams_ui oams2': unit('oams2', 2, 'fps2', 'T1'),
    print_stats: { filename: 'job.gcode', state: 'printing' },
    toolhead: { extruder: 'extruder' },
}

const store: OpenamsStoreState = { printer, server: { spoolman: { spools: [] } } }

const ids = (values: { id: string }[]) => values.map((value) => value.id)
const unitIds = (view: ReturnType<OpenamsAdapter['view']>) =>
    view.toolheads.flatMap((toolhead) => ids(toolhead.units)).concat(ids(view.unassigned_units))

describe('the adapter fed an OpenAMS store', () => {
    it('shows one toolhead per FPS lane, each with its unit', () => {
        const adapter = new OpenamsAdapter()
        adapter.feedStore(store)

        const view = adapter.view()

        expect(ids(view.toolheads)).toEqual(['fps1', 'fps2'])
        expect(unitIds(view)).toEqual(['oams1', 'oams2'])
        expect(view.toolheads[0].units[0].bays).toHaveLength(4)
    })

    it('reaches the same toolheads and units when fed one object at a time, as a status update arrives them', () => {
        const streamed = new OpenamsAdapter()

        streamed.feedStore({ printer: { oams_manager: manager } })
        streamed.feedStore({ printer: { 'openams_ui oams1': printer['openams_ui oams1'] } })
        streamed.feedStore({ printer: { 'openams_ui oams2': printer['openams_ui oams2'] } })

        const view = streamed.view()

        expect(ids(view.toolheads)).toEqual(['fps1', 'fps2'])
        expect(unitIds(view)).toEqual(['oams1', 'oams2'])
    })

    it('feeding the same store again changes nothing', () => {
        const adapter = new OpenamsAdapter()
        adapter.feedStore(store)
        const before = JSON.stringify(adapter.view())

        adapter.feedStore(store)

        expect(JSON.stringify(adapter.view())).toBe(before)
    })
})
