// The adapter against a recorded OpenAMS printer: the store Mainsail would
// hold is built from ref/mmu-display/tests/fixtures/vams/two_lanes.json, and
// the logic's view must come out with the toolheads and units that the
// fixture's recorded view has.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { OpenamsAdapter } from './adapter'
import type { OpenamsStoreState } from './adapter'

const vamsDir = new URL('../../../../ref/mmu-display/tests/fixtures/vams/', import.meta.url)

interface FixtureEvent {
    kind: string
    unit?: string | null
    payload?: unknown
}

const readFixture = (name: string): unknown => JSON.parse(readFileSync(new URL(name, vamsDir), 'utf8')) as unknown

const events = (doc: unknown): FixtureEvent[] => (doc as { events: FixtureEvent[] }).events

/** The printer store the last state of every OpenAMS object leaves behind. */
const storeFromFixture = (doc: unknown): OpenamsStoreState => {
    const printer: Record<string, unknown> = {}

    for (const event of events(doc)) {
        if (!event.payload) continue
        if (event.kind === 'c2_status') printer.oams_manager = event.payload
        else if (event.kind === 'openams_ui') printer[`openams_ui ${event.unit}`] = event.payload
    }

    printer.print_stats = { filename: 'two_lanes.gcode', state: 'printing' }
    printer.toolhead = { extruder: 'extruder' }

    return { printer, server: { spoolman: { spools: [] } } }
}

const ids = (values: { id: string }[]) => values.map((value) => value.id)

describe('the adapter fed the two_lanes fixture', () => {
    const expected = readFixture('two_lanes.view.json') as {
        toolheads: { id: string; units: { id: string }[] }[]
        unassigned_units: { id: string }[]
    }
    const expectedToolheads = ids(expected.toolheads)
    const expectedUnits = expected.toolheads
        .flatMap((toolhead) => ids(toolhead.units))
        .concat(ids(expected.unassigned_units))

    it('shows the toolheads and units the recorded view has', () => {
        const adapter = new OpenamsAdapter()
        adapter.feedStore(storeFromFixture(readFixture('two_lanes.json')))

        const view = adapter.view()

        expect(ids(view.toolheads)).toEqual(expectedToolheads)
        expect(view.toolheads.flatMap((toolhead) => ids(toolhead.units)).concat(ids(view.unassigned_units))).toEqual(
            expectedUnits
        )
    })

    it('reaches the same toolheads and units when fed one object at a time, as a status update arrives them', () => {
        const streamed = new OpenamsAdapter()

        for (const event of events(readFixture('two_lanes.json'))) {
            if (!event.payload) continue
            if (event.kind === 'c2_status') streamed.feedStore({ printer: { oams_manager: event.payload } })
            else if (event.kind === 'openams_ui') {
                streamed.feedStore({ printer: { [`openams_ui ${event.unit}`]: event.payload } })
            }
        }

        const view = streamed.view()

        expect(ids(view.toolheads)).toEqual(expectedToolheads)
        expect(view.toolheads.flatMap((toolhead) => ids(toolhead.units)).concat(ids(view.unassigned_units))).toEqual(
            expectedUnits
        )
    })
})
