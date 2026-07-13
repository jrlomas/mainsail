import { describe, expect, it } from 'vitest'
import { buildDiagnosis, buildEvent, buildTimeline } from '@/components/panels/Atlas/atlasAdapter'

// The adapter must be defensive: a partial or malformed daemon payload
// should render an empty-but-valid model, never throw in a template.

describe('atlasAdapter', () => {
    describe('buildEvent', () => {
        it('coerces a well-formed raw event', () => {
            const e = buildEvent(
                {
                    seq: 3,
                    kind: 'mcu_shutdown',
                    source: 'mcu mcu',
                    severity: 'critical',
                    summary: "MCU 'mcu' shutdown: Timer too close",
                    mtime: 8,
                    time_basis: 'host_monotonic',
                    t_exact: false,
                    fields: { fault_class: 'timer_too_close' },
                },
                0
            )
            expect(e.seq).toBe(3)
            expect(e.severity).toBe('critical')
            expect(e.fields.fault_class).toBe('timer_too_close')
        })

        it('fills sane defaults for a malformed event', () => {
            const e = buildEvent({ severity: 'not-a-severity' }, 7)
            expect(e.seq).toBe(7) // falls back to the index
            expect(e.kind).toBe('log')
            expect(e.source).toBe('host')
            expect(e.severity).toBe('info') // unknown severity -> info
            expect(e.mtime).toBeNull()
            expect(e.time_basis).toBe('none')
            expect(e.fields).toEqual({})
        })

        it('parses a numeric-string mtime', () => {
            expect(buildEvent({ mtime: '8.5' }, 0).mtime).toBe(8.5)
            expect(buildEvent({ mtime: 'nope' }, 0).mtime).toBeNull()
        })
    })

    describe('buildTimeline', () => {
        it('builds from raw events and keeps notes/versions', () => {
            const tl = buildTimeline({
                events: [
                    { seq: 0, kind: 'stats' },
                    { seq: 1, kind: 'heater_fault', severity: 'error' },
                ],
                notes: ['inferred time', 42],
                versions: { mcu: 'v1' },
            })
            expect(tl.events).toHaveLength(2)
            expect(tl.notes).toEqual(['inferred time']) // non-strings dropped
            expect(tl.versions.mcu).toBe('v1')
        })

        it('returns an empty-but-valid timeline for garbage', () => {
            const tl = buildTimeline(undefined)
            expect(tl.events).toEqual([])
            expect(tl.notes).toEqual([])
            expect(tl.versions).toEqual({})
        })
    })

    describe('buildDiagnosis', () => {
        it('orders matches by confidence, marks matched', () => {
            const d = buildDiagnosis({
                matches: [
                    { pattern_id: 'a', confidence: 0.5, cause: 'x', fix: 'y' },
                    { pattern_id: 'b', confidence: 0.8, cause: 'x', fix: 'y' },
                ],
            })
            expect(d.matched).toBe(true)
            expect(d.matches.map((m) => m.pattern_id)).toEqual(['b', 'a'])
        })

        it('surfaces the captured case when nothing matched', () => {
            const d = buildDiagnosis({
                matches: [],
                case: { case_hash: 'da8c80e8f3de1166', summary: 'heater not heating' },
            })
            expect(d.matched).toBe(false)
            expect(d.case?.case_hash).toBe('da8c80e8f3de1166')
            expect(d.case?.note).toContain('no known pattern')
        })

        it('ignores a stale case when there are matches', () => {
            const d = buildDiagnosis({
                matches: [{ pattern_id: 'a', confidence: 0.6, cause: 'x', fix: 'y' }],
                case: { case_hash: 'stale', summary: 's' },
            })
            expect(d.matched).toBe(true)
            expect(d.case).toBeNull()
        })
    })
})
