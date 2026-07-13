// Pure adapter: assemble the OAMS panel model from Mainsail's flat
// `state.printer` object map. Isolates the gap between what klipper_openams
// reports and what the ported UI expects, so the components stay presentational.
//
// A toolhead and its extruder are the same thing. Each toolhead/extruder has
// exactly one FPS (Filament Pressure Sensor) — a 1:1 relationship — and multiple
// OAMS feed that one FPS. The FPS sits in the filament path and lets every OAMS on
// it follow the extruder's movement via the pressure reading. So each FPS maps to
// one toolhead, which we name by its extruder.
//
// Note: klipper_openams's status keys an FPS by name in `oams_manager.lanes` and
// exposes the owning FPS of an OAMS/group as a `lane` field; those raw key/field
// names are the Klipper API and are read as-is below.

import {
    FpsUnit,
    OamsBay,
    OamsManagerStatus,
    OamsManagerTopology,
    OamsSystemModel,
    OamsUnit,
    OamsUnitStatus,
    ToolheadUnit,
} from '@/components/panels/Oams/types'

const DEFAULT_BAY_COLOR = '#7a7f87'
const DEFAULT_TOTAL_WEIGHT = 1000
const DEFAULT_EXTRUDER = 'extruder'

// Mainsail's flat printer object map mixes many unrelated object shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrinterState = Record<string, any>

interface EnvReading {
    temperature: number | null
    humidity: number | null
}

/** True if the printer exposes the OpenAMS manager (used for panel visibility). */
export function oamsExists(printer: PrinterState | undefined): boolean {
    return !!printer && 'oams_manager' in printer
}

/** "oams oams1" -> "oams1" ; "fps fps1" -> "fps1" ; "fps" -> "fps". */
function shortName(key: string): string {
    const idx = key.indexOf(' ')
    return idx === -1 ? key : key.slice(idx + 1)
}

function bayState(unit: OamsUnitStatus, bay: number): OamsBay['state'] {
    const loaded = !!unit.hub_hes_value?.[bay] || unit.current_spool === bay
    if (loaded) return 'loaded'
    if (unit.f1s_hes_value?.[bay]) return 'inserted'
    return 'empty'
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(1, value))
}

function sortGroups(groups: string[]): string[] {
    return [...groups].sort((a, b) => {
        const na = Number(a.replace(/^T/, ''))
        const nb = Number(b.replace(/^T/, ''))
        if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b)
        return na - nb
    })
}

/**
 * Collect HDC1080 environment readings, keyed by the sensor's short name. The
 * driver registers itself as `aht3x <name>` (default, to ride Mainsail's native
 * AHT3X card) or `hdc1080 <name>`, both exposing { temperature, humidity }.
 */
function collectEnvSensors(printer: PrinterState): Record<string, EnvReading> {
    const env: Record<string, EnvReading> = {}
    Object.keys(printer).forEach((key) => {
        if (!key.startsWith('aht3x ') && !key.startsWith('hdc1080 ')) return
        const obj = printer[key]
        env[shortName(key)] = {
            temperature: typeof obj?.temperature === 'number' ? obj.temperature : null,
            humidity: typeof obj?.humidity === 'number' ? obj.humidity : null,
        }
    })
    return env
}

/**
 * Build the panel model. `printer` is `this.$store.state.printer`.
 * Falls back gracefully when the topology block is missing (older firmware):
 * all OAMS units collapse under a single synthetic FPS / toolhead.
 */
export function buildOamsModel(printer: PrinterState | undefined): OamsSystemModel {
    const empty: OamsSystemModel = { toolheads: [] }
    if (!printer) return empty

    const manager = printer.oams_manager as OamsManagerStatus | undefined
    if (!manager) return empty

    // Collect OAMS units keyed by their short name.
    const units: Record<string, OamsUnitStatus> = {}
    Object.keys(printer).forEach((key) => {
        if (key === 'oams_manager') return
        if (key === 'oams' || key.startsWith('oams ')) units[shortName(key)] = printer[key]
    })

    const topology: OamsManagerTopology = manager.topology ?? { fps: [], oams: {}, groups: {} }

    // Map "<oams>-<bay>" -> group name, and group -> owning FPS name.
    const bayGroup: Record<string, string> = {}
    const groupFps: Record<string, string | null> = {}
    Object.keys(topology.groups ?? {}).forEach((group) => {
        groupFps[group] = topology.groups[group].lane ?? null
        ;(topology.groups[group].bays ?? []).forEach((bayKey) => {
            bayGroup[bayKey] = group
        })
    })

    // Environment sensors: name-match per OAMS, else a single shared sensor.
    const envSensors = collectEnvSensors(printer)
    const envList = Object.values(envSensors)
    const soleEnv = envList.length === 1 ? envList[0] : null
    const envFor = (unitName: string): EnvReading | null => envSensors[unitName] ?? soleEnv ?? null

    // Determine the FPS list. Prefer topology order, then the manager status.
    let fpsNames = topology.fps?.length ? [...topology.fps] : Object.keys(manager.lanes ?? {})
    if (fpsNames.length === 0) fpsNames = ['fps']

    // Which OAMS units feed which FPS (topology), else everything on the first.
    const unitsByFps: Record<string, string[]> = {}
    fpsNames.forEach((name) => (unitsByFps[name] = []))
    const topoOams = topology.oams ?? {}
    if (Object.keys(topoOams).length > 0) {
        Object.keys(topoOams).forEach((unitName) => {
            const fpsName = topoOams[unitName].lane ?? fpsNames[0]
            ;(unitsByFps[fpsName] ?? (unitsByFps[fpsName] = [])).push(unitName)
        })
    } else {
        unitsByFps[fpsNames[0]] = Object.keys(units)
    }

    // FPS -> extruder (toolhead). Exposed by [fps].get_status().
    const fpsObjFor = (name: string) => printer[`fps ${name}`] ?? (name === 'fps' ? printer['fps'] : undefined)
    const fpsExtruder: Record<string, string> = {}
    fpsNames.forEach((name) => {
        fpsExtruder[name] = fpsObjFor(name)?.extruder ?? DEFAULT_EXTRUDER
    })

    const buildUnit = (unitName: string): OamsUnit | null => {
        const u = units[unitName]
        if (!u) return null
        const env = envFor(unitName)
        const bayCount = Math.max(u.f1s_hes_value?.length ?? 0, u.hub_hes_value?.length ?? 0, 4)
        const bays: OamsBay[] = []
        for (let b = 0; b < bayCount; b += 1) {
            bays.push({
                color: DEFAULT_BAY_COLOR,
                material: '',
                total_weight: DEFAULT_TOTAL_WEIGHT,
                current_weight: 0,
                filament_group: bayGroup[`${unitName}-${b}`] ?? '',
                state: bayState(u, b),
            })
        }
        return {
            name: unitName,
            index: u.oams_idx ?? 0,
            type: 'OAMS',
            state: u.connected ? 'online' : 'offline',
            temperature_c: env?.temperature ?? null,
            humidity_rh: env?.humidity ?? null,
            rewind_loop: { p: u.current_kp ?? 0, i: u.current_ki ?? 0, d: u.current_kd ?? 0 },
            follower_loop: { p: u.kp ?? 0, i: u.ki ?? 0, d: u.kd ?? 0 },
            bays,
        }
    }

    const buildFps = (name: string): FpsUnit => {
        const fpsUnits = (unitsByFps[name] ?? []).map(buildUnit).filter((x): x is OamsUnit => x !== null)
        const firstRaw = units[unitsByFps[name]?.[0]]
        const fpsObj = fpsObjFor(name)
        const value = clamp01(fpsObj?.fps_value ?? firstRaw?.fps_value ?? 0)
        const lower = clamp01(firstRaw?.fps_lower_threshold ?? 0.3)
        const upperRaw = clamp01(firstRaw?.fps_upper_threshold ?? 0.7)
        return {
            name,
            value,
            fps_lower_threshold: lower,
            fps_upper_threshold: Math.max(lower, upperRaw),
            oams: fpsUnits,
        }
    }

    // One toolhead per FPS (a toolhead/extruder has exactly one FPS; multiple OAMS
    // feed that one FPS). Named by its extruder, since the toolhead IS the extruder,
    // so multi-tool / IDEX printers read naturally. Groups not yet bound to an FPS
    // (empty groups) are shown on every toolhead.
    const unboundGroups = Object.keys(groupFps).filter((g) => !groupFps[g])

    const toolheads: ToolheadUnit[] = fpsNames.map((name) => {
        const boundGroups = Object.keys(groupFps).filter((g) => groupFps[g] === name)
        return {
            name: fpsExtruder[name],
            fps: [buildFps(name)],
            filament_groups: sortGroups([...new Set([...boundGroups, ...unboundGroups])]),
        }
    })

    return { toolheads }
}
