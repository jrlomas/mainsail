// The view builders (src/view/view.c and view_json.c): the one place that turns
// the model into content. Both renderers draw only what these return; a
// renderer never reads the model and never composes text of its own
// (docs/design/UNIFIED_UI.md 2).
//
// The C fills fixed structs and serializes them; this builds the same JSON
// shapes directly. The text limits of those structs are kept (every string is
// cut to its field's size), and the differential tests hold the two identical.

import { cjsonNumber, cut, f32, fmtFixed } from './cstr'
import { actionsCheck } from './actions'
import {
    Busy,
    DryState,
    InfoSource,
    CalState,
    SlotState,
    Sev,
    Variant,
    MAX_TOOLS,
    groupNextSpare,
    slotGroup,
    slotId,
    toolShortfall,
} from './model'
import type { Alert, Model, Toolhead, Unit } from './model'
import {
    fmtDryerActive,
    fmtEnv,
    fmtExtruderTitle,
    fmtGrams,
    fmtPct,
    fmtPressure,
    fmtRunout,
    fmtRunoutNoSpare,
    fmtScale,
    fmtShortfall,
    fmtSpoolLabel,
    fmtSpoolOption,
    fmtToolSpool,
    fmtUnitSpool,
    LANG_CODES,
    language,
    languages,
    SETTING_KEYS,
    str,
} from './strings'
import type {
    ActionStyle,
    Ink,
    Severity,
    Tone,
    View,
    ViewAction,
    ViewAlert,
    ViewAlertGroup,
    ViewSetting,
    ViewTile,
    ViewToolhead,
    ViewUnit,
} from './types'

// The C's text field sizes (src/view/view.h), so text is cut where the C cuts
// it. Only the fields that hold *composed* text have a size left: a fixed
// string is a pointer into a const table in C, so the TypeScript builders
// hand the table's text over whole and never cut it. The differential tests
// hold the two identical.
const ID = 16
const LABEL = 16
const MATERIAL = 24
const GRAMS = 12
const PCT = 8
const TITLE = 24
const SUBTITLE = 48
const MESSAGE = 96
const STEP_LABEL = 32
const PRESSURE_TEXT = 12
const SCALE = 8
const UNIT_ID = 8
const ENV_TEXT = 24
const DRYER_TEXT = 32
const FAMILY = 16
const ALERT_CODE = 40
const ALERT_TEXT = 96
const ALERT_UNIT = 8
const TAG_DETAIL = 96
const SETTING_KEY = 32
const ACTION_ID = 20
const ACTION_LINE = 56
const ACTION_REASON = 56
const FIELD_ID = 12
const OPTION_LABEL = 44

const MAX_ACTIONS = 8
const MAX_ACTIONS_PER_ALERT = 2
const MAX_ALERTS_PER_GROUP = 6
const MAX_OPTIONS = 16
const MAX_ALERTS = 8
const MAX_PENDING_SPOOLS = 8
const MAX_UNASSIGNED = 6
const MAX_SETTINGS = 6
const LANGUAGE_SETTING_ROW = MAX_SETTINGS - 1

// -------------------------------------------------------------- geometry

/** "light" text (on a dark filament) or "dark" text, by relative luminance
 *  0.2126 R + 0.7152 G + 0.0722 B > 160 (design/tokens.json "ink_threshold"),
 *  kept in integers like the C. */
function inkFor(rgb: number): Ink {
    const r = (rgb >> 16) & 0xff
    const g = (rgb >> 8) & 0xff
    const b = rgb & 0xff
    return 2126 * r + 7152 * g + 722 * b > 1600000 ? 'dark' : 'light'
}

const mixChannel = (fg: number, bg: number, pct: number): number =>
    Math.min(255, Math.max(0, Math.floor((fg * pct + bg * (100 - pct) + 50) / 100)))

function mixRgb(fg: number, bg: number, pct: number): number {
    const r = mixChannel((fg >> 16) & 0xff, (bg >> 16) & 0xff, pct)
    const g = mixChannel((fg >> 8) & 0xff, (bg >> 8) & 0xff, pct)
    const b = mixChannel(fg & 0xff, bg & 0xff, pct)
    return (r << 16) | (g << 8) | b
}

/** The two stops of a tile's vertical gradient (design/tokens.json "tile"): a
 *  bright tile (dark text) mixes 78% / 42% of the filament, a dark tile 96% / 74%. */
function gradientFor(rgb: number, ink: Ink): [number, number] {
    return ink === 'dark'
        ? [mixRgb(rgb, 0x141414, 78), mixRgb(rgb, 0x1a1a1a, 42)]
        : [mixRgb(rgb, 0x000000, 96), mixRgb(rgb, 0x1a1a1a, 74)]
}

const hex = (rgb: number): string => `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`

// ------------------------------------------------------------------ groups

/** Where a tile sits among its group's spares (docs/design/UNIFIED_UI.md 4,
 *  "Spare order"): the loaded tile is drawn as a bare mark when the group has a
 *  usable spare; the others count the non-loaded members in fallback order. */
function computeSpare(m: Model, gi: number, unit: number, slot: number): ViewTile['spare'] {
    const g = m.groups[gi]
    const isLoaded = m.units[unit].slots[slot].state === SlotState.LOADED

    // A group with one member has no spare: no badge on its one member either way.
    if (g.members.length <= 1) return null

    let nonLoaded = 0
    for (const mem of g.members) {
        const s = m.units[mem.unit]?.slots[mem.slot]
        if (!s || s.state === SlotState.LOADED) continue
        nonLoaded++
    }

    if (isLoaded) {
        return groupNextSpare(m, gi) ? { position: null, count: nonLoaded } : null
    }

    let rank = 0
    for (const mem of g.members) {
        const s = m.units[mem.unit]?.slots[mem.slot]
        if (!s || s.state === SlotState.LOADED) continue
        rank++
        if (mem.unit === unit && mem.slot === slot) return { position: rank, count: nonLoaded }
    }
    return null
}

/** The slicer tool index a group named "T<n>" feeds; -1 when it is not that shape. */
function groupToolIndex(name: string): number {
    if (name[0] !== 'T') return -1
    const m = /^\s*([+-]?\d+)/.exec(name.slice(1))
    if (!m) return -1
    const n = Number(m[1])
    return n < 0 || n >= MAX_TOOLS ? -1 : n
}

// ----------------------------------------------------------------- actions

/** The actions of one widget, built in order, at most MAX_ACTIONS of them, with
 *  the select-option pool the assign-spool field points into. */
class ActionList {
    items: ViewAction[] = []

    add(id: string, label: string, line: string, style: ActionStyle): ViewAction | null {
        if (this.items.length >= MAX_ACTIONS) return null
        const a: ViewAction = {
            id: cut(id, ACTION_ID),
            label,
            line: cut(line, ACTION_LINE),
            enabled: false,
            reason: '',
            style,
            target: 'tile',
            confirm: null,
            form: null,
        }
        this.items.push(a)
        return a
    }
}

/** Fill `a`'s enabled and reason from the one predicate (actionsCheck): the
 *  view copies its answer and derives nothing of its own. */
function check(a: ViewAction, line: string, m: Model): void {
    const r = actionsCheck(line, m)
    a.enabled = r.enabled
    a.reason = r.enabled ? '' : cut(r.why, ACTION_REASON)
}

/** A plain action: the line is built once, sent as it stands and checked as it stands. */
function simple(
    list: ActionList,
    m: Model,
    id: string,
    label: string,
    style: ActionStyle,
    line: string
): ViewAction | null {
    const text = cut(line, ACTION_LINE)
    const a = list.add(id, label, text, style)
    if (a) check(a, text, m)
    return a
}

function confirm(a: ViewAction, title: string, text: string, ok: string): void {
    a.confirm = { title, text, ok_label: ok }
}

// -------------------------------------------------------------------- tile

/** A tile's tag: text, tone and the sentence that explains it. */
type Tag = NonNullable<ViewTile['tag']>

function buildTile(m: Model, unitIdx: number, bay: number): ViewTile {
    const u = m.units[unitIdx]
    const s = u.slots[bay]
    const gi = slotGroup(m, unitIdx, bay)
    const th = u.toolhead >= 0 && u.toolhead < m.toolheads.length ? m.toolheads[u.toolhead] : undefined

    // The label is the tool, or "?" for a bay in no group; the sublabel is always
    // the bay's "Spool N".
    const tool = gi >= 0 ? cut(m.groups[gi].name, LABEL) : null
    const label = tool ?? str('UNKNOWN_MARK')
    const spare = gi >= 0 ? computeSpare(m, gi, unitIdx, bay) : null

    // State, in the order a fault or a motion in progress outranks a plain
    // material reading: error > runout > loading/unloading > positioning > the
    // raw slot state.
    let state: ViewTile['state']
    let tag: Tag | null = null
    const mkTag = (text: string, tone: Tone): Tag => ({ text, tone, detail: '', code: '' })
    if (s.state === SlotState.ERROR) {
        state = 'error'
        tag = mkTag(str('TAG_ERROR'), 'error')
    } else if (th && th.runoutActive && th.runoutFromUnit === unitIdx && th.runoutFromSlot === bay) {
        state = 'runout'
        tag = mkTag(str('TAG_RUNOUT'), 'info')
    } else if (th && th.busy !== Busy.NONE && th.busyUnit === unitIdx && th.busySlot === bay) {
        const unloading = th.busy === Busy.UNLOAD
        state = unloading ? 'unloading' : 'loading'
        tag = mkTag(str(unloading ? 'TAG_UNLOADING' : 'TAG_LOADING'), 'info')
    } else if (s.positioning) {
        state = 'positioning'
        tag = mkTag(str('TAG_POSITIONING'), 'info')
    } else {
        const empty = s.state === SlotState.EMPTY
        const unknown = !empty && s.infoSource === InfoSource.UNKNOWN
        // Loaded outranks "unknown": something is actively feeding from this bay,
        // which matters more than whether its material was ever identified.
        if (s.state === SlotState.LOADED) state = 'loaded'
        else if (empty) {
            state = 'empty'
            tag = mkTag(str('TAG_NOT_INSERTED'), 'neutral')
        } else if (unknown) state = 'unknown'
        else state = 'ready'
    }

    // Nothing more urgent to say and a spool waits for the user's confirmation.
    if (!tag && s.pendingConfirmation) tag = mkTag(str('TAG_CONFIRM'), 'info')

    if (tag) {
        const detailId =
            {
                error: 'TAGD_ERROR',
                runout: 'TAGD_RUNOUT',
                loading: 'TAGD_LOADING',
                unloading: 'TAGD_UNLOADING',
                positioning: 'TAGD_POSITIONING',
                empty: 'TAGD_NOT_INSERTED',
            }[state as string] ?? 'TAGD_CONFIRM'
        tag.detail = cut(str(detailId as 'TAGD_CONFIRM'), TAG_DETAIL)
        // An error on the bay the lane fault names says what the host said, and
        // carries the host's code as its own field.
        if (state === 'error' && th && th.hasError && th.errorUnit === unitIdx && th.errorSlot === bay) {
            if (th.errorText) tag.detail = cut(th.errorText, TAG_DETAIL)
            tag.code = cut(th.errorCode, ALERT_CODE)
        }
    }

    // One disabled look: an empty or unidentified bay, or a unit that is offline.
    const dim = state === 'empty' || state === 'unknown' || !u.connected
    // The hatched look marks "nothing to use here": not inserted, or disabled; a
    // real spool (black, unknown, error, ...) is never hatched.
    const hatched = state === 'empty' || !u.connected

    const ink = inkFor(s.color)
    const [top, bottom] = gradientFor(s.color, ink)

    // "name" has no field of its own yet: it mirrors the material. An unknown
    // one is "": only the ring shows "?".
    const material = cut(s.state === SlotState.EMPTY ? '' : s.material, MATERIAL)

    return {
        slot_id: cut(slotId(m, unitIdx, bay), ID),
        bay,
        tool,
        label: cut(label, LABEL),
        sublabel: cut(fmtSpoolLabel(bay), LABEL),
        spare,
        state,
        tag,
        color: hex(s.color),
        ink,
        gradient_top: hex(top),
        gradient_bottom: hex(bottom),
        dim,
        hatched,
        name: material,
        material,
        brand: cut(s.brand, MATERIAL),
        grams_text: cut(fmtGrams(s.remainingG), GRAMS),
        pct: s.remainingPct,
        pct_text: cut(fmtPct(s.remainingPct), PCT),
        low: s.remainingPct >= 0 && s.remainingPct < 15,
        rfid: s.infoSource === InfoSource.TAG,
        pending_confirmation: s.pendingConfirmation,
        calibrated: s.calState === CalState.CONFIGURED,
        actions: tileActions(m, unitIdx, bay),
    }
}

/** The tile's actions, a fixed set in a fixed order; enabled and reason come
 *  from the one predicate, which dims what does not apply now. */
function tileActions(m: Model, unitIdx: number, bay: number): ViewAction[] {
    const u = m.units[unitIdx]
    const s = u.slots[bay]
    const id = cut(slotId(m, unitIdx, bay), ID)
    const list = new ActionList()

    simple(list, m, 'load', str('ACTION_LOAD'), 'normal', `load ${id}`)
    // The bay's own unload line: the mapper resolves it to the unit's lane, and
    // only a loaded bay passes its predicate.
    const unload = simple(list, m, 'unload', str('ACTION_UNLOAD'), 'normal', `unload ${id}`)
    if (unload && m.printing)
        confirm(unload, str('CONFIRM_UNLOAD_TITLE'), str('CONFIRM_UNLOAD_TEXT'), str('CONFIRM_UNLOAD_OK'))

    // Assign a Spoolman spool from the list, or refresh the list first.
    if (m.spools.some((sp) => sp.id !== 0)) {
        const line = cut(`link ${id} {spool}`, ACTION_LINE)
        const a = list.add('assign_spool', str('ACTION_ASSIGN_SPOOL'), line, 'normal')
        if (a) {
            const options: { value: number; label: string }[] = []
            let value = 0
            for (const sp of m.spools) {
                if (options.length >= MAX_OPTIONS) break
                if (sp.id === 0) continue
                options.push({
                    value: sp.id,
                    label: cut(fmtSpoolOption(sp.vendor, sp.material, sp.remainingG), OPTION_LABEL),
                })
                // The bay's current link (else the first spool) is the default.
                if (options.length === 1 || sp.id === s.spoolId) value = f32(sp.id)
            }
            a.form = {
                fields: [
                    {
                        id: 'spool',
                        label: str('FIELD_SPOOL_LABEL'),
                        kind: 'select',
                        value: cjsonNumber(value),
                        min: 0,
                        max: 0,
                        step: 0,
                        unit: '',
                        options,
                    },
                ],
            }
            check(a, cut(`link ${id} ${Math.trunc(value)}`, ACTION_LINE), m)
        }
    } else {
        simple(list, m, 'spool_list_refresh', str('ACTION_REFRESH_SPOOLS'), 'normal', 'spool list')
    }

    simple(list, m, 'unlink', str('ACTION_UNLINK'), 'normal', `unlink ${id}`)
    // A unit with no reader can never re-read a tag: no such action.
    if (u.rfid) simple(list, m, 'reread', str('ACTION_REREAD'), 'normal', `reread ${id}`)
    const cal = simple(list, m, 'calibrate', str('ACTION_CALIBRATE'), 'normal', `calibrate ${id}`)
    if (cal) confirm(cal, str('CONFIRM_CALIBRATE_TITLE'), str('CONFIRM_CALIBRATE_TEXT'), str('CONFIRM_CALIBRATE_OK'))

    // Load and unload act on the tile body; the rest edit the spool (the ring).
    for (const a of list.items) a.target = a.id === 'load' || a.id === 'unload' ? 'tile' : 'ring'

    // The tag's details: the lane fault that names this unit and bay is shown by
    // this tile, so its recovery actions live here, under the tag.
    const th = u.toolhead >= 0 && u.toolhead < m.toolheads.length ? m.toolheads[u.toolhead] : undefined
    if (th && th.hasError && th.errorUnit === unitIdx && th.errorSlot === bay) {
        for (const fa of faultActions(m, th)) {
            if (list.items.length >= MAX_ACTIONS) break
            list.items.push({ ...fa, target: 'tag' })
        }
    }
    return list.items
}

// -------------------------------------------------------------------- unit

/** The defaults of the drying form: the unit's own last target if it has one,
 *  else 55 C, clamped to [45, the variant's ceiling]; 12 hours, or the time
 *  actually remaining when a cycle is already running. */
function dryDefaults(u: Unit): { target: number; hours: number } {
    const tmax = u.variant === Variant.AMS_HT ? 85 : 65
    let t = u.dryTargetC >= 45 ? u.dryTargetC : 55
    if (t > tmax) t = tmax
    if (t < 45) t = 45
    let hours = 12
    if (u.dryState !== DryState.IDLE && u.dryRemainingMin > 0) {
        hours = Math.min(24, Math.max(1, Math.trunc((u.dryRemainingMin + 59) / 60)))
    }
    return { target: t, hours }
}

function unitActions(m: Model, unitIdx: number): ViewAction[] {
    const u = m.units[unitIdx]
    const list = new ActionList()
    if (!u.canDry) return list.items

    const { target, hours } = dryDefaults(u)
    const tmax = u.variant === Variant.AMS_HT ? 85 : 65
    const a = list.add('dry_start', str('ACTION_DRY_START'), `dry ${u.name} start {target}C {hours}h`, 'normal')
    if (a) {
        a.form = {
            fields: [
                {
                    id: 'target',
                    label: str('FIELD_TARGET_LABEL'),
                    kind: 'number',
                    value: target,
                    min: 45,
                    max: tmax,
                    step: 5,
                    unit: str('FIELD_TARGET_UNIT'),
                },
                {
                    id: 'hours',
                    label: str('FIELD_HOURS_LABEL'),
                    kind: 'number',
                    value: hours,
                    min: 1,
                    max: 24,
                    step: 1,
                    unit: str('FIELD_HOURS_UNIT'),
                },
            ],
        }
        if (u.cannotDryReason) {
            a.enabled = false
            a.reason = cut(u.cannotDryReason, ACTION_REASON)
        } else {
            check(a, cut(`dry ${u.name} start ${target}C ${hours}h`, ACTION_LINE), m)
        }
    }
    simple(list, m, 'dry_stop', str('ACTION_DRY_STOP'), 'normal', `dry ${u.name} stop`)
    return list.items
}

const DRYER_TONE = (st: number): 'heat' | 'cool' | 'fault' | 'off' =>
    st === DryState.HEATING || st === DryState.DEHUMIDIFYING
        ? 'heat'
        : st === DryState.COOLING
          ? 'cool'
          : st === DryState.ERROR
            ? 'fault'
            : 'off'

const VARIANT_NAMES = ['AMS', 'AMS 2 Pro', 'AMS HT', 'Lane MMU']
const variantName = (v: number): string => VARIANT_NAMES[v] ?? 'AMS'

function buildUnit(m: Model, unitIdx: number): ViewUnit {
    const u = m.units[unitIdx]

    // A missing source is unknown, never a possibly wrong value: an offline unit
    // shows "Offline" in place of its reading, and has no dryer pill.
    const env =
        u.connected && (u.hasHumidityPct || u.hasTemp)
            ? { text: cut(fmtEnv(u.hasHumidityPct, u.humidityPct, u.hasTemp, u.tempC), ENV_TEXT) }
            : null

    let dryer: ViewUnit['dryer'] = null
    if (u.canDry && u.connected) {
        const tone = DRYER_TONE(u.dryState)
        // Only a host that reported the supply can say it is missing: the AMS HT
        // has no monitor, so its adapter is unknown, not absent.
        let text = ''
        if (tone === 'heat') text = fmtDryerActive(u.dryTargetC, u.dryRemainingMin)
        else if (tone === 'cool') text = str('DRYER_COOLING')
        // A dryer fault is an item of the unit's alert, not a pill.
        dryer = { text: cut(text, DRYER_TEXT), tone, adapter_missing: u.hasPowerAdapter && !u.powerAdapter }
    }

    return {
        id: cut(u.name, UNIT_ID),
        title: cut(variantName(u.variant), TITLE),
        subtitle: cut(u.name, UNIT_ID),
        online: u.connected,
        status_text: u.connected ? '' : str('UNIT_OFFLINE'),
        env,
        dryer,
        alert: scanAlerts(m, unitIdx, -1),
        // serial and firmware: no real-host field carries these yet, so they are
        // left blank rather than invented.
        info: { serial: '', firmware: '', family: cut(variantName(u.variant), FAMILY) },
        actions: unitActions(m, unitIdx),
        bays: u.slots.map((_, bay) => buildTile(m, unitIdx, bay)),
    }
}

// ------------------------------------------------------------------ alerts

const SEVERITY: Severity[] = ['info', 'pause', 'stop']

const alertTitle = (sev: number): string =>
    sev === Sev.STOP ? str('ALERT_TITLE_STOP') : sev === Sev.PAUSE ? str('ALERT_TITLE_PAUSE') : str('ALERT_TITLE_INFO')

const faultWeight = (th: Toolhead): number => (th.errorCount > 0 ? th.errorCount : 1)

/** Whether the lane fault has any action to offer (without building them). */
function faultHasActions(m: Model, th: Toolhead): boolean {
    return th.errorAct.some((tok) => {
        if (tok === 'resume' || tok === 'clear_errors') return true
        if (tok === 'clear_fault') return th.errorUnit >= 0
        if (tok === 'retry_load') {
            return (
                (th.currentGroup >= 0 && th.currentGroup < m.groups.length) ||
                (th.errorUnit >= 0 && slotGroup(m, th.errorUnit, th.errorSlot) >= 0)
            )
        }
        return false
    })
}

/** The actions a lane fault's support tokens offer, in the host's order (the
 *  fault's first two tokens): retry, resume, clear errors, and the unit-scoped
 *  clear fault when the fault names a unit. */
function faultActions(m: Model, th: Toolhead): ViewAction[] {
    const list = new ActionList()
    for (const tok of th.errorAct) {
        if (tok === 'retry_load') {
            let group: string | null = null
            if (th.currentGroup >= 0 && th.currentGroup < m.groups.length) group = m.groups[th.currentGroup].name
            else if (th.errorUnit >= 0) {
                const gi = slotGroup(m, th.errorUnit, th.errorSlot)
                if (gi >= 0) group = m.groups[gi].name
            }
            if (group === null) continue
            simple(list, m, 'retry_load', str('ACTION_RETRY_LOAD'), 'primary', `fault retry_load ${group}`)
        } else if (tok === 'resume') {
            simple(list, m, 'resume', str('ACTION_RESUME'), 'primary', 'fault resume')
        } else if (tok === 'clear_errors') {
            simple(list, m, 'clear_errors', str('ACTION_CLEAR_ERRORS'), 'danger', 'fault clear_errors')
        } else if (tok === 'clear_fault' && th.errorUnit >= 0 && th.errorUnit < m.units.length) {
            const a = simple(
                list,
                m,
                'clear_fault',
                str('ACTION_CLEAR_FAULT'),
                'danger',
                `fault clear_fault ${m.units[th.errorUnit].name}`
            )
            if (a)
                confirm(
                    a,
                    str('CONFIRM_CLEAR_FAULT_TITLE'),
                    str('CONFIRM_CLEAR_FAULT_TEXT'),
                    str('CONFIRM_CLEAR_FAULT_OK')
                )
        }
    }
    return list.items
}

/** One lane fault as an alert item, with the actions its tokens offer. */
function faultItem(m: Model, th: Toolhead): ViewAlert {
    let unit: string | null = null
    let slot: string | null = null
    if (th.errorUnit >= 0 && th.errorUnit < m.units.length) {
        unit = cut(m.units[th.errorUnit].name, ALERT_UNIT)
        if (th.errorSlot >= 0) slot = cut(slotId(m, th.errorUnit, th.errorSlot), LABEL)
    }
    return {
        severity: SEVERITY[th.errorSeverity],
        code: cut(th.errorCode, ALERT_CODE),
        title: alertTitle(th.errorSeverity),
        text: cut(th.errorText || th.errorCode, ALERT_TEXT),
        unit,
        slot_id: slot,
        when_text: '',
        unread: true,
        actions: faultActions(m, th).slice(0, MAX_ACTIONS_PER_ALERT),
    }
}

/** An alert-history entry as an item (it carries no actions of its own). */
function historyItem(m: Model, a: Alert): ViewAlert {
    return {
        severity: SEVERITY[a.severity],
        code: '',
        title: alertTitle(a.severity),
        text: cut(a.text, ALERT_TEXT),
        unit: a.unit >= 0 && a.unit < m.units.length ? cut(m.units[a.unit].name, ALERT_UNIT) : null,
        slot_id: null,
        when_text: '',
        unread: a.unread,
        actions: [],
    }
}

/**
 * The alert group of one unit (`unitIdx` >= 0) or one toolhead: its count,
 * worst severity, tone and items, or null when it has none. Each alert lives on
 * exactly one level (UNIFIED_UI 4b), and a badge lists only what is not already
 * shown elsewhere, or carries actions (4c):
 * - the live lane fault: the unit it names, else its toolhead; not when it
 *   names a unit and a bay (that tile shows it, with the fault's actions), and
 *   not when it offers no action and is the message row's own text;
 * - the dryer fault and the missing power adapter: the unit;
 * - a toolhead's history entry (the job shortfall): unless the message row
 *   already shows the same text. Low filament (a unit's entry) is the tile's
 *   low ring, and a lane fault's own history entry is never shown again.
 */
function scanAlerts(m: Model, unitIdx: number, thIdx: number): ViewAlertGroup | null {
    const u = unitIdx >= 0 ? m.units[unitIdx] : undefined
    const th = u ? m.toolheads[u.toolhead] : m.toolheads[thIdx]
    let count = 0
    let sev: number = Sev.INFO
    const items: ViewAlert[] = []
    const add = (weight: number, severity: number, item: () => ViewAlert): void => {
        if (items.length < MAX_ALERTS_PER_GROUP) items.push(item())
        count += weight
        if (severity > sev) sev = severity
    }

    if (
        th &&
        th.hasError &&
        (unitIdx >= 0 ? th.errorUnit === unitIdx : th.errorUnit < 0) &&
        !(th.errorUnit >= 0 && th.errorSlot >= 0)
    ) {
        // No action: only listed when the message row shows something else.
        if (faultHasActions(m, th) || buildMessage(m, th).text !== (th.errorText || th.errorCode)) {
            add(faultWeight(th), th.errorSeverity, () => faultItem(m, th))
        }
    }
    if (u && u.canDry && u.dryState === DryState.ERROR) {
        add(1, Sev.PAUSE, () => ({
            severity: 'pause',
            code: '',
            title: alertTitle(Sev.PAUSE),
            text: cut(str('ALERT_DRYER'), ALERT_TEXT),
            unit: cut(u.name, ALERT_UNIT),
            slot_id: null,
            when_text: '',
            unread: false,
            actions: [],
        }))
    }
    if (u && u.canDry && u.hasPowerAdapter && !u.powerAdapter) {
        add(1, Sev.INFO, () => ({
            severity: 'info',
            code: '',
            title: alertTitle(Sev.INFO),
            text: cut(str('ALERT_ADAPTER'), ALERT_TEXT),
            unit: cut(u.name, ALERT_UNIT),
            slot_id: null,
            when_text: '',
            unread: false,
            actions: [],
        }))
    }
    for (const a of m.alerts) {
        if (a.laneFault) continue
        if (unitIdx >= 0 ? a.unit !== unitIdx : !(a.unit < 0 && a.toolhead === thIdx)) continue
        if (unitIdx >= 0) continue // low filament: the tile's ring says it
        if (th && buildMessage(m, th).text === cut(a.text, MESSAGE)) continue // the message row says it
        add(1, a.severity, () => historyItem(m, a))
    }

    if (count === 0) return null
    return {
        severity: SEVERITY[sev],
        count,
        // The two tones of the message row: red for a fault or a pause, else yellow.
        tone: sev >= Sev.PAUSE ? 'error' : 'info',
        items,
    }
}

// --------------------------------------------------------------- toolhead

/** The tool name of a runout's slot ("T0"); "?" when its bay is in no group. */
function runoutTool(m: Model, unit: number, slot: number): { name: string; gi: number } {
    const gi = unit >= 0 && slot >= 0 ? slotGroup(m, unit, slot) : -1
    return { name: gi >= 0 ? m.groups[gi].name : str('UNKNOWN_MARK'), gi }
}

/** The runout's one line, and whether it is an error: "T0 ran out; switching
 *  to oams1 Spool 2" (the target is the same tool) or "... to T1 (oams2 Spool 2)",
 *  "T0 ran out" while the target is not known, and "T0 ran out; no spare spool
 *  is left" (an error) when no target is named and the group has none. */
function runoutText(m: Model, th: Toolhead): { text: string; error: boolean } {
    const from = runoutTool(m, th.runoutFromUnit, th.runoutFromSlot)
    if (th.runoutFromUnit < 0 && th.runoutNote) return { text: th.runoutNote, error: false } // the host's own words
    if (th.runoutFromUnit < 0) return { text: str('STATUS_RUNOUT'), error: false }

    let to = ''
    if (th.runoutToUnit >= 0 && th.runoutToUnit < m.units.length && th.runoutToSlot >= 0) {
        const toTool = runoutTool(m, th.runoutToUnit, th.runoutToSlot)
        const toUnit = m.units[th.runoutToUnit].name
        to =
            toTool.gi >= 0 && toTool.gi === from.gi
                ? fmtUnitSpool(toUnit, th.runoutToSlot)
                : fmtToolSpool(toTool.name, toUnit, th.runoutToSlot)
    }
    // No target and nothing left to fall back to: say so plainly.
    if (!to && from.gi >= 0 && !groupNextSpare(m, from.gi)) {
        return { text: fmtRunoutNoSpare(from.name), error: true }
    }
    return { text: fmtRunout(from.name, to), error: false }
}

/** One message line: an error > a runout > a notice > the plain status. */
function buildMessage(m: Model, th: Toolhead): ViewToolhead['message'] {
    if (th.hasError) {
        return { text: cut(th.errorText || th.errorCode, MESSAGE), tone: 'error' }
    }
    if (th.runoutActive) {
        const r = runoutText(m, th)
        return { text: cut(r.text, MESSAGE), tone: r.error ? 'error' : 'info' }
    }
    if (th.currentGroup >= 0 && th.currentGroup < m.groups.length) {
        const tool = groupToolIndex(m.groups[th.currentGroup].name)
        const short = tool >= 0 ? toolShortfall(m, tool) : null
        if (short) return { text: cut(fmtShortfall(tool, short.need, short.have), MESSAGE), tone: 'info' }
    }
    // A tile in error that no lane fault covers: the tag says where, this row says
    // what (PRINCIPLES.md 10). A load or unload in progress keeps its step message.
    if (th.busy === Busy.NONE) {
        const thIdx = m.toolheads.indexOf(th)
        for (const un of m.units) {
            if (un.toolhead !== thIdx || !un.connected) continue
            for (let si = 0; si < un.slots.length; si++) {
                if (un.slots[si].state !== SlotState.ERROR) continue
                return {
                    text: cut(`${fmtUnitSpool(un.name, si)} ${str('STATUS_SPOOL_ERROR')}`, MESSAGE),
                    tone: 'error',
                }
            }
        }
    }
    const status =
        th.busy === Busy.LOAD
            ? 'STATUS_LOADING'
            : th.busy === Busy.UNLOAD
              ? 'STATUS_UNLOADING'
              : th.loaded
                ? 'STATUS_LOADED'
                : 'STATUS_NO_FILAMENT'
    return { text: cut(str(status), MESSAGE), tone: 'neutral' }
}

function toolheadActions(m: Model, th: Toolhead): ViewAction[] {
    const list = new ActionList()
    // Unload and Stop, always, in this order; the predicate dims the one that does not apply.
    const unload = simple(list, m, 'unload', str('ACTION_UNLOAD'), 'normal', `unload ${th.id}`)
    if (unload && m.printing)
        confirm(unload, str('CONFIRM_UNLOAD_TITLE'), str('CONFIRM_UNLOAD_TEXT'), str('CONFIRM_UNLOAD_OK'))
    const stop = simple(list, m, 'stop', str('ACTION_STOP'), 'normal', `stop ${th.id}`)
    if (stop) confirm(stop, str('CONFIRM_STOP_TITLE'), str('CONFIRM_STOP_TEXT'), str('CONFIRM_STOP_OK'))
    return list.items
}

function buildToolhead(m: Model, index: number): ViewToolhead {
    const th = m.toolheads[index]
    const activityKind: ViewToolhead['activity']['kind'] = th.hasError
        ? 'error'
        : th.runoutActive
          ? 'runout'
          : th.busy === Busy.LOAD
            ? 'loading'
            : th.busy === Busy.UNLOAD
              ? 'unloading'
              : 'idle'

    // The loaded tool: the hotend icon's overlay and tint only.
    let tool: ViewToolhead['tool'] = null
    if (th.loaded) {
        const gi = th.loadedUnit >= 0 ? slotGroup(m, th.loadedUnit, th.loadedSlot) : -1
        let color = 0
        if (th.loadedExt < 0 && th.loadedUnit >= 0 && th.loadedUnit < m.units.length) {
            const slot = m.units[th.loadedUnit].slots[th.loadedSlot]
            if (slot) color = slot.color
        }
        tool = {
            label: cut(gi >= 0 ? m.groups[gi].name : str('UNKNOWN_MARK'), LABEL),
            color: hex(color),
            ink: inkFor(color),
        }
    }

    const pressure: ViewToolhead['pressure'] =
        th.pressure >= 0
            ? {
                  value: cjsonNumber(th.pressure),
                  set_point: cjsonNumber(th.setPoint),
                  label: str('LABEL_PRESSURE'),
                  text: cut(fmtPressure(th.pressure), PRESSURE_TEXT),
                  scale: [cut(fmtScale(0), SCALE), cut(fmtScale(th.setPoint), SCALE), cut(fmtScale(1), SCALE)],
              }
            : null

    return {
        id: cut(th.id, ID),
        // Toolhead = extruder: the title is the extruder's display name, the FPS id
        // (as configured) sits under it.
        title: cut(th.extruder ? fmtExtruderTitle(th.extruder) : str('TOOLHEAD_DEFAULT_TITLE'), TITLE),
        subtitle: cut(th.id, SUBTITLE),
        tool,
        pressure,
        activity: {
            kind: activityKind,
            steps: th.steps.slice(0, 8).map((s) => cut(s, STEP_LABEL)),
            index: th.stepCurrent,
            failed: th.stepFailed,
        },
        message: buildMessage(m, th),
        alert: scanAlerts(m, -1, index),
        actions: toolheadActions(m, th),
        units: m.units.flatMap((u, i) => (u.toolhead === index ? [buildUnit(m, i)] : [])),
    }
}

// ------------------------------------------------------------------- panel

function buildSetting(m: Model, i: number): ViewSetting {
    const values = [
        m.settings.readTagOnInsertion,
        m.settings.readTagsAtStartup,
        m.settings.autoReloadOnRunout,
        m.settings.autoCreateSpoolmanSpools,
        m.settings.applyPaOnLoad,
    ]
    const key = SETTING_KEYS[i]
    const label = str(`SETTING_${i}_TITLE` as 'SETTING_0_TITLE')
    const note = str(`SETTING_${i}_NOTE` as 'SETTING_0_NOTE')
    // The last row is the language, not an on/off switch: a list of the languages
    // built in, each by its own name, with the current one selected. It sends
    // no action; the host calls setLanguage() with the code it picked.
    if (i === LANGUAGE_SETTING_ROW) {
        return {
            key: cut(key, SETTING_KEY),
            label,
            note,
            value: false,
            action_on: null,
            action_off: null,
            options: languages().map((l) => ({ code: l.code, label: l.label })),
            selected: LANG_CODES.indexOf(language() as (typeof LANG_CODES)[number]),
        }
    }
    const toggle = (id: string, text: string, line: string): ViewAction => {
        const a: ViewAction = {
            id,
            label: text,
            line: cut(line, ACTION_LINE),
            enabled: false,
            reason: '',
            style: 'normal',
            target: 'tile',
            confirm: null,
            form: null,
        }
        check(a, cut(line, ACTION_LINE), m)
        return a
    }
    return {
        key: cut(key, SETTING_KEY),
        label,
        note,
        value: values[i],
        action_on: toggle('setting_on', str('ACTION_ON'), `setting ${key} on`),
        action_off: toggle('setting_off', str('ACTION_OFF'), `setting ${key} off`),
        options: [],
        selected: 0,
    }
}

/** The whole panel tree (view_json()): what a renderer draws. */
export function buildView(m: Model): View {
    // The panel's own alerts: the history entries that belong to no unit and no
    // toolhead (and are not a lane fault's), for the host's bar.
    const panelAlerts: Alert[] = []
    for (const a of m.alerts) {
        if (panelAlerts.length >= MAX_ALERTS) break
        if (a.unit >= 0 || a.toolhead >= 0 || a.laneFault) continue
        panelAlerts.push(a)
    }

    let notice: View['notice'] = null
    if (m.units.length === 0) notice = { text: str('PANEL_NO_UNITS') }
    else if (!m.units.some((u) => u.connected)) notice = { text: str('PANEL_HOST_OFFLINE') }
    else if (!m.settings.known) notice = { text: str('PANEL_NOT_READY') }

    const pending: string[] = []
    for (let i = 0; i < m.units.length && pending.length < MAX_PENDING_SPOOLS; i++) {
        for (let j = 0; j < m.units[i].slots.length && pending.length < MAX_PENDING_SPOOLS; j++) {
            if (m.units[i].slots[j].pendingConfirmation) pending.push(cut(slotId(m, i, j), ID))
        }
    }

    const unassigned: number[] = []
    m.units.forEach((u, i) => {
        if (u.toolhead < 0 && unassigned.length < MAX_UNASSIGNED) unassigned.push(i)
    })

    return {
        toolheads: m.toolheads.map((_, i) => buildToolhead(m, i)),
        unassigned_units: unassigned.map((i) => buildUnit(m, i)),
        alerts: panelAlerts.map((a) => historyItem(m, a)),
        alert_count: panelAlerts.length,
        unread_count: panelAlerts.filter((a) => a.unread).length,
        notice,
        labels: {
            alerts: str('LABEL_ALERTS'),
            settings: str('LABEL_SETTINGS'),
            fault: str('LABEL_FAULT'),
            pressure: str('LABEL_PRESSURE'),
            no_alerts: str('LABEL_NO_ALERTS'),
            close: str('LABEL_CLOSE'),
            cancel: str('LABEL_CANCEL'),
            no_response: str('LABEL_NO_RESPONSE'),
        },
        spoolman: { online: m.spoolmanOnline, pending },
        settings: SETTING_KEYS.map((_, i) => buildSetting(m, i)),
    }
}

// f32 and fmtFixed are re-exported for the tests that build expected numbers.
export { f32, fmtFixed }
