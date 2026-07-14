import { describe, expect, it } from 'vitest'
import { atlasTimeTitle, formatAtlasTime } from '@/components/panels/Atlas/atlasTime'
import { AtlasEvent } from '@/components/panels/Atlas/types'

function event(partial: Partial<AtlasEvent>): AtlasEvent {
    return {
        seq: 1,
        kind: 'trace',
        source: 'mcu',
        severity: 'info',
        summary: '',
        mtime: null,
        wall_time: null,
        time_basis: 'none',
        t_exact: false,
        fields: {},
        ...partial,
    }
}

describe('atlasTime', () => {
    it('renders anchored wall time as a normal local clock', () => {
        const wall = new Date(2026, 6, 14, 15, 42, 18)
        const text = formatAtlasTime(
            event({ mtime: 123.456, wall_time: wall.getTime() / 1000, t_exact: true }),
            new Date(2026, 6, 14, 16, 0, 0),
            'en-US'
        )
        expect(text).toContain('3:42:18 PM')
        expect(text).not.toContain('123.456')
    })

    it('includes the date for an event from another day', () => {
        const wall = new Date(2026, 6, 12, 15, 42, 18)
        const text = formatAtlasTime(event({ wall_time: wall.getTime() / 1000 }), new Date(2026, 6, 14), 'en-US')
        expect(text).toContain('Jul 12')
    })

    it('uses a readable relative clock when no wall anchor exists', () => {
        expect(formatAtlasTime(event({ mtime: 7384.9 }))).toBe('+02:03:04')
        expect(formatAtlasTime(event({ mtime: null }))).toBe('—')
    })

    it('keeps precision and timestamp confidence in the tooltip', () => {
        const title = atlasTimeTitle(event({ mtime: 123.456, time_basis: 'machine' }))
        expect(title).toContain('Approximate machine time')
        expect(title).toContain('123.456 s')
    })
})
