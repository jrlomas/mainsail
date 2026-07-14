// The Atlas timeline filter — a TypeScript port of atlas/view.py
// TimelineFilter, so the Mainsail panel filters the merged timeline
// exactly the way the CLI and the Python floor do. Pure functions, no Vue
// dependency, so they are unit-testable in isolation.

import { AtlasEvent, AtlasTimeline, SEVERITY_ORDER, TimelineFilter } from './types'

export const DEFAULT_VISIBLE_EVENT_LIMIT = 100

export function severityRank(severity: string): number {
    return SEVERITY_ORDER[severity as keyof typeof SEVERITY_ORDER] ?? SEVERITY_ORDER.info
}

// Does one event pass the filter? Matches atlas/view.py TimelineFilter.passes.
export function passes(event: AtlasEvent, filter: TimelineFilter): boolean {
    if (severityRank(event.severity) < severityRank(filter.minSeverity)) return false
    if (filter.sources.length && !filter.sources.some((s) => event.source.includes(s))) return false
    if (filter.kinds.length && !filter.kinds.includes(event.kind)) return false
    if (filter.subsystems.length) {
        const sub = event.fields?.sub
        if (typeof sub !== 'string' || !filter.subsystems.includes(sub)) return false
    }
    return true
}

// Events on the merged timeline: machine-time order (timed first, seq as
// the final tiebreak) or arrival (seq) order. Matches Timeline.ordered().
export function orderedEvents(events: AtlasEvent[]): AtlasEvent[] {
    const big = Number.POSITIVE_INFINITY
    return [...events].sort((a, b) => {
        const ta = a.mtime ?? big
        const tb = b.mtime ?? big
        if (ta !== tb) return ta - tb
        return a.seq - b.seq
    })
}

// The filtered, ordered selection the panel renders.
export function selectEvents(timeline: AtlasTimeline, filter: TimelineFilter): AtlasEvent[] {
    const base = filter.ordered ? orderedEvents(timeline.events) : [...timeline.events].sort((a, b) => a.seq - b.seq)
    return base.filter((e) => passes(e, filter))
}

// Keep the newest portion of an already ordered selection. Atlas retains a
// much deeper diagnostic history than the panel can render smoothly; slicing
// from the end preserves the selected ordering while bounding DOM growth.
export function limitEvents(events: AtlasEvent[], limit = DEFAULT_VISIBLE_EVENT_LIMIT): AtlasEvent[] {
    const boundedLimit = Math.max(0, Math.floor(limit))
    return boundedLimit === 0 ? [] : events.slice(-boundedLimit)
}

// The distinct subsystems / kinds / sources present — for populating the
// filter dropdowns from the live data.
export function distinctSubsystems(events: AtlasEvent[]): string[] {
    const set = new Set<string>()
    for (const e of events) {
        const sub = e.fields?.sub
        if (typeof sub === 'string') set.add(sub)
    }
    return [...set].sort()
}

export function distinctKinds(events: AtlasEvent[]): string[] {
    return [...new Set(events.map((e) => e.kind))].sort()
}

export function distinctSources(events: AtlasEvent[]): string[] {
    return [...new Set(events.map((e) => e.source))].sort()
}

export function errorCount(events: AtlasEvent[]): number {
    return events.filter((e) => severityRank(e.severity) >= SEVERITY_ORDER.error).length
}
