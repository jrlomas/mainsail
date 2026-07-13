import { Module } from 'vuex'
import { RootState } from '@/store/types'
import { ServerAtlasState } from '@/store/server/atlas/types'
import { actions } from '@/store/server/atlas/actions'
import { mutations } from '@/store/server/atlas/mutations'

export const getDefaultState = (): ServerAtlasState => ({
    status: null,
    bridge: null,
})

export const atlas: Module<ServerAtlasState, RootState> = {
    namespaced: true,
    state: getDefaultState(),
    actions,
    mutations,
}
