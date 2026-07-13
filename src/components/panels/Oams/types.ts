// Data model the OAMS panel renders. Mirrors the shape of the original
// (mocked) OpenAMS UI so the ported components stay 1:1 with their design,
// but several fields are optional here because the live Klipper module does
// not (yet) report them (spool color/material/weight, env temp/humidity).

export interface OamsBay {
    // Inert in v1 (no Klipper source): color/material/weight are placeholders
    // kept for layout fidelity and a future Spoolman/metadata wiring.
    color: string
    material: string
    total_weight: number
    current_weight: number
    // Live: which filament group owns this bay, and the bay's runtime state.
    filament_group: string
    state: 'empty' | 'inserted' | 'loaded'
}

export interface OamsPidLoop {
    p: number
    i: number
    d: number
}

export interface OamsUnit {
    // Short name, e.g. "oams1" (the part after "oams " in the config section).
    name: string
    index: number
    type: string
    state: 'online' | 'offline'
    // Inert in v1 (no Klipper source unless an HDC1080 is wired + mapped).
    temperature_c: number | null
    humidity_rh: number | null
    // rewind_loop = rewind-current PID, follower_loop = hub-motor (pressure) PID.
    rewind_loop: OamsPidLoop
    follower_loop: OamsPidLoop
    bays: OamsBay[]
}

export interface FpsUnit {
    name: string
    value: number
    fps_upper_threshold: number
    fps_lower_threshold: number
    oams: OamsUnit[]
}

export interface ToolheadUnit {
    name: string
    fps: FpsUnit[]
    filament_groups: string[]
}

export interface OamsSystemModel {
    toolheads: ToolheadUnit[]
}

// ---- raw Klipper status shapes (what Moonraker pushes into state.printer) ----

export interface OamsManagerLaneStatus {
    op: string
    group: string | null
    unit: [number, number] | null
    runout: string
    following: boolean
    since: number
    message: string | null
}

export interface OamsManagerTopology {
    fps: string[]
    oams: Record<string, { idx: number; lane: string | null }>
    groups: Record<string, { lane: string | null; bays: string[] }>
}

export interface OamsManagerStatus {
    current_group: string | null
    lanes: Record<string, OamsManagerLaneStatus>
    topology?: OamsManagerTopology
}

export interface OamsUnitStatus {
    current_spool: number | null
    oams_idx: number
    connected: boolean
    fps_value: number
    fps_upper_threshold: number
    fps_lower_threshold: number
    f1s_hes_value: number[]
    hub_hes_value: number[]
    kp: number
    ki: number
    kd: number
    fps_target: number
    current_kp: number
    current_ki: number
    current_kd: number
    current_target: number
    encoder_clicks: number
    i_value: number
    protocol_version: number | null
}
