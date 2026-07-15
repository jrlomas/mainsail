import { describe, expect, it } from 'vitest'
import { getters } from '@/store/gui/getters'
import { getDefaultState } from '@/store/gui'
import type { GuiState, GuiStateLayoutoption } from '@/store/gui/types'
import type { RootState } from '@/store/types'

describe('gui/getPanels', () => {
    it('places a newly introduced Atlas panel beside Temperature', () => {
        const state = getDefaultState()
        const layouts = [
            'desktopLayout1',
            'desktopLayout2',
            'widescreenLayout1',
            'widescreenLayout2',
            'widescreenLayout3',
        ] as const
        // Simulate a dashboard saved before Atlas existed.
        for (const layout of layouts)
            state.dashboard[layout] = state.dashboard[layout].filter((panel) => panel.name !== 'atlas')

        const getAllPanels = getters.getAllPanelsFromViewport as (
            state: GuiState
        ) => (viewport: string) => GuiStateLayoutoption[]
        const moduleGetters = {
            getAllPossiblePanels: ['temperature', 'atlas'],
            getAllPanelsFromViewport: getAllPanels(state),
            'macros/getAllMacrogroups': [],
        }
        const rootState = { gui: { macros: { mode: 'simple' } } } as unknown as RootState
        const getPanels = (
            getters.getPanels as (
                state: GuiState,
                getters: typeof moduleGetters,
                rootState: RootState
            ) => (viewport: string, column: number, onlyVisible?: boolean) => GuiStateLayoutoption[]
        )(state, moduleGetters, rootState)

        expect(getPanels('desktop', 1, true).map((panel) => panel.name)).not.toContain('atlas')
        expect(getPanels('desktop', 2, true).map((panel) => panel.name)).toEqual(['atlas', 'temperature'])
        expect(getPanels('widescreen', 1, true).map((panel) => panel.name)).not.toContain('atlas')
        expect(getPanels('widescreen', 2, true).map((panel) => panel.name)).toEqual(['atlas', 'temperature'])
    })

    it('moves Atlas above Temperature in an existing saved layout', () => {
        const state = getDefaultState()
        state.dashboard.desktopLayout2 = [
            { name: 'temperature', visible: true },
            { name: 'atlas', visible: true },
            { name: 'miniconsole', visible: true },
        ]
        const getAllPanels = getters.getAllPanelsFromViewport as (
            state: GuiState
        ) => (viewport: string) => GuiStateLayoutoption[]
        const moduleGetters = {
            getAllPossiblePanels: ['temperature', 'atlas', 'miniconsole'],
            getAllPanelsFromViewport: getAllPanels(state),
            'macros/getAllMacrogroups': [],
        }
        const rootState = { gui: { macros: { mode: 'simple' } } } as unknown as RootState
        const getPanels = (
            getters.getPanels as (
                state: GuiState,
                getters: typeof moduleGetters,
                rootState: RootState
            ) => (viewport: string, column: number, onlyVisible?: boolean) => GuiStateLayoutoption[]
        )(state, moduleGetters, rootState)

        expect(getPanels('desktop', 2, true).map((panel) => panel.name)).toEqual([
            'atlas',
            'temperature',
            'miniconsole',
        ])

        state.dashboard.desktopLayout2 = [
            { name: 'atlas', visible: true },
            { name: 'miniconsole', visible: true },
            { name: 'temperature', visible: true },
        ]

        expect(getPanels('desktop', 2, true).map((panel) => panel.name)).toEqual([
            'miniconsole',
            'atlas',
            'temperature',
        ])
    })
})
