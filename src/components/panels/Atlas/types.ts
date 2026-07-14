// Data model the Atlas panels render. Mirrors the shapes the Atlas
// deterministic floor produces (atlas/timeline.py, atlas/diagnosis) so the
// panel, the CLI, and the Python tests all agree on what "the timeline,
// filtered" and "the diagnosis" mean. The Atlas daemon pushes these over
// Moonraker; the adapter (atlasAdapter.ts) coerces the raw shapes here.

export type AtlasSeverity = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical'

// Total order over severities — must match atlas/timeline.py SEVERITY.
export const SEVERITY_ORDER: Record<AtlasSeverity, number> = {
    debug: 0,
    info: 1,
    notice: 2,
    warning: 3,
    error: 4,
    critical: 5,
}

export type AtlasTimeBasis = 'machine' | 'host_monotonic' | 'wall' | 'none'

export interface AtlasEvent {
    seq: number
    kind: string
    source: string
    severity: AtlasSeverity
    summary: string
    // Machine-time axis in seconds; null when no time was recovered.
    mtime: number | null
    // Wall-clock epoch seconds resolved by Atlas from the session anchor.
    wall_time: number | null
    time_basis: AtlasTimeBasis
    // False when the timestamp was carried forward (an "approximately here").
    t_exact: boolean
    fields: Record<string, unknown>
}

export interface AtlasTimeline {
    events: AtlasEvent[]
    notes: string[]
    versions: Record<string, string>
}

export interface AtlasMatch {
    pattern_id: string
    confidence: number
    cause: string
    fix: string
    provenance: string
}

export interface AtlasCase {
    case_hash: string
    summary: string
    note: string
}

export interface AtlasDiagnosis {
    matched: boolean
    matches: AtlasMatch[]
    // Present only when nothing matched (the "case captured" path).
    case: AtlasCase | null
    notes: string[]
}

// The view filter — 1:1 with atlas/view.py TimelineFilter.
export interface TimelineFilter {
    minSeverity: AtlasSeverity
    sources: string[]
    kinds: string[]
    subsystems: string[]
    // ordered = machine-time order; !ordered = arrival order (live tail).
    ordered: boolean
}

export function defaultFilter(): TimelineFilter {
    return { minSeverity: 'debug', sources: [], kinds: [], subsystems: [], ordered: true }
}
