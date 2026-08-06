// Data model the OAMS panel renders. Mirrors the shape of the original
// (mocked) OpenAMS UI so the ported components stay 1:1 with their design,
// but several fields are optional here because the live Klipper module does
// not (yet) report them (spool color/material/weight, env temp/humidity).

export type OamsFamily = 'ams1' | 'ams_ht' | 'ams2' | 'inline_follower' | string

export interface OamsCapabilities {
    schema_version?: number
    family?: OamsFamily
    display_name?: string
    bays?: number
    dryer?: boolean
    heater_count?: number
    fan_count?: number
    dryer_target_min_c?: number | null
    dryer_target_max_c?: number | null
    vent_count?: number
    autonomous_follower?: boolean
    motor_telemetry?: boolean
    ptfe_calibration?: boolean
    hub_hes_calibration?: boolean
    rfid?: boolean
    telemetry?: boolean
    motor_trip_c?: number
}

export type OamsTelemetryChannel = Record<string, boolean | number | string | null | undefined>

export interface OamsTelemetry {
    board?: OamsTelemetryChannel
    dryer?: OamsTelemetryChannel
    follower?: OamsTelemetryChannel
    motor?: OamsTelemetryChannel
    ptfe?: OamsTelemetryChannel
    rfid?: OamsTelemetryChannel
    vent?: OamsTelemetryChannel
}

export interface OamsThermalStatus {
    valid?: boolean
    temperature_c?: number | null
    trip_c?: number
    slope_c_per_min?: number | null
    time_to_trip_s?: number | null
    total_on_s?: number
    total_i2t_a2s?: number
    recent_on_fraction?: number
    recent_rms_current_ma?: number
    sample_span_s?: number
}

export interface OamsRfidStatus {
    source: string
    reader: string
    present: boolean
    uid: string | null
    status: string
    material: string
    color: string | null
    weight_g: number | null
}

export interface OamsDeviceAction {
    action: string
    duration?: number
    spool?: number
    target?: number
}

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
    preview: boolean
    family: OamsFamily
    display_name: string
    capabilities: OamsCapabilities
    capability_warnings: string[]
    supported_actions: string[]
    telemetry: OamsTelemetry
    thermal: OamsThermalStatus
    rfid: OamsRfidStatus[]
    humidity_gm3: number | null
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

export interface OamsManagerUnitTopology {
    idx: number
    lane: string | null
    kind?: string
    family?: OamsFamily
    bays?: number
    capabilities?: OamsCapabilities
}

export interface OamsManagerTopology {
    fps: string[]
    oams: Record<string, OamsManagerUnitTopology>
    groups: Record<string, { lane: string | null; bays: string[] }>
}

export interface OamsManagerStatus {
    current_group: string | null
    lanes: Record<string, OamsManagerLaneStatus>
    topology?: OamsManagerTopology
    devices?: Record<string, OamsUnitStatus>
}

export interface OamsUnitStatus {
    schema_version?: number
    current_spool?: number | null
    oams_idx?: number
    connected?: boolean
    fps_value?: number
    fps_upper_threshold?: number
    fps_lower_threshold?: number
    f1s_hes_value?: number[]
    hub_hes_value?: number[]
    f1s_hes_value_0?: number
    f1s_hes_value_1?: number
    f1s_hes_value_2?: number
    f1s_hes_value_3?: number
    hub_hes_value_0?: number
    hub_hes_value_1?: number
    hub_hes_value_2?: number
    hub_hes_value_3?: number
    kp?: number
    ki?: number
    kd?: number
    fps_target?: number
    current_kp?: number
    current_ki?: number
    current_kd?: number
    current_target?: number
    encoder_clicks?: number
    i_value?: number
    protocol_version?: number | null
    family?: OamsFamily
    bay_count?: number
    capabilities?: OamsCapabilities
    capability_warnings?: string[]
    bays?: Array<{ index: number; ready: boolean; loaded: boolean }>
    telemetry?: OamsTelemetry
    supported_actions?: string[]
    thermal?: OamsThermalStatus
}
