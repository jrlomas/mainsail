// Action lines to host commands, and the one predicate that says whether an
// action can run now (src/backend/actions_map.c and the fill/resolve step of
// platform/core-wasm/core_wasm.c). The view dims exactly what actionsCheck()
// refuses, with the same reason, so there is one source for "enabled" and
// "why not" (U1c's rule); the reasons are user sentences from strings.
//
//   a line   "unload fps1", "dry oams1 start {target}C {hours}h", ...
//   a result { kind: 'gcode' | 'rpc' | 'error' | 'local' }  (ActionResult)

import { cut } from './cstr'
import { Busy, DryState, SlotState, slotGroup, slotId } from './model'
import type { Model } from './model'
import { format, str } from './strings'
import type { ActionResult } from './types'

// ---------------------------------------------------------------- results

/** What a mapper says about a line: an answer, a refusal with its reason, or
 *  "not mine" (the C's +1, -1 and 0). */
type Mapped = { rc: 1; script: string } | { rc: -1; why: string } | { rc: 0 }

const NOT_MINE: Mapped = { rc: 0 }
const refuse = (why: string): Mapped => ({ rc: -1, why })

// ---------------------------------------------------------------- scanning

/** The few `sscanf` conversions the action lines use: a word (at most `max`
 *  characters, as `%31s`), an integer (`%d`), and a literal. */
class Scanner {
    pos = 0
    private readonly text: string
    constructor(text: string) {
        this.text = text
    }

    private skipSpace(): void {
        while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos++
    }

    /** `%<max>s`: skips space, reads up to `max` non-space characters. */
    word(max: number): string | null {
        this.skipSpace()
        const start = this.pos
        while (this.pos < this.text.length && !/\s/.test(this.text[this.pos]) && this.pos - start < max) this.pos++
        return this.pos > start ? this.text.slice(start, this.pos) : null
    }

    /** `%d`: skips space, reads an optionally signed integer. */
    int(): number | null {
        this.skipSpace()
        const m = /^[+-]?\d+/.exec(this.text.slice(this.pos))
        if (!m) return null
        this.pos += m[0].length
        return Number(m[0])
    }

    /** A literal in the format; a space before it lets whitespace precede it. */
    literal(lit: string, skipSpaceFirst: boolean): boolean {
        if (skipSpaceFirst) this.skipSpace()
        if (!this.text.startsWith(lit, this.pos)) return false
        this.pos += lit.length
        return true
    }

    atEnd(): boolean {
        return this.pos === this.text.length
    }
}

/** The text after the leading `verb ` of `line`, or null when the line is not
 *  that verb followed by a space. */
function rest(line: string, verb: string): string | null {
    return line.startsWith(`${verb} `) ? line.slice(verb.length + 1) : null
}

// ---------------------------------------------------------------- lookups

/** The (unit, slot) whose display id ("oams11") is `id`. */
function slotFind(m: Model, id: string): { unit: number; slot: number } | null {
    for (let u = 0; u < m.units.length; u++) {
        for (let s = 0; s < m.units[u].slots.length; s++) {
            if (slotId(m, u, s) === id) return { unit: u, slot: s }
        }
    }
    return null
}

const unitFind = (m: Model, name: string): number => m.units.findIndex((u) => u.name === name)

/** The FPS lane the host gave `unit`, or null. */
const unitLane = (m: Model, unit: number): string | null => m.units[unit]?.lane || null

/** The toolhead whose id (the FPS lane) is `id`, or -1. */
const toolheadFind = (m: Model, id: string): number => m.toolheads.findIndex((t) => t.id === id)

const unitHostIdx = (m: Model, unit: number): number => m.units[unit]?.hostIdx ?? -1

/** Whether the toolhead of `unit` is busy loading or unloading this bay. */
function busyHere(m: Model, unit: number, slot: number): boolean {
    const th = m.toolheads[m.units[unit].toolhead]
    return th !== undefined && th.busy !== Busy.NONE && th.busyUnit === unit && th.busySlot === slot
}

// ----------------------------------------------------------------- writer

/** The host commands being built: one per line, and a command that does not
 *  fit the buffer refuses the line rather than truncating it. */
class Writer {
    private text = ''
    private readonly capacity: number
    over = false
    constructor(capacity: number) {
        this.capacity = capacity
    }

    /** Append one command; a newline joins it to what came before. */
    cmd(command: string): void {
        if (this.over) return
        const tmp = cut(command, 128) // char tmp[128] in the C
        const add = (this.text ? '\n' : '') + tmp
        if (this.text.length + add.length + 1 > this.capacity) {
            this.over = true
            return
        }
        this.text += add
    }

    get script(): string {
        return this.text
    }
}

// --------------------------------------------------------------- the table

/** `load <slot>`: OPENAMS_LOAD wants the group by name and the bay by the
 *  host's own id, so a bay outside a group, or one the host has not identified,
 *  cannot be addressed. What the bay's state allows is decided here too. */
function loadGcode(m: Model, id: string): { rc: 1; cmd: string } | { rc: -1; why: string } | null {
    const found = slotFind(m, id)
    if (!found) return null
    const slot = m.units[found.unit].slots[found.slot]

    if (busyHere(m, found.unit, found.slot)) return { rc: -1, why: str('REASON_BUSY_HERE') }
    switch (slot.state) {
        case SlotState.LOADED:
            return { rc: -1, why: str('REASON_ALREADY_LOADED') }
        case SlotState.ERROR:
            return { rc: -1, why: str('REASON_BAY_ERROR') }
        case SlotState.EMPTY:
            return { rc: -1, why: str('REASON_BAY_EMPTY') }
        default:
            break
    }
    if (slot.positioning) return { rc: -1, why: str('REASON_POSITIONING') }

    const gi = slotGroup(m, found.unit, found.slot)
    if (gi < 0) return { rc: -1, why: str('REASON_NOT_GROUPED') }
    if (slot.globalId < 0) return { rc: -1, why: str('REASON_NO_HOST_ID') }

    return { rc: 1, cmd: cut(`OPENAMS_LOAD GROUP=${m.groups[gi].name} SLOT=${slot.globalId}`, 64) }
}

/** `setting <key> on|off`: the name the host knows `key` by. The five real
 *  keys map to themselves; the two legacy display spellings are translated;
 *  any other key the display keeps to itself (null). */
function optionName(key: string): string | null {
    const names: Record<string, string> = {
        'read-on-insertion': 'read_tag_on_insertion',
        'read-on-startup': 'read_tags_at_startup',
        read_tag_on_insertion: 'read_tag_on_insertion',
        read_tags_at_startup: 'read_tags_at_startup',
        auto_reload_on_runout: 'auto_reload_on_runout',
        auto_create_spoolman_spools: 'auto_create_spoolman_spools',
        apply_pa_on_load: 'apply_pa_on_load',
    }
    return Object.hasOwn(names, key) ? names[key] : null
}

function dispatch(w: Writer, line: string, m: Model): Mapped {
    let arg: string | null

    // `pause and load <slot>`: pause first, then the same load the home tile
    // sends, in one buffer so a load the model cannot address refuses the whole
    // line instead of leaving a bare PAUSE behind.
    if ((arg = rest(line, 'pause and load')) !== null) {
        const r = loadGcode(m, arg)
        if (!r) return NOT_MINE
        if (r.rc !== 1) return refuse(r.why)
        w.cmd('PAUSE')
        w.cmd(r.cmd)
        return { rc: 1, script: '' }
    }

    if ((arg = rest(line, 'load')) !== null) {
        const r = loadGcode(m, arg)
        if (!r) return NOT_MINE
        if (r.rc !== 1) return refuse(r.why)
        w.cmd(r.cmd)
        return { rc: 1, script: '' }
    }

    // `unload <slot>`: the lane, not the bay, is what OPENAMS_UNLOAD takes, and
    // only a bay that is loaded (and not busy) can be unloaded. `unload <toolhead
    // id>` addresses the lane directly when the argument is no bay of the model.
    if ((arg = rest(line, 'unload')) !== null) {
        const found = slotFind(m, arg)
        if (found) {
            if (busyHere(m, found.unit, found.slot)) return refuse(str('REASON_BUSY_HERE'))
            if (m.units[found.unit].slots[found.slot].state !== SlotState.LOADED)
                return refuse(str('REASON_NOT_LOADED'))
            const lane = unitLane(m, found.unit)
            if (!lane) return refuse(str('REASON_LANE_UNKNOWN'))
            w.cmd(`OPENAMS_UNLOAD FPS=${lane}`)
            return { rc: 1, script: '' }
        }
        const th = toolheadFind(m, arg)
        if (th < 0) return NOT_MINE
        if (!m.toolheads[th].loaded) return refuse(str('REASON_NO_FILAMENT'))
        w.cmd(`OPENAMS_UNLOAD FPS=${m.toolheads[th].id}`)
        return { rc: 1, script: '' }
    }

    // `stop` cancels the load running on the busy unit's lane. An exact match:
    // the alert button `stop drying` is a local line of its own.
    if (line === 'stop') {
        if (m.busy === Busy.NONE || m.busyUnit < 0) return refuse(str('REASON_NOTHING_BUSY'))
        const lane = unitLane(m, m.busyUnit)
        if (!lane) return refuse(str('REASON_LANE_UNKNOWN'))
        w.cmd(`OAMSM_LOAD_FILAMENT_CANCEL FPS=${lane}`)
        return { rc: 1, script: '' }
    }

    // `stop <toolhead id>` is the panel's own targeted cancel; a line that does
    // not resolve to a toolhead (including "stop drying") is local.
    if ((arg = rest(line, 'stop')) !== null) {
        const th = toolheadFind(m, arg)
        if (th < 0) return NOT_MINE
        if (m.toolheads[th].busy === Busy.NONE) return refuse(str('REASON_NOTHING_BUSY'))
        w.cmd(`OAMSM_LOAD_FILAMENT_CANCEL FPS=${m.toolheads[th].id}`)
        return { rc: 1, script: '' }
    }

    if ((arg = rest(line, 'reread')) !== null) {
        const found = slotFind(m, arg)
        if (!found) return NOT_MINE
        if (m.units[found.unit].slots[found.slot].state === SlotState.EMPTY) return refuse(str('REASON_BAY_EMPTY'))
        const idx = unitHostIdx(m, found.unit)
        if (idx < 0) return refuse(str('REASON_UNIT_UNKNOWN'))
        w.cmd(`OAMS_RFID_SCAN OAMS=${idx}`)
        return { rc: 1, script: '' }
    }

    // SPOOL= here is the bay index inside OAMS=<host idx>.
    if ((arg = rest(line, 'calibrate')) !== null) {
        const found = slotFind(m, arg)
        if (!found) return NOT_MINE
        const idx = unitHostIdx(m, found.unit)
        if (idx < 0) return refuse(str('REASON_UNIT_UNKNOWN'))
        w.cmd(`OAMS_CALIBRATE_PTFE_LENGTH OAMS=${idx} SPOOL=${found.slot}`)
        return { rc: 1, script: '' }
    }

    // `dry <unit> target|hours|preset ...` only edits the pending display values,
    // so only start and stop reach the host.
    if ((arg = rest(line, 'dry')) !== null) {
        let s = new Scanner(arg)
        const a = s.word(31)
        if (a !== null && s.literal('start', true)) {
            const target = s.int()
            if (target !== null && s.literal('C', false)) {
                const hours = s.int()
                if (hours !== null && s.literal('h', false) && s.atEnd()) {
                    const unit = unitFind(m, a)
                    if (unit < 0) return NOT_MINE
                    const idx = unitHostIdx(m, unit)
                    if (idx < 0) return refuse(str('REASON_UNIT_UNKNOWN'))
                    w.cmd(`OAMS_DRYER_START OAMS=${idx} TARGET=${target} DURATION=${(hours * 3600) | 0}`)
                    return { rc: 1, script: '' }
                }
            }
        }

        s = new Scanner(arg)
        const b = s.word(31)
        if (b !== null && s.literal('stop', true) && s.atEnd()) {
            const unit = unitFind(m, b)
            if (unit < 0) return NOT_MINE
            if (m.units[unit].dryState === DryState.IDLE) return refuse(str('REASON_DRYER_IDLE'))
            const idx = unitHostIdx(m, unit)
            if (idx < 0) return refuse(str('REASON_UNIT_UNKNOWN'))
            w.cmd(`OAMS_DRYER_STOP OAMS=${idx}`)
            return { rc: 1, script: '' }
        }
        return NOT_MINE
    }

    if ((arg = rest(line, 'setting')) !== null) {
        const s = new Scanner(arg)
        const key = s.word(31)
        const val = s.word(7)
        if (key === null || val === null) return NOT_MINE
        let value: number
        if (val === 'on') value = 1
        else if (val === 'off') value = 0
        else return NOT_MINE
        const name = optionName(key)
        if (!name) return NOT_MINE // a key the display keeps to itself
        w.cmd(`OAMSM_SET_OPTION NAME=${name} VALUE=${value}`)
        return { rc: 1, script: '' }
    }

    // Both spellings exist: `create group <name>` and the model's `group create <name>`.
    arg = rest(line, 'create group') ?? rest(line, 'group create')
    if (arg !== null) {
        const name = new Scanner(arg).word(31)
        if (name === null) return NOT_MINE
        w.cmd(`OAMSM_CREATE_GROUP GROUP=${name}`)
        return { rc: 1, script: '' }
    }

    // `link <slot> <spool_id>` (and the older `assign spool`): a Spoolman spool
    // link. Checked before `assign` so the two-word prefix does not eat the
    // first token.
    for (const verb of ['link', 'assign spool']) {
        if ((arg = rest(line, verb)) === null) continue
        const s = new Scanner(arg)
        const id = s.word(31)
        const spool = id === null ? null : s.int()
        if (id === null || spool === null) return NOT_MINE
        const found = slotFind(m, id)
        if (!found) return NOT_MINE
        w.cmd(`OAMSM_SET_BAY_SPOOL OAMS=${m.units[found.unit].name} BAY=${found.slot} SPOOL=${spool} SOURCE=manual`)
        return { rc: 1, script: '' }
    }

    if ((arg = rest(line, 'assign')) !== null) {
        const s = new Scanner(arg)
        const group = s.word(31)
        const id = group === null ? null : s.word(31)
        if (group === null || id === null) return NOT_MINE
        const found = slotFind(m, id)
        if (!found) return NOT_MINE
        w.cmd(`OAMSM_ASSIGN_BAY GROUP=${group} OAMS=${m.units[found.unit].name} BAY=${found.slot}`)
        return { rc: 1, script: '' }
    }

    if ((arg = rest(line, 'unassign')) !== null) {
        const found = slotFind(m, arg)
        if (!found) return NOT_MINE
        const gi = slotGroup(m, found.unit, found.slot)
        if (gi < 0) return refuse(str('REASON_NOT_GROUPED'))
        w.cmd(`OAMSM_UNASSIGN_BAY GROUP=${m.groups[gi].name} OAMS=${m.units[found.unit].name} BAY=${found.slot}`)
        return { rc: 1, script: '' }
    }

    if ((arg = rest(line, 'unlink')) !== null) {
        const found = slotFind(m, arg)
        if (!found) return NOT_MINE
        if (m.units[found.unit].slots[found.slot].spoolId < 0) return refuse(str('REASON_NO_LINK'))
        w.cmd(`OAMSM_CLEAR_BAY_SPOOL OAMS=${m.units[found.unit].name} BAY=${found.slot}`)
        return { rc: 1, script: '' }
    }

    if (line === 'fault clear_errors') {
        w.cmd('OAMSM_CLEAR_ERRORS')
        return { rc: 1, script: '' }
    }

    if ((arg = rest(line, 'fault clear_fault')) !== null) {
        const unit = unitFind(m, arg)
        if (unit < 0) return NOT_MINE
        const idx = unitHostIdx(m, unit)
        if (idx < 0) return refuse(str('REASON_UNIT_UNKNOWN'))
        w.cmd(`OAMS_CLEAR_FAULT OAMS=${idx}`)
        return { rc: 1, script: '' }
    }

    if ((arg = rest(line, 'fault retry_load')) !== null) {
        const group = new Scanner(arg).word(31)
        if (group === null) return NOT_MINE
        w.cmd(`OAMSM_LOAD_FILAMENT GROUP=${group}`)
        return { rc: 1, script: '' }
    }

    // `fault resume` and the older bare `resume` from the alert buttons.
    if (line === 'fault resume' || line === 'resume') {
        w.cmd('RESUME')
        return { rc: 1, script: '' }
    }

    return NOT_MINE
}

/**
 * Map `line` to G-code against the model: the script (rc 1), a refusal with
 * its reason (rc -1: the model cannot address it, or the state does not allow
 * it), or not a G-code line (rc 0). `capacity` is the size of the caller's
 * output buffer (the view's dry run uses 128, core_action 512).
 */
export function actionsMap(line: string, m: Model, capacity = 512): Mapped {
    const w = new Writer(capacity)
    const r = dispatch(w, line, m)
    if (r.rc === 1) {
        return w.over ? refuse(str('REASON_CMD_TOO_LONG')) : { rc: 1, script: w.script }
    }
    return r
}

/** The RPC vocabulary: `spool list`, `spool confirm <slot> <grams>` and
 *  `job metadata <file>`. */
export function actionsRpc(line: string, m: Model): { method: string; params: Record<string, unknown> } | null {
    if (line === 'spool list') {
        return { method: 'server.spoolman.proxy', params: { request_method: 'GET', path: '/v1/spool' } }
    }

    if (line.startsWith('spool confirm ')) {
        const s = new Scanner(line.slice(14))
        const id = s.word(31)
        const grams = id === null ? null : s.int()
        if (id === null || grams === null) return null
        const found = slotFind(m, id)
        if (!found) return null
        return {
            method: 'server.openams_spoolman.confirm',
            params: { bay: `${m.units[found.unit].name}-${found.slot}`, remaining_g: grams },
        }
    }

    if (line.startsWith('job metadata ')) {
        const filename = line.slice(13)
        if (!filename) return null
        return { method: 'server.files.metadata', params: { filename } }
    }

    return null
}

/**
 * The one predicate: whether `line` can run now, and if not why not. A line
 * neither mapper recognizes is reported enabled with no reason, rather than
 * hiding a real action behind a false negative.
 */
export function actionsCheck(line: string, m: Model): { enabled: boolean; why: string } {
    const r = actionsMap(line, m, 128)
    if (r.rc === 1) return { enabled: true, why: '' }
    if (r.rc === -1) return { enabled: false, why: r.why }
    return { enabled: true, why: '' }
}

// ------------------------------------------------------------ core_action

/** C's `%g` for a double (six significant digits, no trailing zeros). */
function formatG(d: number): string {
    if (d === 0) return '0'
    const exp = Math.floor(Math.log10(Math.abs(d)))
    if (exp < -4 || exp >= 6) {
        const [mant, e] = d.toExponential(5).split('e')
        const trimmed = mant.includes('.') ? mant.replace(/\.?0+$/, '') : mant
        const sign = e.startsWith('-') ? '-' : '+'
        return `${trimmed}e${sign}${e.replace(/^[+-]/, '').padStart(2, '0')}`
    }
    const fixed = d.toPrecision(6)
    return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

/** One form value as text: strings as they are, whole numbers without a
 *  decimal point, booleans as 1 and 0; null when it is none of those. */
function formText(v: unknown): string | null {
    if (typeof v === 'string') return v
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : formatG(v)
    if (typeof v === 'boolean') return v ? '1' : '0'
    return null
}

/** Replace every `{key}` of `line` with the form's value for key. Returns the
 *  error reason when a value is missing or the result does not fit. */
function fillLine(line: string, form: Record<string, unknown> | null): { line: string } | { reason: string } {
    const LIMIT = 256 // char resolved[256] in the C
    let out = ''
    let p = 0
    while (p < line.length) {
        const end = line.indexOf('}', p)
        const key = line[p] === '{' && end >= 0 ? line.slice(p + 1, end) : null
        if (key === null || key.length === 0 || key.length >= 32) {
            if (out.length + 1 >= LIMIT) return { reason: str('REASON_LINE_TOO_LONG') }
            out += line[p++]
            continue
        }
        const value = formText(form ? form[key] : undefined)
        if (value === null) return { reason: format('REASON_FORM_MISSING', { key }, 160) }
        if (out.length + value.length >= LIMIT) return { reason: str('REASON_LINE_TOO_LONG') }
        out += value
        p = end + 1
    }
    return { line: out }
}

/** Resolve `line` (a form fills its placeholders) against the model and say
 *  where it goes: G-code, an RPC call, an error, or nothing to send. */
export function coreAction(m: Model, line: string, form: Record<string, unknown> | null | undefined): ActionResult {
    const filled = fillLine(line, form ?? null)
    if ('reason' in filled) return { kind: 'error', reason: filled.reason }

    const mapped = actionsMap(filled.line, m, 512)
    if (mapped.rc === 1) return { kind: 'gcode', script: mapped.script }
    if (mapped.rc === -1) return { kind: 'error', reason: mapped.why }

    const rpc = actionsRpc(filled.line, m)
    if (rpc) return { kind: 'rpc', method: rpc.method, params: rpc.params }
    return { kind: 'local' }
}
