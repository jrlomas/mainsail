// Build the Atlas view models from the raw payload the Atlas daemon pushes
// through Moonraker. Like oamsAdapter, it is defensive: every field is
// coerced with a fallback so a partial or malformed payload renders an
// empty-but-valid model instead of throwing in a Vue template.

import {
    AtlasCase,
    AtlasDiagnosis,
    AtlasEvent,
    AtlasMatch,
    AtlasSeverity,
    AtlasTimeBasis,
    AtlasTimeline,
    SEVERITY_ORDER,
} from './types'

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v : fallback
}

function asNumberOrNull(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v)
        if (Number.isFinite(n)) return n
    }
    return null
}

function asSeverity(v: unknown): AtlasSeverity {
    return typeof v === 'string' && v in SEVERITY_ORDER ? (v as AtlasSeverity) : 'info'
}

function asBasis(v: unknown): AtlasTimeBasis {
    const ok = ['machine', 'host_monotonic', 'wall', 'none']
    return typeof v === 'string' && ok.includes(v) ? (v as AtlasTimeBasis) : 'none'
}

export function buildEvent(raw: unknown, index: number): AtlasEvent {
    const r = isRecord(raw) ? raw : {}
    return {
        seq: asNumberOrNull(r.seq) ?? index,
        kind: asString(r.kind, 'log'),
        source: asString(r.source, 'host'),
        severity: asSeverity(r.severity),
        summary: asString(r.summary),
        mtime: asNumberOrNull(r.mtime),
        time_basis: asBasis(r.time_basis),
        t_exact: r.t_exact === true,
        fields: isRecord(r.fields) ? r.fields : {},
    }
}

export function buildTimeline(raw: unknown): AtlasTimeline {
    const r = isRecord(raw) ? raw : {}
    const rawEvents = Array.isArray(r.events) ? r.events : []
    return {
        events: rawEvents.map((e, i) => buildEvent(e, i)),
        notes: Array.isArray(r.notes) ? r.notes.filter((n): n is string => typeof n === 'string') : [],
        versions: isRecord(r.versions) ? (r.versions as Record<string, string>) : {},
    }
}

function buildMatch(raw: unknown): AtlasMatch {
    const r = isRecord(raw) ? raw : {}
    return {
        pattern_id: asString(r.pattern_id),
        confidence: asNumberOrNull(r.confidence) ?? 0,
        cause: asString(r.cause),
        fix: asString(r.fix),
        provenance: asString(r.provenance, 'seed'),
    }
}

function buildCase(raw: unknown): AtlasCase | null {
    if (!isRecord(raw)) return null
    return {
        case_hash: asString(raw.case_hash),
        summary: asString(raw.summary),
        note: asString(raw.note, 'no known pattern matched — case captured'),
    }
}

export function buildDiagnosis(raw: unknown): AtlasDiagnosis {
    const r = isRecord(raw) ? raw : {}
    const rawMatches = Array.isArray(r.matches) ? r.matches : []
    const matches = rawMatches.map(buildMatch).sort((a, b) => b.confidence - a.confidence)
    return {
        matched: matches.length > 0,
        matches,
        case: matches.length === 0 ? buildCase(r.case) : null,
        notes: Array.isArray(r.notes) ? r.notes.filter((n): n is string => typeof n === 'string') : [],
    }
}
