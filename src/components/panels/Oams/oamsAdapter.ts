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
    OamsCapabilities,
    OamsDeviceAction,
    OamsManagerStatus,
    OamsManagerTopology,
    OamsRfidStatus,
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

function legacySensorValues(unit: OamsUnitStatus, prefix: 'f1s' | 'hub'): number[] {
    const values = [0, 1, 2, 3].map((index) => unit[`${prefix}_hes_value_${index}` as keyof OamsUnitStatus])
    return values.some((value) => value !== undefined) ? values.map((value) => Number(value ?? 0)) : []
}

function normalizeUnitStatus(unit: OamsUnitStatus): OamsUnitStatus {
    const f1s = unit.f1s_hes_value ?? unit.bays?.map((bay) => Number(bay.ready)) ?? legacySensorValues(unit, 'f1s')
    const hub = unit.hub_hes_value ?? unit.bays?.map((bay) => Number(bay.loaded)) ?? legacySensorValues(unit, 'hub')
    return { ...unit, f1s_hes_value: f1s, hub_hes_value: hub }
}

function filamentColor(filament: Record<string, unknown> | null): string | null {
    const argb = filament?.color_argb
    if (typeof argb !== 'number') return null
    return `#${(argb & 0xffffff).toString(16).padStart(6, '0')}`
}

function collectRfid(printer: PrinterState): Record<number, OamsRfidStatus[]> {
    const result: Record<number, OamsRfidStatus[]> = {}
    Object.entries(printer).forEach(([key, value]) => {
        if (key !== 'mfrc522' && !key.startsWith('mfrc522 ')) return
        const root = value as Record<string, unknown>
        const readers = Array.isArray(root.readers) ? root.readers : [root]
        readers.forEach((readerValue, index) => {
            const reader = readerValue as Record<string, unknown>
            const oams = Number(reader.oams ?? root.oams)
            if (!Number.isFinite(oams)) return
            const filament =
                reader.filament && typeof reader.filament === 'object'
                    ? (reader.filament as Record<string, unknown>)
                    : null
            const material = filament?.type ?? filament?.detailed ?? ''
            const entry: OamsRfidStatus = {
                source: shortName(key),
                reader: String(reader.rfid_card ?? index),
                present: reader.present === true,
                uid: typeof reader.uid === 'string' ? reader.uid : null,
                status: typeof reader.last_read_status === 'string' ? reader.last_read_status : 'unknown',
                material: typeof material === 'string' ? material : '',
                color: filamentColor(filament),
                weight_g: typeof filament?.weight_g === 'number' ? filament.weight_g : null,
            }
            ;(result[oams] ?? (result[oams] = [])).push(entry)
        })
    })
    return result
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

    // Collect OAMS units keyed by their short name. The manager copy makes the
    // capability model available to clients that subscribe only to its object;
    // a dedicated [oams] status object wins when both are present.
    const units: Record<string, OamsUnitStatus> = {}
    Object.entries(manager.devices ?? {}).forEach(([name, status]) => {
        units[name] = normalizeUnitStatus(status)
    })
    Object.keys(printer).forEach((key) => {
        if (key !== 'oams' && !key.startsWith('oams ')) return
        const name = shortName(key)
        units[name] = normalizeUnitStatus({ ...units[name], ...printer[key] })
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
    const rfidByIndex = collectRfid(printer)

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
        const topologyUnit = topoOams[unitName]
        const family = u.family ?? topologyUnit?.family ?? u.capabilities?.family ?? 'ams1'
        const familyDefaults: OamsCapabilities = {
            family,
            display_name: family === 'ams_ht' ? 'AMS HT' : family === 'ams2' ? 'AMS 2 Pro' : 'AMS 1',
            bays: family === 'ams_ht' ? 1 : 4,
            dryer: family === 'ams_ht' || family === 'ams2',
        }
        const capabilities: OamsCapabilities = {
            ...familyDefaults,
            ...(topologyUnit?.capabilities ?? {}),
            ...(u.capabilities ?? {}),
        }
        const env = envFor(unitName)
        const telemetry = u.telemetry ?? {}
        const dryer = telemetry.dryer
        const chamberTemperature = typeof dryer?.chamber_c === 'number' ? dryer.chamber_c : (env?.temperature ?? null)
        const humidityGm3 = typeof dryer?.humidity_gm3 === 'number' ? dryer.humidity_gm3 : null
        const sensorBayCount = Math.max(u.f1s_hes_value?.length ?? 0, u.hub_hes_value?.length ?? 0)
        const bayCount = Math.max(1, u.bay_count ?? topologyUnit?.bays ?? capabilities.bays ?? sensorBayCount ?? 4)
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
        const index = u.oams_idx ?? topologyUnit?.idx ?? 0
        const rfid = [...(rfidByIndex[index] ?? [])]
        if (telemetry.rfid) {
            const status = telemetry.rfid
            rfid.push({
                source: 'integrated',
                reader: '0',
                present: status.result_name === 'ok' && typeof status.uid === 'string',
                uid: typeof status.uid === 'string' ? status.uid : null,
                status: typeof status.result_name === 'string' ? status.result_name : 'unknown',
                material: '',
                color: null,
                weight_g: null,
            })
        }
        return {
            name: unitName,
            index,
            type: capabilities.display_name ?? 'OAMS',
            state: u.connected === false ? 'offline' : 'online',
            preview: false,
            family,
            display_name: capabilities.display_name ?? 'OAMS',
            capabilities,
            capability_warnings: u.capability_warnings ?? [],
            supported_actions: u.supported_actions ?? (family === 'ams1' ? ['configure_pid'] : []),
            telemetry,
            thermal: u.thermal ?? {},
            rfid,
            humidity_gm3: humidityGm3,
            temperature_c: chamberTemperature,
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

function emptyPreviewBays(count: number): OamsBay[] {
    return Array.from({ length: count }, () => ({
        color: DEFAULT_BAY_COLOR,
        material: '',
        total_weight: DEFAULT_TOTAL_WEIGHT,
        current_weight: 0,
        filament_group: '',
        state: 'empty',
    }))
}

function previewUnit(family: 'ams1' | 'ams2', index: number): OamsUnit {
    const isAms2 = family === 'ams2'
    const displayName = isAms2 ? 'AMS 2 Pro' : 'AMS 1'
    const capabilities: OamsCapabilities = {
        schema_version: 1,
        family,
        display_name: displayName,
        bays: 4,
        dryer: isAms2,
        heater_count: isAms2 ? 2 : 0,
        fan_count: isAms2 ? 2 : 0,
        dryer_target_min_c: isAms2 ? 35 : null,
        dryer_target_max_c: isAms2 ? 65 : null,
        vent_count: isAms2 ? 2 : 0,
        autonomous_follower: true,
        motor_telemetry: isAms2,
        ptfe_calibration: true,
        hub_hes_calibration: true,
        rfid: true,
        telemetry: isAms2,
    }
    return {
        name: `preview_${family}`,
        index,
        type: displayName,
        state: 'offline',
        preview: true,
        family,
        display_name: displayName,
        capabilities,
        capability_warnings: [],
        supported_actions: [],
        telemetry: {},
        thermal: {},
        rfid: [],
        humidity_gm3: null,
        temperature_c: null,
        humidity_rh: null,
        rewind_loop: { p: 0, i: 0, d: 0 },
        follower_loop: { p: 0, i: 0, d: 0 },
        bays: emptyPreviewBays(4),
    }
}

/**
 * Add read-only AMS1 and AMS2 examples for UI development when those physical
 * devices are absent. Preview units intentionally publish no supported actions.
 */
export function withOamsFamilyPreviews(model: OamsSystemModel): OamsSystemModel {
    const families = new Set(
        model.toolheads.flatMap((toolhead) => toolhead.fps.flatMap((fps) => fps.oams.map((unit) => unit.family)))
    )
    const missing = (['ams1', 'ams2'] as const).filter((family) => !families.has(family))
    if (missing.length === 0) return model

    const toolheads =
        model.toolheads.length > 0
            ? model.toolheads.map((toolhead) => ({
                  ...toolhead,
                  fps: toolhead.fps.map((fps) => ({ ...fps, oams: [...fps.oams] })),
              }))
            : [
                  {
                      name: DEFAULT_EXTRUDER,
                      fps: [
                          {
                              name: 'preview_fps',
                              value: 0.5,
                              fps_lower_threshold: 0.3,
                              fps_upper_threshold: 0.7,
                              oams: [],
                          },
                      ],
                      filament_groups: [],
                  },
              ]
    const fps = toolheads[0].fps[0]
    const usedIndexes = new Set(
        toolheads.flatMap((toolhead) => toolhead.fps.flatMap((item) => item.oams.map((unit) => unit.index)))
    )
    let index = 1000
    missing.forEach((family) => {
        while (usedIndexes.has(index)) index += 1
        fps.oams.push(previewUnit(family, index))
        usedIndexes.add(index)
        index += 1
    })
    return { toolheads }
}

/** Build only explicitly supported commands; preview devices can never emit one. */
export function commandForOamsDevice(unit: OamsUnit, payload: OamsDeviceAction): string | null {
    if (unit.preview || !unit.supported_actions.includes(payload.action)) return null

    const spool = Math.max(0, Math.min(unit.bays.length - 1, Math.trunc(payload.spool ?? 0)))
    switch (payload.action) {
        case 'dryer_start': {
            if (!Number.isFinite(payload.target) || !Number.isFinite(payload.duration)) return null
            const minimum = unit.capabilities.dryer_target_min_c ?? 30
            const maximum = unit.capabilities.dryer_target_max_c ?? 80
            const target = Math.max(minimum, Math.min(maximum, Number(payload.target)))
            const duration = Math.max(1, Math.min(604800, Math.round(Number(payload.duration))))
            return `OAMS_DRYER_START OAMS=${unit.index} TARGET=${target} DURATION=${duration}`
        }
        case 'dryer_stop':
            return `OAMS_DRYER_STOP OAMS=${unit.index}`
        case 'clear_fault':
            return `OAMS_CLEAR_FAULT OAMS=${unit.index}`
        case 'rfid_scan':
            return `OAMS_RFID_SCAN OAMS=${unit.index}`
        case 'calibrate_ptfe':
            return `OAMS_CALIBRATE_PTFE_LENGTH OAMS=${unit.index} SPOOL=${spool}`
        case 'calibrate_hub_hes':
            return `OAMS_CALIBRATE_HUB_HES OAMS=${unit.index} SPOOL=${spool}`
        case 'clear_errors':
            return 'OAMSM_CLEAR_ERRORS'
        default:
            return null
    }
}
