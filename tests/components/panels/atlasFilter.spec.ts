import { describe, expect, it } from 'vitest'
import {
    distinctKinds,
    distinctSources,
    distinctSubsystems,
    errorCount,
    limitEvents,
    orderedEvents,
    passes,
    selectEvents,
    severityRank,
} from '@/components/panels/Atlas/atlasFilter'
import { AtlasEvent, AtlasTimeline, TimelineFilter, defaultFilter } from '@/components/panels/Atlas/types'

// Mirrors test/atlas_view_test.py — the Mainsail filter must select the
// same events, in the same order, as the Python floor (atlas/view.py).

function ev(partial: Partial<AtlasEvent>): AtlasEvent {
    return {
        seq: 0,
        kind: 'log',
        source: 'host',
        severity: 'info',
        summary: '',
        mtime: null,
        time_basis: 'none',
        t_exact: false,
        fields: {},
        ...partial,
    }
}

const TIMELINE: AtlasTimeline = {
    events: [
        ev({ seq: 0, kind: 'session_start', source: 'host', severity: 'info', mtime: 5 }),
        ev({ seq: 1, kind: 'stats', source: 'host', severity: 'info', mtime: 6 }),
        ev({ seq: 2, kind: 'heater_fault', source: 'host', severity: 'error', mtime: 8 }),
        ev({ seq: 3, kind: 'mcu_shutdown', source: 'mcu mcu', severity: 'critical', mtime: 8 }),
        ev({ seq: 4, kind: 'trace', source: 'mcu/motion', severity: 'warning', mtime: 7, fields: { sub: 'motion' } }),
    ],
    notes: ['some events carry an inferred monotonic time'],
    versions: {},
}

describe('atlasFilter', () => {
    it('orders severities correctly', () => {
        expect(severityRank('critical')).toBeGreaterThan(severityRank('error'))
        expect(severityRank('error')).toBeGreaterThan(severityRank('info'))
        expect(severityRank('nonsense')).toBe(severityRank('info')) // fallback
    })

    it('min_severity keeps only events at/above the floor', () => {
        const f: TimelineFilter = { ...defaultFilter(), minSeverity: 'error' }
        const kinds = selectEvents(TIMELINE, f).map((e) => e.kind)
        expect(kinds).toContain('heater_fault')
        expect(kinds).toContain('mcu_shutdown')
        expect(kinds).not.toContain('stats')
        expect(kinds).not.toContain('session_start')
    })

    it('filters by kind', () => {
        const f: TimelineFilter = { ...defaultFilter(), kinds: ['mcu_shutdown'] }
        const out = selectEvents(TIMELINE, f)
        expect(out).toHaveLength(1)
        expect(out[0].kind).toBe('mcu_shutdown')
    })

    it('filters by source substring', () => {
        const f: TimelineFilter = { ...defaultFilter(), sources: ['mcu'] }
        const out = selectEvents(TIMELINE, f)
        expect(out.length).toBeGreaterThan(0)
        expect(out.every((e) => e.source.includes('mcu'))).toBe(true)
    })

    it('filters by trace subsystem', () => {
        const f: TimelineFilter = { ...defaultFilter(), subsystems: ['motion'] }
        const out = selectEvents(TIMELINE, f)
        expect(out).toHaveLength(1)
        expect(out[0].fields.sub).toBe('motion')
    })

    it('passes() is the per-event predicate', () => {
        const e = ev({ severity: 'warning', source: 'mcu/comms', kind: 'trace' })
        expect(passes(e, { ...defaultFilter(), minSeverity: 'error' })).toBe(false)
        expect(passes(e, { ...defaultFilter(), minSeverity: 'warning' })).toBe(true)
    })

    it('orders by machine time then seq, untimed last', () => {
        const events = [ev({ seq: 2, mtime: null }), ev({ seq: 0, mtime: 8 }), ev({ seq: 1, mtime: 5 })]
        const ordered = orderedEvents(events).map((e) => e.seq)
        expect(ordered).toEqual([1, 0, 2]) // mtime 5, mtime 8, then null
    })

    it('ordered vs arrival select the same set, different order', () => {
        const orderedSel = selectEvents(TIMELINE, { ...defaultFilter(), ordered: true })
        const arrivalSel = selectEvents(TIMELINE, { ...defaultFilter(), ordered: false })
        expect(new Set(orderedSel.map((e) => e.seq))).toEqual(new Set(arrivalSel.map((e) => e.seq)))
        expect(arrivalSel.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4]) // arrival = seq order
    })

    it('bounds rendering to the newest events without changing their order', () => {
        const events = Array.from({ length: 150 }, (_, seq) => ev({ seq, mtime: seq }))
        const defaults = limitEvents(events)
        expect(defaults).toHaveLength(10)
        expect(defaults[0].seq).toBe(140)
        expect(defaults.at(-1)?.seq).toBe(149)

        const out = limitEvents(events, 100)
        expect(out).toHaveLength(100)
        expect(out[0].seq).toBe(50)
        expect(out.at(-1)?.seq).toBe(149)
        expect(limitEvents(events, 0)).toEqual([])
    })

    it('reports distinct subsystems, kinds, and the error count', () => {
        expect(distinctSubsystems(TIMELINE.events)).toEqual(['motion'])
        expect(distinctKinds(TIMELINE.events)).toContain('mcu_shutdown')
        expect(distinctSources(TIMELINE.events)).toEqual(['host', 'mcu mcu', 'mcu/motion'])
        expect(errorCount(TIMELINE.events)).toBe(2) // heater_fault + mcu_shutdown
    })
})
