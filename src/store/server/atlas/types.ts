export interface AtlasBridgeHealth {
    available: boolean
    healthy: boolean
    stale: boolean
    age: number | null
    stale_after: number
    generation: number | null
    daemon_state: string
    last_read_at: number | null
    last_error: string
    state_file: string
    schema_version: number
}

export interface ServerAtlasState {
    status: Record<string, unknown> | null
    bridge: AtlasBridgeHealth | null
}

export interface AtlasStatusResponse {
    status: Record<string, unknown> | null
    bridge: AtlasBridgeHealth
}
