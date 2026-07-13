import { describe, expect, it } from 'vitest'
import { getDefaultState } from '@/store/server/atlas'
import { mutations } from '@/store/server/atlas/mutations'
import type { AtlasStatusResponse } from '@/store/server/atlas/types'

const response: AtlasStatusResponse = {
    status: {
        schema_version: 1,
        timeline: { events: [], notes: [], versions: {} },
        diagnosis: { matched: false, matches: [], case: null, notes: [] },
    },
    bridge: {
        available: true,
        healthy: true,
        stale: false,
        age: 1,
        stale_after: 15,
        generation: 4,
        daemon_state: 'running',
        last_read_at: 100,
        last_error: '',
        state_file: '/tmp/status.json',
        schema_version: 1,
    },
}

describe('server/atlas state', () => {
    it('stores an initial response or websocket update', () => {
        const state = getDefaultState()
        mutations.setStatus(state, response)
        expect(state.status?.schema_version).toBe(1)
        expect(state.bridge?.generation).toBe(4)
    })

    it('resets stale data on reconnect', () => {
        const state = getDefaultState()
        mutations.setStatus(state, response)
        mutations.reset(state)
        expect(state).toEqual(getDefaultState())
    })

    it('does not present cached facts as live after disconnect', () => {
        const state = getDefaultState()
        mutations.setStatus(state, response)
        mutations.setDisconnected(state)
        expect(state.status?.schema_version).toBe(1)
        expect(state.bridge?.healthy).toBe(false)
        expect(state.bridge?.last_error).toBe('Moonraker disconnected')
    })
})
