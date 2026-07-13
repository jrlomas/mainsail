import Vue from 'vue'
import { ActionTree } from 'vuex'
import { RootState } from '@/store/types'
import { AtlasStatusResponse, ServerAtlasState } from '@/store/server/atlas/types'

export const actions: ActionTree<ServerAtlasState, RootState> = {
    reset({ commit }) {
        commit('reset')
    },

    init() {
        Vue.$socket.emit('server.atlas.status', {}, { action: 'server/atlas/setStatus' })
    },

    setStatus({ commit, dispatch }, payload: AtlasStatusResponse & { requestParams?: unknown }) {
        commit('setStatus', payload)
        dispatch('socket/removeInitModule', 'server/atlas/init', { root: true })
    },

    setDisconnected({ commit }) {
        commit('setDisconnected')
    },
}
