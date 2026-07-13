import Vue from 'vue'
import { MutationTree } from 'vuex'
import { getDefaultState } from '@/store/server/atlas'
import { AtlasStatusResponse, ServerAtlasState } from '@/store/server/atlas/types'

export const mutations: MutationTree<ServerAtlasState> = {
    reset(state) {
        Object.assign(state, getDefaultState())
    },

    setStatus(state, payload: AtlasStatusResponse) {
        Vue.set(state, 'status', payload.status)
        Vue.set(state, 'bridge', payload.bridge)
    },

    setDisconnected(state) {
        if (!state.bridge) return

        Vue.set(state, 'bridge', {
            ...state.bridge,
            healthy: false,
            last_error: 'Moonraker disconnected',
        })
    },
}
