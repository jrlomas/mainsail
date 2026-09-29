// The composed strings (numbers and names inside a sentence): the port of the
// vs_fmt_* functions in src/view/strings.c. The fixed strings live in
// design/strings.json and reach here as strings.gen.ts; every user-visible
// word is composed in these two places only (PRINCIPLES.md 5).
//
// Each function returns the whole text. The caller cuts it to the field it
// lands in, as the C's snprintf into a fixed buffer does.

import { STR } from './strings.gen'
import type { StrId } from './strings.gen'
import { fmtFixed } from './cstr'

export { STR, SETTING_KEYS } from './strings.gen'
export type { StrId }

/** The fixed text for `id` (view_str(VS_<id>)). */
export const str = (id: StrId): string => STR[id]

/** The action mapper's terse reasons are user sentences in the table; this
 *  is the same lookup under the C's name. */
export const viewStr = str

/** "?" when unknown (negative), else "NN%". */
export const fmtPct = (pct: number): string => (pct < 0 ? STR.UNKNOWN_MARK : `${pct}%`)

/** "" when unknown, else "NN g". */
export const fmtGrams = (grams: number): string => (grams < 0 ? '' : `${grams} g`)

/** "0.480"-style, 3 decimals; "" for an unknown (negative) reading. */
export const fmtPressure = (value: number): string => (value < 0 ? '' : fmtFixed(value, 3))

/** "0.50"-style, 2 decimals: a tick label of the pressure scale. */
export const fmtScale = (value: number): string => fmtFixed(value, 2)

/** "31% RH | 24°C", "31% RH", "24°C" or "" from whichever readings exist. */
export function fmtEnv(hasPct: boolean, pct: number, hasTemp: boolean, tempC: number): string {
    if (hasPct && hasTemp) return `${pct}% RH | ${tempC}°C`
    if (hasPct) return `${pct}% RH`
    if (hasTemp) return `${tempC}°C`
    return ''
}

/** "T1 needs 120 g; its spools have 80 g". */
export const fmtShortfall = (tool: number, need: number, have: number): string =>
    `T${tool} needs ${need} g; its spools have ${have} g`

/** "65°C · 4h left": a unit heating or dehumidifying. */
export function fmtDryerActive(targetC: number, remainingMin: number): string {
    const hours = remainingMin > 0 ? Math.trunc((remainingMin + 59) / 60) : 0
    return `${targetC}°C · ${hours}h left`
}

/** "Spool N": a tile's sublabel (the bay, 1-based). */
export const fmtSpoolLabel = (bay: number): string => `Spool ${bay + 1}`

/** "oams2 Spool 1": a spool named with its unit's config name. */
export const fmtUnitSpool = (unit: string, bay: number): string => `${unit} Spool ${bay + 1}`

/** "T1 (oams2 Spool 2)". */
export const fmtToolSpool = (tool: string, unit: string, bay: number): string => `${tool} (${unit} Spool ${bay + 1})`

/** An extruder's display name: underscores removed, each word capitalized
 *  ("dragon_burner" -> "DragonBurner", "extruder" -> "Extruder"). */
export function fmtExtruderTitle(name: string): string {
    let out = ''
    let wordStart = true
    for (const c of name) {
        if (c === '_') {
            wordStart = true
            continue
        }
        out += wordStart && c >= 'a' && c <= 'z' ? c.toUpperCase() : c
        wordStart = false
    }
    return out
}

/** "T0 ran out" or "T0 ran out; switching to <to>". */
export const fmtRunout = (tool: string, to: string): string =>
    to ? `${tool} ran out; switching to ${to}` : `${tool} ran out`

/** "T0 ran out; no spare spool is left". */
export const fmtRunoutNoSpare = (tool: string): string => `${tool} ran out; no spare spool is left`

/** A Spoolman spool's picker label: "<vendor> <material> · <g> g", leaving out
 *  the empty parts and an unknown (negative) weight. */
export function fmtSpoolOption(vendor: string, material: string, grams: number): string {
    const head = [vendor, material].filter(Boolean).join(' ')
    if (grams >= 0 && head) return `${head} · ${grams} g`
    if (grams >= 0) return `${grams} g`
    return head
}
