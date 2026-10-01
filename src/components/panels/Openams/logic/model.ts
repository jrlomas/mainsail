// The model and the status mapping (src/model/mmu_model.[ch] and
// src/backend/status_map.c): Moonraker's openams_ui / oams_manager /
// component_status / spool_list / metadata objects become units, toolheads,
// groups and the alert history that the view builders read.
//
// This is a port, kept identical to the C core by the differential tests
// (test/diff.test.ts). Where the C has an odd edge (a fixed-size name buffer,
// a table that is full, a duplicate created by a name that no longer fits),
// this code keeps it on purpose, and says so.

import { cut, f32, i16, i8, toInt } from './cstr'

// ----------------------------------------------------------------- limits

export const MAX_UNITS = 6
export const MAX_SLOTS_PER_UNIT = 12
export const MAX_STEPS = 8
export const MAX_ALERTS = 8
export const MAX_GROUPS = 8
export const MAX_GROUP_MEMBERS = 8
export const MAX_SPOOLS = 16
export const MAX_VENDORS = 64 // MMU_MAX_VENDORS: Spoolman's own plus the curated brands
const VENDOR_LEN = 32
export const MAX_TOOLS = 8
export const MAX_TOOLHEADS = 4
/** The alert queue between a mapping call and the history (one apply). */
export const MAX_PENDING_ALERTS = 4

// C's fixed text buffers (sizeof, so the text keeps size - 1 bytes).
const UNIT_NAME = 8
const GROUP_NAME = 8
const LANE_ID = 16
const MATERIAL = 24
const STEP_TEXT = 48
const ALERT_TEXT = 48
const ERROR_CODE = 40
const ERROR_TEXT = 96
const ERROR_ACT = 16
const SPOOL_MATERIAL = 12
const SPOOL_VENDOR = 16
const REF_NAME = 16

// ------------------------------------------------------------------ enums
// Plain numbers, as in the C (Node strips types, so no `enum`).

export const SlotState = { EMPTY: 0, READY: 1, LOADED: 2, ERROR: 3 } as const
export const InfoSource = { UNKNOWN: 0, TAG: 1, MANUAL: 2 } as const
export const CalState = { UNKNOWN: 0, CONFIGURED: 1, CALIBRATING: 2, UNCALIBRATED: 3 } as const
export const DryState = { IDLE: 0, HEATING: 1, DEHUMIDIFYING: 2, COOLING: 3, ERROR: 4 } as const
export const Busy = { NONE: 0, LOAD: 1, UNLOAD: 2 } as const
export const Sev = { INFO: 0, PAUSE: 1, STOP: 2 } as const
export const Variant = { AMS: 0, AMS2_PRO: 1, AMS_HT: 2, LANE: 3 } as const

// ------------------------------------------------------------------ types

export interface Slot {
    color: number // 0xRRGGBB; meaningful only when colorKnown
    colorKnown: boolean // false: no color data (a neutral tile); a known 0x000000 is black filament
    material: string
    brand: string
    remainingPct: number // -1 = unknown
    infoSource: number
    state: number
    spoolId: number // Spoolman id, -1 = none
    pendingConfirmation: boolean
    remainingG: number // -1 = unknown
    initialG: number // `spool.initial_g`, the spool's own size in grams; -1 = unknown
    flowKX1000: number // `spool.flow_k`, the spool's own pressure advance; -1 = unknown, else PA * 1000
    calState: number
    positioning: boolean // the firmware is positioning a new spool
    globalId: number // `bays[i].id`, the host's own bay id; -1 = unknown
}

export interface Group {
    name: string
    members: { unit: number; slot: number }[]
}

export interface Unit {
    name: string
    variant: number
    title: string // the product name the host's family carries ("BoxTurtle"); '' = the variant's name
    connected: boolean
    hasHumidityPct: boolean
    hasTemp: boolean
    canDry: boolean
    rfid: boolean
    humidityPct: number
    tempC: number
    dryState: number
    dryTargetC: number
    dryRemainingMin: number
    powerAdapter: boolean
    hasPowerAdapter: boolean // a boolean `dryer.adapter` was sent (false: unknown, not "missing")
    cannotDryReason: string
    hostIdx: number // the unit's top-level `idx`; -1 = unknown
    lane: string // the unit's `lane.id`; "" = unknown
    toolhead: number // index into Model.toolheads; -1 = unknown
    slots: Slot[]
}

/** One FPS lane: what the loaded filament, the running operation, the active
 *  fault and the runout of that lane are. */
export interface Toolhead {
    id: string
    extruder: string
    loaded: boolean
    loadedUnit: number
    loadedSlot: number
    loadedExt: number
    busy: number
    busyUnit: number
    busySlot: number
    steps: string[]
    stepCurrent: number
    stepFailed: number
    currentGroup: number
    hasError: boolean
    errorSeverity: number
    errorCode: string
    errorText: string
    errorUnit: number
    errorSlot: number
    errorAct: string[] // the fault's first two `act` tokens, host order
    errorCount: number // the lane's fault count (`nf`)
    runoutActive: boolean
    runoutNote: string
    runoutFromUnit: number
    runoutFromSlot: number
    runoutToUnit: number
    runoutToSlot: number
    pressure: number // -1 = unknown (a float32 in the C)
    setPoint: number
}

/** What an alert's text is: the host's own words, or one of the two the core
 *  raises itself, kept as numbers and turned into a sentence when the view is
 *  built (mmu_alert_kind_t). */
export const AlertKind = { PLAIN: 0, LOW_FILAMENT: 1, SHORTFALL: 2 } as const

export interface Alert {
    text: string // AlertKind.PLAIN only
    kind: number
    arg: [number, number, number] // low filament: bay, grams; shortfall: tool, need, have
    severity: number
    unit: number // the unit it is about; -1 = none
    toolhead: number // the toolhead it is about; -1 = none
    laneFault: boolean // a lane fault's history entry (the live fault is on its toolhead)
    unread: boolean
}

export interface SpoolEntry {
    id: number
    material: string
    vendor: string
    color: number
    colorKnown: boolean // false: the filament has no color_hex
    remainingG: number // -1 = unknown
}

export interface Settings {
    known: boolean
    readTagOnInsertion: boolean
    readTagsAtStartup: boolean
    autoReloadOnRunout: boolean
    autoCreateSpoolmanSpools: boolean
    applyPaOnLoad: boolean
}

/** MMU_REFUSAL_LEN, the C's action_refusal / edit_refusal buffer. */
const REFUSAL_LEN = 192

/** What an action the display sent does, which is what its answer is about: a
 *  load or an unload the load screen waits on, or anything else. The C's
 *  mmu_action_kind_t. */
export const ActionKind = { OTHER: 0, LOAD: 1, UNLOAD: 2 } as const
export type ActionKind = (typeof ActionKind)[keyof typeof ActionKind]

/** The kind of the action line `line` (as the display wrote it: "load A2",
 *  "unload A2"), or ActionKind.OTHER for anything else. The C's
 *  mmu_action_kind_of(). */
export function actionKindOf(line: string | null | undefined): ActionKind {
    if (!line) return ActionKind.OTHER
    if (line.startsWith('load ')) return ActionKind.LOAD
    if (line.startsWith('unload ')) return ActionKind.UNLOAD
    return ActionKind.OTHER
}

/** The display just sent a load or an unload and the host has not reported it
 *  yet, so the load screen says it is starting rather than "Nothing is
 *  loading". The C's mmu_model_action_sent(). */
export function actionSent(m: Model, kind: ActionKind): void {
    if (kind === ActionKind.OTHER) return
    m.actionPendingKind = kind
    m.actionPendingSeq = (m.actionPendingSeq + 1) & 0xff
}

/** The host's answer to an action of that kind: `message` is its own words
 *  when it refused, "" when it took the action. The C's
 *  mmu_model_action_result(). */
export function actionResult(m: Model, kind: ActionKind, ok: boolean, message: string): void {
    m.actionRefusal = ok ? '' : cut(message ?? '', REFUSAL_LEN)
    m.actionRefusalKind = kind
    m.actionSeq = (m.actionSeq + 1) & 0xff
    // The host has spoken about this one, so it is no longer a load the load
    // screen is waiting on.
    if (!ok && kind === m.actionPendingKind) m.actionPendingKind = ActionKind.OTHER
}

export interface Model {
    units: Unit[]
    toolheads: Toolhead[]
    groups: Group[]
    spools: SpoolEntry[]
    settings: Settings
    spoolmanOnline: boolean
    /** The component can edit a bay's spool (`edit` in its status). */
    spoolmanEdit: boolean
    /** Spoolman's vendor names, as listed (sorted), each whole. */
    vendors: string[]

    /** The display's own unit: the C mirrors this unit's toolhead into legacy
     *  globals (loaded, busy, busyUnit) that the bare `stop` line still reads. */
    thisUnit: number
    /** The this-toolhead's own `loaded`, as the C's `m->loaded`. */
    loaded: boolean
    /** The last spool-edit answer, said once: the host's own words when it
     *  refused, "" when it took the edit. `editSeq` moves with every answer. */
    editRefusal: string
    editSeq: number
    /** The host's answer to an action the display sent (`ActionKind`):
     *  `actionRefusal` is its own words when it refused, "" when it took the
     *  action, and `actionSeq` moves with every answer so it is said once.
     *  `actionPendingKind` is a load or an unload the host has not reported
     *  yet, and `actionPendingSeq` moves with each new one. */
    actionRefusal: string
    actionRefusalKind: ActionKind
    actionSeq: number
    actionPendingKind: ActionKind
    actionPendingSeq: number
    busy: number
    busyUnit: number
    /** Always false on the web: only the display's demo scenarios set it. */
    printing: boolean
    /** Alert history, newest first, at most MAX_ALERTS. */
    alerts: Alert[]
    /** Alerts queued by a mapping call, drained into the history by drain(). */
    pending: Alert[]
    /** Per-tool filament need of the job, in grams (0 = none). */
    jobNeedG: number[]
    printFilename: string
}

// ------------------------------------------------------------ constructors

function slotClear(): Slot {
    return {
        color: 0,
        colorKnown: false,
        material: '',
        brand: '',
        remainingPct: -1,
        infoSource: InfoSource.UNKNOWN,
        state: SlotState.EMPTY,
        spoolId: -1,
        pendingConfirmation: false,
        remainingG: -1,
        initialG: -1,
        flowKX1000: -1,
        calState: CalState.UNKNOWN,
        positioning: false,
        globalId: -1,
    }
}

function settingsDefaults(): Settings {
    return {
        known: false,
        readTagOnInsertion: true,
        readTagsAtStartup: true,
        autoReloadOnRunout: true,
        autoCreateSpoolmanSpools: true,
        applyPaOnLoad: false,
    }
}

/** A model with nothing known (status_map_reset()). */
export function newModel(): Model {
    return {
        units: [],
        toolheads: [],
        groups: [],
        spools: [],
        settings: settingsDefaults(),
        spoolmanOnline: false,
        spoolmanEdit: false,
        vendors: [],
        thisUnit: 0,
        loaded: false,
        editRefusal: '',
        editSeq: 0,
        actionRefusal: '',
        actionRefusalKind: ActionKind.OTHER,
        actionSeq: 0,
        actionPendingKind: ActionKind.OTHER,
        actionPendingSeq: 0,
        busy: Busy.NONE,
        busyUnit: -1,
        printing: false,
        alerts: [],
        pending: [],
        jobNeedG: new Array<number>(MAX_TOOLS).fill(0),
        printFilename: '',
    }
}

// ---------------------------------------------------------------- lookups

/** The index of the unit named `name`; -1 when none. The stored name is the
 *  8-byte cut one, so a longer name never matches and is created again. */
export function unitIndex(m: Model, name: string | null): number {
    if (name === null) return -1
    return m.units.findIndex((u) => u.name === name)
}

/** The unit `name`, created when it is new, grown to at least `minSlots`
 *  bays. A unit first seen through its Spoolman links starts on the AMS
 *  four-slot defaults until a projection describes it. */
function unitGetOrCreate(m: Model, name: string, minSlots: number): Unit | null {
    let u = m.units[unitIndex(m, name)]
    if (!u) {
        if (m.units.length >= MAX_UNITS) return null
        u = {
            name: cut(name, UNIT_NAME),
            variant: Variant.AMS,
            title: '',
            connected: true,
            hasHumidityPct: false,
            hasTemp: false,
            canDry: false,
            rfid: false,
            humidityPct: -1,
            tempC: -100,
            dryState: DryState.IDLE,
            dryTargetC: 0,
            dryRemainingMin: 0,
            powerAdapter: false,
            hasPowerAdapter: false,
            cannotDryReason: '',
            hostIdx: -1,
            lane: '',
            toolhead: -1,
            slots: [],
        }
        m.units.push(u)
    }
    const want = Math.min(minSlots, MAX_SLOTS_PER_UNIT)
    while (u.slots.length < want) u.slots.push(slotClear())
    return u
}

/** The toolhead (FPS lane) `id`, created when it is new (C2 6.5). */
function toolheadGetOrCreate(m: Model, id: string | null): Toolhead | null {
    const want = id ?? ''
    const found = m.toolheads.find((t) => t.id === want)
    if (found) return found
    if (m.toolheads.length >= MAX_TOOLHEADS) return null
    const th: Toolhead = {
        id: cut(want, LANE_ID),
        extruder: '',
        loaded: false,
        loadedUnit: -1,
        loadedSlot: -1,
        loadedExt: -1,
        busy: Busy.NONE,
        busyUnit: -1,
        busySlot: -1,
        steps: [],
        stepCurrent: -1,
        stepFailed: -1,
        currentGroup: -1,
        hasError: false,
        errorSeverity: Sev.INFO,
        errorCode: '',
        errorText: '',
        errorUnit: -1,
        errorSlot: -1,
        errorAct: [],
        errorCount: 0,
        runoutActive: false,
        runoutNote: '',
        runoutFromUnit: -1,
        runoutFromSlot: -1,
        runoutToUnit: -1,
        runoutToSlot: -1,
        pressure: -1,
        setPoint: -1,
    }
    m.toolheads.push(th)
    return th
}

/** "<unit>-<bay>": the name up to the last dash and the bay after it. */
function refSplit(ref: string | null): { name: string; slot: number } | null {
    if (ref === null) return null
    const dash = ref.lastIndexOf('-')
    if (dash < 0 || dash === ref.length - 1) return null
    const digits = ref.slice(dash + 1)
    if (!/^[0-9]+$/.test(digits)) return null
    // char name[16] in the C: a longer unit name is not a reference.
    if (dash === 0 || dash >= REF_NAME) return null
    return { name: ref.slice(0, dash), slot: toInt(Number(digits)) }
}

/** The unit index of `ref` (-1 when no unit has that name) and its bay. The
 *  bay is filled in either way: a lane aimed at a unit that is not being
 *  displayed should still move the lane state. */
function refResolve(m: Model, ref: string | null): { unit: number; slot: number } {
    const split = refSplit(ref)
    if (!split) return { unit: -1, slot: -1 }
    return { unit: unitIndex(m, split.name), slot: split.slot }
}

// ---------------------------------------------------------------- groups

/** The group holding (unit, slot); -1 when none (mmu_slot_group_in()). */
export function slotGroup(m: Model, unit: number, slot: number): number {
    return m.groups.findIndex((g) => g.members.some((mem) => mem.unit === unit && mem.slot === slot))
}

function groupIndex(m: Model, name: string | null): number {
    if (name === null) return -1
    return m.groups.findIndex((g) => g.name === name)
}

function groupGetOrCreate(m: Model, name: string): number {
    const i = m.groups.findIndex((g) => g.name === name)
    if (i >= 0) return i
    if (m.groups.length >= MAX_GROUPS) return -1
    m.groups.push({ name: cut(name, GROUP_NAME), members: [] })
    return m.groups.length - 1
}

/** Add (unit, slot) to a group unless it is full or already in one, so a
 *  projection replayed twice cannot duplicate or reorder a member. */
function groupAddMember(m: Model, group: number, unit: number, slot: number): void {
    const g = m.groups[group]
    if (g.members.length >= MAX_GROUP_MEMBERS) return
    if (slotGroup(m, unit, slot) >= 0) return
    g.members.push({ unit: i8(unit), slot: i8(slot) })
}

/**
 * The next usable spare of a group: the first ready member with filament in
 * order, or null. A group with one member has no spare (docs/GROUPS.md).
 */
export function groupNextSpare(m: Model, group: number): { unit: number; slot: number } | null {
    if (group < 0 || group >= m.groups.length) return null
    const g = m.groups[group]
    if (g.members.length <= 1) return null
    for (const mem of g.members) {
        const slot = m.units[mem.unit]?.slots[mem.slot]
        if (!slot) continue
        // READY already excludes empty/loaded/error; a slot that ran dry but was
        // not physically removed stays READY at 0%, which is no usable spare.
        if (slot.state !== SlotState.READY || slot.remainingPct === 0) continue
        return { unit: mem.unit, slot: mem.slot }
    }
    return null
}

/** The job shortfall of tool `toolIndex`, or null: the group "T<n>", summed
 *  remaining grams over the members that report one, ignoring a group whose
 *  members are all unknown. */
export function toolShortfall(m: Model, toolIndex: number): { need: number; have: number } | null {
    if (toolIndex < 0 || toolIndex >= MAX_TOOLS) return null
    const need = m.jobNeedG[toolIndex]
    if (need <= 0) return null
    const gi = m.groups.findIndex((g) => g.name === `T${toolIndex}`)
    if (gi < 0) return null
    let have = 0
    let allUnknown = true
    for (const mem of m.groups[gi].members) {
        const slot = m.units[mem.unit]?.slots[mem.slot]
        if (!slot || slot.remainingG < 0) continue
        have += slot.remainingG
        allUnknown = false
    }
    if (allUnknown || have >= need) return null
    return { need, have }
}

/** "<unit name><bay + 1>": the display id of a bay ("oams11"). */
export function slotId(m: Model, unit: number, slot: number): string {
    const name = unit < 0 || unit >= m.units.length ? '?' : m.units[unit].name
    return `${name}${slot + 1}`
}

// ----------------------------------------------------------------- alerts

/** Push an alert into a history, newest first; a full table drops the oldest. */
function pushAlert(m: Model, a: Alert): void {
    m.alerts.unshift(a)
    if (m.alerts.length > MAX_ALERTS) m.alerts.length = MAX_ALERTS
}

/** Queue an alert for the next drain (the C's alert_pending). A full queue
 *  drops the new alert, except a lane fault, which drops the oldest instead. */
function queueAlert(
    m: Model,
    text: string,
    severity: number,
    unit: number,
    toolhead: number,
    laneFault: boolean
): void {
    if (m.pending.length >= MAX_PENDING_ALERTS && laneFault) m.pending.shift()
    if (m.pending.length >= MAX_PENDING_ALERTS) return
    m.pending.push({
        text: cut(text, ALERT_TEXT),
        kind: AlertKind.PLAIN,
        arg: [0, 0, 0],
        severity,
        unit: i8(unit),
        toolhead: i8(toolhead),
        laneFault,
        unread: true,
    })
}

/** Queue a composed alert (mmu_model_push_alert_pending_tpl): a silent drop
 *  when the queue is full, and the numbers kept as the C's int16 fields. */
function queueComposed(
    m: Model,
    kind: number,
    severity: number,
    unit: number,
    toolhead: number,
    a0: number,
    a1: number,
    a2: number
): void {
    if (m.pending.length >= MAX_PENDING_ALERTS) return
    m.pending.push({
        text: '',
        kind,
        arg: [i16(a0), i16(a1), i16(a2)],
        severity,
        unit: i8(unit),
        toolhead: i8(toolhead),
        laneFault: false,
        unread: true,
    })
}

/** Move the queued alerts into the history in arrival order
 *  (mmu_model_merge_live() with the model as its own live copy), then refresh
 *  the legacy mirror. */
export function drain(m: Model): void {
    const queued = m.pending.splice(0, MAX_PENDING_ALERTS)
    for (const a of queued) pushAlert(m, a)
    refreshThis(m)
}

/** Copy the display's own toolhead into the legacy busy fields. */
export function refreshThis(m: Model): void {
    const unit = m.units[m.thisUnit]
    const th = unit && unit.toolhead >= 0 ? m.toolheads[unit.toolhead] : undefined
    if (!th) return
    m.loaded = th.loaded
    m.busy = th.busy
    m.busyUnit = th.busyUnit
}

// ---------------------------------------------------------- JSON accessors

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The string value of `key`, or null when it is absent or not a string. */
function jstring(obj: unknown, key: string): string | null {
    if (!isObject(obj)) return null
    const v = obj[key]
    return typeof v === 'string' ? v : null
}

/** The number value of `key` as a C int, or null when it is not a number. */
function jint(obj: unknown, key: string): number | null {
    if (!isObject(obj)) return null
    const v = obj[key]
    return typeof v === 'number' ? toInt(v) : null
}

/** The number value of `key` as whole thousandths, the unit the edit form
 *  works in (jmilli in C, which rounds the fourth decimal the same way), or
 *  null when it is not a number. The value itself is not first cut to an int,
 *  which would take every advance below 1.000 to nothing. */
function jmilli(obj: unknown, key: string): number | null {
    if (!isObject(obj)) return null
    const v = obj[key]
    if (typeof v !== 'number') return null
    const m = v * 1000
    return toInt(m >= 0 ? m + 0.5 : m - 0.5)
}

const jfield = (obj: unknown, key: string): unknown => (isObject(obj) ? obj[key] : undefined)

/** Whether the string array `arr` holds `want`. */
function arrayHas(arr: unknown, want: string): boolean {
    return Array.isArray(arr) && arr.some((v) => v === want)
}

// ----------------------------------------------------------------- codes

/** `bays[i].s`: empty, ready, loaded, error, or positioning (a positioning bay
 *  reads as ready with the flag set). */
function mapBayState(code: string | null): { state: number; positioning: boolean } {
    if (code === null || code === '') return { state: SlotState.EMPTY, positioning: false }
    switch (code[0]) {
        case 'r':
            return { state: SlotState.READY, positioning: false }
        case 'l':
            return { state: SlotState.LOADED, positioning: false }
        case 'x':
            return { state: SlotState.ERROR, positioning: false }
        case 'p':
            return { state: SlotState.READY, positioning: true }
        default:
            return { state: SlotState.EMPTY, positioning: false } // 'e' and anything newer
    }
}

function mapCal(code: string): number {
    switch (code[0]) {
        case 'c':
            return CalState.CONFIGURED
        case 'u':
            return CalState.UNCALIBRATED
        case 'p':
            return CalState.CALIBRATING
        default:
            return CalState.UNKNOWN
    }
}

function mapLinkSource(src: string | null): number {
    if (src === 't') return InfoSource.TAG
    if (src === 'm') return InfoSource.MANUAL
    return InfoSource.UNKNOWN
}

/** The C2 5.9 dryer state_name vocabulary. */
function mapDryState(name: string | null): number {
    switch (name) {
        case 'preheat':
            return DryState.HEATING
        case 'hold':
        case 'timed_dry':
            return DryState.DEHUMIDIFYING
        case 'cooldown':
            return DryState.COOLING
        case 'fault':
            return DryState.ERROR
        default:
            return DryState.IDLE // "off", and anything newer
    }
}

function mapSeverity(sev: string | null): number {
    if (sev === 'stop') return Sev.STOP
    if (sev === 'pause') return Sev.PAUSE
    return Sev.INFO
}

/** "0A2989" -> 0x0A2989; null for an empty string or anything that is not up to
 *  six hex digits: that is a color nobody told us, not black. */
function mapHexColor(hex: string | null): number | null {
    if (!hex) return null
    let v = 0
    for (let n = 0; n < hex.length; n++) {
        if (!/^[0-9a-fA-F]$/.test(hex[n])) return null
        if (n >= 6) return null
        v = (v << 4) | parseInt(hex[n], 16)
    }
    return v
}

// The klipper-mmu families OpenAMS now sends, and the product name each one
// carries. They are proper nouns, not sentences: they are never translated and
// never reach the string tables. A klipper-mmu family only names the unit, so
// the variant stays whatever it is (AMS by default) and every other behavior -
// the tile kind, the dryer limits - is the variant's.
const FAMILY_TITLES = new Map<string, string>([
    ['boxturtle', 'BoxTurtle'],
    ['nightowl', 'NightOwl'],
    ['emu', 'EMU'],
    ['kms', 'KMS'],
    ['qidi_box', 'QIDI Box'],
    ['angry_beaver', 'Angry Beaver'],
    ['3ms', '3MS'],
    ['quattrobox_1_0', 'QuattroBox 1.0'],
    ['quattrobox_1_1', 'QuattroBox 1.1'],
    ['quattrobox_2', 'QuattroBox 2'],
    ['custom', 'Custom MMU'],
    ['ercf_1_1', 'ERCF 1.1'],
    ['ercf_2_0', 'ERCF 2.0'],
    ['ercf_3_0', 'ERCF 3.0'],
    ['tradrack', 'Tradrack'],
    ['3d_chameleon', '3D Chameleon'],
    ['htlf', 'HTLF'],
    ['mmx6', 'MMX6'],
    ['mmx', 'MMX'],
    ['low_rider', 'Low Rider'],
    ['pico_mmu', 'Pico MMU'],
    ['btt_vivid', 'BTT ViViD'],
    ['claymore', 'Claymore'],
])

function mapFamily(u: Unit, family: string | null): void {
    // A projection is authoritative about the family's name: one that names no
    // product (an AMS family, or one this build does not know) leaves no title
    // behind, so the unit shows its variant's name as it did before.
    u.title = (family !== null ? FAMILY_TITLES.get(family) : undefined) ?? ''
    if (family === null) return

    switch (family) {
        case 'ams1':
            u.variant = Variant.AMS
            break
        case 'ams2':
            u.variant = Variant.AMS2_PRO
            break
        case 'ams_ht':
            u.variant = Variant.AMS_HT
            break
        case 'inline_follower':
            u.variant = Variant.LANE
            break
        default:
            break
    }
}

// --------------------------------------------------------------- one unit

function mapBays(u: Unit, bays: unknown[]): void {
    for (let i = 0; i < bays.length && i < u.slots.length; i++) {
        const bay = bays[i]
        const s = u.slots[i]
        if (!isObject(bay)) continue

        const st = mapBayState(jstring(bay, 's'))
        s.state = st.state
        s.positioning = st.positioning
        const cal = jstring(bay, 'cal')
        if (cal !== null) s.calState = mapCal(cal)

        // `id` is the host's own bay id (what OPENAMS_LOAD wants as SLOT), not the
        // bay index that `bays` is ordered by.
        const id = jint(bay, 'id')
        s.globalId = id === null ? -1 : i16(id)

        // `sp` is the link only; null means "no spool linked here".
        const sp = bay.sp
        if (isObject(sp)) {
            const spoolId = jint(sp, 'id')
            if (spoolId !== null) s.spoolId = spoolId
            s.infoSource = mapLinkSource(jstring(sp, 'src'))
        } else {
            s.spoolId = -1
            s.infoSource = InfoSource.UNKNOWN
        }
    }
}

function mapEnv(u: Unit, env: unknown): void {
    if (isObject(env)) {
        const rh = jint(env, 'rh')
        u.hasHumidityPct = rh !== null
        u.humidityPct = rh !== null ? i16(rh) : -1
        const t = jint(env, 't')
        u.hasTemp = t !== null
        u.tempC = t !== null ? i16(t) : -100
    } else if (env !== undefined) {
        // explicit null (or any non-object): no environment sensor
        u.hasHumidityPct = false
        u.humidityPct = -1
        u.hasTemp = false
        u.tempC = -100
    }
}

function mapDryer(u: Unit, dryer: unknown): void {
    if (isObject(dryer)) {
        u.dryState = mapDryState(jstring(dryer, 'state'))
        u.canDry = true
        const target = jint(dryer, 'target')
        u.dryTargetC = target !== null ? i16(target) : 0
        const min = jint(dryer, 'min')
        u.dryRemainingMin = min !== null ? i16(min) : 0
        // A boolean only: null or absent (the AMS HT has no supply monitor) is
        // "unknown", which the view must not show as "adapter missing".
        const adapter = dryer.adapter
        u.hasPowerAdapter = typeof adapter === 'boolean'
        if (u.hasPowerAdapter) u.powerAdapter = adapter === true
    } else if (dryer !== undefined) {
        // explicit null (or any non-object): this unit has no dryer
        u.dryState = DryState.IDLE
        u.dryTargetC = 0
        u.dryRemainingMin = 0
        u.canDry = false
        u.powerAdapter = false
        u.hasPowerAdapter = false
    }
}

/** `lane.stage` is null or [plan, index, failed]: the ordered step names, the
 *  running step or null, and the name of the step that failed or null. */
function mapStage(th: Toolhead, stage: unknown): void {
    th.steps = []
    th.stepCurrent = -1
    th.stepFailed = -1
    if (!Array.isArray(stage) || stage.length < 3) return
    const [plan, index, failed] = stage as unknown[]
    if (!Array.isArray(plan)) return

    const count = Math.min(plan.length, MAX_STEPS)
    for (let i = 0; i < count; i++) {
        const step = plan[i]
        // A step that is not a string leaves its (zeroed) slot empty.
        th.steps.push(typeof step === 'string' ? cut(step, STEP_TEXT) : '') // the host's stage name; the view labels it
    }
    if (typeof index === 'number') th.stepCurrent = i8(index)

    // `failed` names a plan entry: its position is the failed step.
    if (typeof failed === 'string') {
        for (let i = 0; i < count; i++) {
            if (plan[i] === failed) {
                th.stepFailed = i
                break
            }
        }
    }
}

function mapRunout(m: Model, th: Toolhead, lane: unknown): void {
    const runout = jstring(lane, 'runout')
    th.runoutActive = runout !== null && runout !== 'idle'

    const from = refResolve(m, jstring(lane, 'from'))
    th.runoutFromUnit = from.unit
    th.runoutFromSlot = from.unit >= 0 && from.slot >= 0 ? i8(from.slot) : -1

    const to = refResolve(m, jstring(lane, 'to'))
    th.runoutToUnit = to.unit
    th.runoutToSlot = to.unit >= 0 && to.slot >= 0 ? i8(to.slot) : -1
}

/** Map `lane`; returns whether the lane published `ms` (motion settled), so
 *  the caller leaves that alone. */
function mapLane(m: Model, th: Toolhead, lane: unknown): boolean {
    if (!isObject(lane)) return false

    // `lane.ext` names the lane's extruder; "" when absent.
    const ext = jstring(lane, 'ext')
    if (ext !== null) th.extruder = cut(ext, 16)

    const op = jstring(lane, 'op')
    const bay = refResolve(m, jstring(lane, 'bay'))

    // `lane.group` names the group loaded in the toolhead; it is only published
    // while something is loaded. The loaded bay's own membership is the fallback.
    const gi = groupIndex(m, jstring(lane, 'group'))

    if (op === 'LOADED') {
        th.busy = Busy.NONE
        th.busyUnit = -1
        th.busySlot = -1
        if (bay.unit >= 0 && bay.slot >= 0 && bay.slot < m.units[bay.unit].slots.length) {
            th.loaded = true
            th.loadedUnit = bay.unit
            th.loadedSlot = i8(bay.slot)
            th.loadedExt = -1
            th.currentGroup = gi >= 0 ? gi : slotGroup(m, bay.unit, bay.slot)
        } else {
            clearLoaded(th)
        }
    } else {
        th.busy = op === 'LOADING' ? Busy.LOAD : op === 'UNLOADING' ? Busy.UNLOAD : Busy.NONE
        th.busyUnit = th.busy !== Busy.NONE && bay.unit >= 0 ? bay.unit : -1
        th.busySlot = th.busy !== Busy.NONE && th.busyUnit >= 0 && bay.slot >= 0 ? i8(bay.slot) : -1
        clearLoaded(th)

        // A calibration is not a load in the model's terms; the bay's own cal
        // code is what the UI shows.
        if (op === 'CALIBRATING' && bay.unit >= 0 && bay.slot >= 0 && bay.slot < m.units[bay.unit].slots.length) {
            m.units[bay.unit].slots[bay.slot].calState = CalState.CALIBRATING
        }
    }

    mapStage(th, lane.stage)
    mapRunout(m, th, lane)
    return typeof lane.ms === 'boolean'
}

function clearLoaded(th: Toolhead): void {
    th.loaded = false
    th.loadedUnit = -1
    th.loadedSlot = -1
    th.loadedExt = -1
    th.currentGroup = -1
}

/** Map `fault` and its count `nf`. A fault whose code differs from the one
 *  already held is new and joins the alert history; the same fault repeated in
 *  a later status does not. */
function mapFault(m: Model, thIndex: number, th: Toolhead, fault: unknown, nf: number): void {
    if (isObject(fault)) {
        const code = jstring(fault, 'code')
        const text = jstring(fault, 'text')
        // The held code is the cut one and `code` is the raw one, as in the C.
        const fresh = !(th.hasError && code !== null && th.errorCode === code)

        th.hasError = true
        th.errorSeverity = mapSeverity(jstring(fault, 'sev'))
        if (code !== null) th.errorCode = cut(code, ERROR_CODE)
        if (text !== null) th.errorText = cut(text, ERROR_TEXT)
        th.errorUnit = i8(unitIndex(m, jstring(fault, 'unit')))
        const bay = jint(fault, 'bay')
        th.errorSlot = bay !== null ? i8(bay) : -1

        // The fault's first two support-action tokens, in the host's order.
        th.errorAct = []
        if (Array.isArray(fault.act)) {
            for (const tok of fault.act) {
                if (th.errorAct.length >= 2) break
                if (typeof tok === 'string') th.errorAct.push(cut(tok, ERROR_ACT))
            }
        }
        th.errorCount = nf > 0 ? Math.min(nf, 255) : 0

        if (fresh) {
            queueAlert(m, text ?? code ?? '', th.errorSeverity, th.errorUnit, thIndex, true)
        }
    } else if (fault !== undefined) {
        // explicit null (or any non-object): no active fault on this lane
        th.hasError = false
        th.errorSeverity = Sev.INFO
        th.errorCode = ''
        th.errorText = ''
        th.errorUnit = -1
        th.errorSlot = -1
        th.errorAct = []
        th.errorCount = 0
    }
}

/** Map one `openams_ui` projection (C2 6.5). Returns false when it is not one. */
export function applyOpenamsUi(m: Model, obj: unknown): boolean {
    if (!isObject(obj)) return false
    const unitName = jstring(obj, 'unit')
    const bays = obj.bays
    if (!unitName || !Array.isArray(bays)) return false

    let nbay = bays.length
    const u = unitGetOrCreate(m, unitName, nbay)
    if (!u) return false

    // `bays` is authoritative for the bay count.
    if (nbay > MAX_SLOTS_PER_UNIT) nbay = MAX_SLOTS_PER_UNIT
    if (nbay > 0) u.slots.length = nbay

    mapFamily(u, jstring(obj, 'family'))

    // The host identifiers the action mapper needs: the unit's own `idx` (OAMS=)
    // and its FPS lane id (FPS=). Absent means unknown, so both are overwritten.
    const idx = jint(obj, 'idx')
    u.hostIdx = idx !== null ? i16(idx) : -1
    u.lane = cut(jstring(jfield(obj, 'lane'), 'id') ?? '', LANE_ID)

    // The toolhead this unit's lane belongs to, looked up or created by the
    // stored lane id, so several units on one FPS lane share a toolhead.
    const th = toolheadGetOrCreate(m, u.lane)
    const thIndex = th ? m.toolheads.indexOf(th) : -1
    u.toolhead = thIndex

    if (typeof obj.online === 'boolean') u.connected = obj.online

    mapEnv(u, obj.env)
    mapDryer(u, obj.dryer)
    u.rfid = arrayHas(obj.act, 'rfid_scan')
    mapBays(u, bays)

    // Groups before the lane: a LOADED lane resolves its current group by
    // looking the bay up in the groups that were just built.
    mapGroups(m, obj.groups)
    if (th) {
        mapLane(m, th, obj.lane)
        const nf = jint(obj, 'nf') ?? 0 // the lane's fault count, a sibling of `fault`
        mapFault(m, thIndex, th, obj.fault, nf)
    }

    refreshThis(m)
    return true
}

function mapGroups(m: Model, groups: unknown): void {
    if (!Array.isArray(groups)) return
    for (const g of groups) {
        if (!isObject(g)) continue
        const name = jstring(g, 'n')
        if (!name) continue
        const gi = groupGetOrCreate(m, name)
        if (gi < 0) continue
        if (!Array.isArray(g.b)) continue
        for (const ref of g.b) {
            if (typeof ref !== 'string') continue
            const r = refResolve(m, ref)
            // A member on a unit this model does not carry is skipped: the group
            // keeps the members it can show, in order.
            if (r.unit < 0) continue
            if (r.slot < 0 || r.slot >= m.units[r.unit].slots.length) continue
            groupAddMember(m, gi, r.unit, r.slot)
        }
    }
}

// ------------------------------------------------------ other objects

/** `component_status` (Spoolman's view of the bays). */
export function applyComponentStatus(m: Model, obj: unknown): boolean {
    if (!isObject(obj)) return false
    const bays = obj.bays
    if (!isObject(bays)) return false

    if (typeof obj.spoolman_online === 'boolean') m.spoolmanOnline = obj.spoolman_online
    // a component that predates the edit endpoint sends no `edit`: it can't
    m.spoolmanEdit = obj.edit === true

    for (const [key, bay] of Object.entries(bays)) {
        if (!isObject(bay)) continue
        const split = refSplit(key)
        if (!split) continue
        if (split.slot < 0 || split.slot >= MAX_SLOTS_PER_UNIT) continue

        // A unit named only by its Spoolman links still shows up, sized to the
        // highest bay the status mentions.
        const u = unitGetOrCreate(m, split.name, split.slot + 1)
        if (!u || split.slot >= u.slots.length) continue
        const s = u.slots[split.slot]

        if (typeof bay.pending_confirmation === 'boolean') s.pendingConfirmation = bay.pending_confirmation

        const spool = bay.spool
        if (isObject(spool)) {
            const material = jstring(spool, 'material')
            const vendor = jstring(spool, 'vendor')
            const hex = jstring(spool, 'color_hex')
            if (material !== null) s.material = cut(material, MATERIAL)
            if (vendor !== null) s.brand = cut(vendor, MATERIAL)
            // a summary with no (or an unreadable) color_hex has no color
            const color = mapHexColor(hex)
            s.color = color ?? 0
            s.colorKnown = color !== null
            const grams = jint(spool, 'remaining_g')
            if (grams !== null) s.remainingG = i16(grams)
            // the spool's own size and pressure advance, when the host sends them; a
            // missing, null or non-number one is unknown, as it is for every other
            // field of the summary
            // only values the contract allows (a positive weight that fits the
            // model, a pressure advance of 0-2): anything else stays unknown rather
            // than wrapping into a wrong default (status_map.c)
            s.initialG = -1
            s.flowKX1000 = -1
            const initial = jint(spool, 'initial_g')
            if (initial !== null && initial >= 1 && initial <= 32767) s.initialG = initial
            const rawFlow = isObject(spool) ? spool['flow_k'] : undefined
            const flow = jmilli(spool, 'flow_k')
            if (flow !== null && typeof rawFlow === 'number' && rawFlow >= 0 && rawFlow <= 2) s.flowKX1000 = flow
            const pct = jint(spool, 'remaining_pct')
            if (pct !== null) {
                const old = s.remainingPct
                s.remainingPct = i16(pct)
                // Push a low-filament alert the first time a slot crosses below 15%:
                // from >= 15 or from unknown. It is about this unit's bay.
                if (s.remainingPct >= 0 && s.remainingPct < 15 && (old < 0 || old >= 15)) {
                    queueComposed(
                        m,
                        AlertKind.LOW_FILAMENT,
                        Sev.INFO,
                        m.units.indexOf(u),
                        -1,
                        split.slot,
                        s.remainingG,
                        0
                    )
                }
            }
        } else {
            // No spool linked here any more: the bay's own numbers go with it, so
            // the tile reads like one that never held a spool instead of keeping the
            // removed spool's color and percentage.
            s.color = 0
            s.colorKnown = false
            s.material = ''
            s.brand = ''
            s.remainingPct = -1
            s.remainingG = -1
            s.initialG = -1
            s.flowKX1000 = -1
        }
    }
    refreshThis(m)
    return true
}

/** The host's five settings (C2 4.9). */
export function applySettings(m: Model, obj: unknown): boolean {
    if (!isObject(obj)) return false
    const set = (key: string, apply: (v: boolean) => void): void => {
        if (typeof obj[key] === 'boolean') apply(obj[key] as boolean)
    }
    set('read_tag_on_insertion', (v) => {
        m.settings.readTagOnInsertion = v
    })
    set('read_tags_at_startup', (v) => {
        m.settings.readTagsAtStartup = v
    })
    set('auto_reload_on_runout', (v) => {
        m.settings.autoReloadOnRunout = v
    })
    set('auto_create_spoolman_spools', (v) => {
        m.settings.autoCreateSpoolmanSpools = v
    })
    set('apply_pa_on_load', (v) => {
        m.settings.applyPaOnLoad = v
    })
    m.settings.known = true
    refreshThis(m)
    return true
}

/** `oams_manager.lanes_by_fps`: pressure and set point per lane (the fast
 *  values the openams_ui projection keeps out). */
export function applyLanes(m: Model, lanes: unknown): boolean {
    if (!isObject(lanes)) return false
    for (const [id, lane] of Object.entries(lanes)) {
        if (!isObject(lane)) continue
        const th = toolheadGetOrCreate(m, id)
        if (!th) continue
        th.pressure = typeof lane.pressure === 'number' ? f32(lane.pressure) : -1
        th.setPoint = typeof lane.set_point === 'number' ? f32(lane.set_point) : -1
    }
    refreshThis(m)
    return true
}

/** `print_stats`: only the file name is read. */
export function applyPrintStats(m: Model, obj: unknown): boolean {
    if (!isObject(obj)) return false
    const fn = jstring(obj, 'filename')
    if (fn !== null) m.printFilename = cut(fn, 128)
    refreshThis(m)
    return true
}

/** The Spoolman spool list (a whole result). Archived spools are skipped and
 *  at most MAX_SPOOLS are kept. */
export function applySpoolList(m: Model, arr: unknown): boolean {
    if (!Array.isArray(arr)) return false
    m.spools = []
    for (const spool of arr) {
        if (!isObject(spool)) continue
        if (spool.archived === true) continue
        const id = jint(spool, 'id')
        if (id === null) continue
        if (m.spools.length >= MAX_SPOOLS) break

        const entry: SpoolEntry = { id, material: '', vendor: '', color: 0, colorKnown: false, remainingG: -1 }
        if (typeof spool.remaining_weight === 'number') entry.remainingG = toInt(spool.remaining_weight)
        const filament = spool.filament
        if (isObject(filament)) {
            const mat = jstring(filament, 'material')
            const hex = jstring(filament, 'color_hex')
            if (mat !== null) entry.material = cut(mat, SPOOL_MATERIAL)
            const color = mapHexColor(hex)
            entry.color = color ?? 0
            entry.colorKnown = color !== null
            const vname = isObject(filament.vendor) ? jstring(filament.vendor, 'name') : null
            if (vname !== null) entry.vendor = cut(vname, SPOOL_VENDOR)
        }
        m.spools.push(entry)
    }
    refreshThis(m)
    return true
}

/** Whether a vendor name fits the edit form whole: 1 to VENDOR_LEN - 1 bytes. */
function vendorFits(name: string | null): name is string {
    return name !== null && name.length > 0 && new TextEncoder().encode(name).length < VENDOR_LEN
}

const foldAscii = (s: string): Uint8Array => new TextEncoder().encode(s.replace(/[A-Z]/g, (c) => c.toLowerCase()))

/** ASCII case-insensitive byte order: the same in both cores, which a
 *  locale-aware sort would not be. */
function vendorCmp(a: string, b: string): number {
    const x = foldAscii(a)
    const y = foldAscii(b)
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
        if (x[i] !== y[i]) return x[i] - y[i]
    }
    return x.length - y.length
}

export const VENDOR_GENERIC = 'Generic'

/** The brands a fresh Spoolman has none of, so the editor would otherwise
 *  offer "Generic" and nothing else. Merged with Spoolman's own list by
 *  applyVendorList(); the same list, in the same order, is in
 *  src/backend/status_map.c, and the differential tests are what keeps the two
 *  honest. Brand names are not translated: they are the same in every
 *  language, and a host that has one keeps its own spelling. */
export const CURATED_VENDORS = [
    VENDOR_GENERIC,
    'Bambu Lab',
    'Polymaker',
    'Prusament',
    'eSUN',
    'Sunlu',
    'Elegoo',
    'Overture',
    'Hatchbox',
    'Creality',
    'Anycubic',
    'Jayo',
    'Eryone',
    'Inland',
    'Fillamentum',
    'Fiberlogy',
    'ColorFabb',
    'Extrudr',
    'Protopasta',
    'Siraya Tech',
    'Atomic Filament',
    'MatterHackers',
    'Spectrum',
    'Azurefilm',
    'Kingroon',
    'Geeetech',
    'Voxelab',
    'Amolen',
    '3DXTech',
    'Das Filament',
]

/** The Spoolman vendor list (a whole result): the names that fit whole, without
 *  repeats, at most MAX_VENDORS of them, sorted case-insensitively, then the
 *  curated brands that Spoolman's list does not already name, and "Generic"
 *  first of all. */
export function applyVendorList(m: Model, arr: unknown): boolean {
    if (!Array.isArray(arr)) return false
    const names: string[] = []
    for (const vendor of arr) {
        const name = isObject(vendor) ? jstring(vendor, 'name') : null
        if (!vendorFits(name)) continue
        if (names.some((n) => vendorCmp(n, name) === 0)) continue
        if (names.length >= MAX_VENDORS) break
        names.push(name)
    }
    names.sort(vendorCmp)
    // Spoolman's own spelling of a brand wins, and a brand only Spoolman knows
    // stays; the curated ones fill in behind them.
    for (const name of CURATED_VENDORS) {
        if (names.length >= MAX_VENDORS) break
        if (names.some((n) => vendorCmp(n, name) === 0)) continue
        names.push(name)
    }
    // "Generic" leads: it is the answer for a spool nobody has attributed yet,
    // and the editor steps through the list, so it is the first tap.
    const generic = names.findIndex((n) => vendorCmp(n, VENDOR_GENERIC) === 0)
    if (generic > 0) names.unshift(names.splice(generic, 1)[0])
    m.vendors = names
    refreshThis(m)
    return true
}

// ------------------------------------------------------------- spool edit

/** ASCII case-insensitive equality: Spoolman keeps a material or a vendor as
 *  typed, so "pla" and "PLA" are one choice. */
const ciEqual = (a: string, b: string): boolean =>
    a.replace(/[A-Z]/g, (c) => c.toLowerCase()) === b.replace(/[A-Z]/g, (c) => c.toLowerCase())

/** The common materials the edit form offers, in order. A spool's own
 *  material, when it is none of these, is one more choice (index MATERIALS.length). */
export const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'PC', 'PLA-CF', 'PETG-CF', 'PVA']

/** How many vendors the edit form offers: Spoolman's list, plus "Generic" when
 *  it does not hold it. A bay's own vendor, when it is none of these, is one
 *  more choice (index editVendorCount). */
export const editVendorCount = (m: Model): number =>
    m.vendors.length + (m.vendors.some((v) => ciEqual(v, VENDOR_GENERIC)) ? 0 : 1)

export const editVendorName = (m: Model, i: number): string =>
    i < 0 || i >= editVendorCount(m) ? '' : i < m.vendors.length ? m.vendors[i] : VENDOR_GENERIC

/** What the edit form starts from for a bay (mmu_edit_defaults in C): its own
 *  facts where the model has them, else a default. */
export interface EditDefaults {
    material: number // index of MATERIALS, or MATERIALS.length: the bay's own
    color: number // 0xRRGGBB, -1 = no known color
    vendor: number // index of editVendorName, or editVendorCount: the bay's own
    remainingG: number
    initialG: number // read back from the remaining grams and percent; 1000 when unknown
    paX1000: number // pressure advance * 1000; 20 when unknown
}

export function editDefaults(m: Model, unitIdx: number, slotIdx: number): EditDefaults {
    const d: EditDefaults = { material: 0, color: -1, vendor: 0, remainingG: 1000, initialG: 1000, paX1000: 20 }
    const s = m.units[unitIdx]?.slots[slotIdx]
    if (!s) return d

    d.material = s.material ? MATERIALS.length : 0
    for (let i = 0; i < MATERIALS.length; i++) {
        if (ciEqual(s.material, MATERIALS[i])) {
            d.material = i
            break
        }
    }

    if (s.colorKnown) d.color = s.color & 0xffffff

    const n = editVendorCount(m)
    d.vendor = n
    for (let i = 0; i < n; i++) {
        if (ciEqual(s.brand, editVendorName(m, i))) {
            d.vendor = i
            break
        }
    }
    if (!s.brand) {
        for (let i = 0; i < n; i++) {
            if (editVendorName(m, i) === VENDOR_GENERIC) d.vendor = i
        }
    }

    // the host reports the spool's own size when it sends one; without it the
    // size is read back from the grams and the percent left, and a spool that
    // never said either keeps Spoolman's 1000
    if (s.initialG >= 1) d.initialG = s.initialG
    else if (s.remainingG >= 0 && s.remainingPct > 0) {
        const v = Math.trunc((s.remainingG * 100 + Math.trunc(s.remainingPct / 2)) / s.remainingPct)
        if (v >= 1) d.initialG = v
    }
    if (s.remainingG > d.initialG) d.initialG = s.remainingG
    d.remainingG = s.remainingG >= 0 ? s.remainingG : d.initialG

    // the spool's own pressure advance when the host sends one, else Spoolman's 0.020
    if (s.flowKX1000 >= 0) d.paX1000 = s.flowKX1000
    return d
}

/** The job's file metadata: per-tool grams needed, and a shortfall alert for
 *  each tool whose group cannot cover it. */
export function applyMetadata(m: Model, obj: unknown): boolean {
    if (!isObject(obj)) return false
    const weights = obj.filament_weights
    if (!Array.isArray(weights)) return false

    m.jobNeedG.fill(0)
    let n = 0
    for (const w of weights) {
        if (n >= MAX_TOOLS) break
        const val = typeof w === 'number' ? w : 0
        // Round up to whole grams.
        m.jobNeedG[n] = val > 0 ? i16(toInt(val + 0.9999999)) : 0
        n++
    }

    for (let i = 0; i < n; i++) {
        const need = m.jobNeedG[i]
        if (need === 0) continue
        const gi = m.groups.findIndex((g) => g.name === `T${i}`)
        if (gi < 0) continue
        let have = 0
        let allUnknown = true
        for (const mem of m.groups[gi].members) {
            const slot = m.units[mem.unit]?.slots[mem.slot]
            if (!slot || slot.remainingG < 0) continue
            have += slot.remainingG
            allUnknown = false
        }
        if (allUnknown) continue // never alarm on pure unknowns
        if (have < need) {
            // About the job on the group's lane: the toolhead's alert, a caution.
            const first = m.groups[gi].members[0]
            const thIdx = first && first.unit >= 0 && first.unit < m.units.length ? m.units[first.unit].toolhead : -1
            queueComposed(m, AlertKind.SHORTFALL, Sev.INFO, -1, thIdx, i, need, have)
        }
    }
    refreshThis(m)
    return true
}
