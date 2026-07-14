import { AtlasEvent } from './types'

function sameLocalDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function relativeClock(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds))
    const days = Math.floor(total / 86400)
    const hours = Math.floor((total % 86400) / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const secs = total % 60
    const clock = [hours, minutes, secs].map((part) => part.toString().padStart(2, '0')).join(':')
    return days ? `+${days}d ${clock}` : `+${clock}`
}

/** Human-facing local time, with a relative clock when no wall anchor exists. */
export function formatAtlasTime(event: AtlasEvent, now = new Date(), locale?: string): string {
    if (event.wall_time !== null) {
        const date = new Date(event.wall_time * 1000)
        if (!Number.isNaN(date.getTime())) {
            const options: Intl.DateTimeFormatOptions = {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
            }
            if (!sameLocalDay(date, now)) {
                options.month = 'short'
                options.day = 'numeric'
            }
            return date.toLocaleString(locale, options)
        }
    }
    if (event.mtime !== null) return relativeClock(event.mtime)
    return '—'
}

/** Precise provenance retained as a tooltip instead of cluttering the table. */
export function atlasTimeTitle(event: AtlasEvent, locale?: string): string {
    const confidence = event.t_exact ? 'Exact' : 'Approximate'
    const machine = event.mtime === null ? '' : ` Machine time: ${event.mtime.toFixed(3)} s.`
    if (event.wall_time !== null) {
        const date = new Date(event.wall_time * 1000)
        if (!Number.isNaN(date.getTime())) {
            return `${confidence} local time: ${date.toLocaleString(locale)}.${machine}`
        }
    }
    if (event.mtime !== null) return `${confidence} ${event.time_basis} time.${machine}`
    return 'Timestamp unavailable.'
}
