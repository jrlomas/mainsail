import { describe, expect, it } from 'vitest'
import {
    hasConversationContent,
    resetConversation,
    type ConversationState,
} from '@/components/panels/Atlas/conversation'

describe('Atlas conversation state', () => {
    it('detects every browser-held conversation artifact', () => {
        const state: ConversationState = { question: '', messages: [], proposal: null, error: '' }
        expect(hasConversationContent(state)).toBe(false)
        state.question = 'draft'
        expect(hasConversationContent(state)).toBe(true)
        state.question = ''
        state.messages = [{ role: 'operator' as const, text: 'hello' }]
        expect(hasConversationContent(state)).toBe(true)
        state.messages = []
        state.proposal = { tier: 'COSMETIC' }
        expect(hasConversationContent(state)).toBe(true)
        state.proposal = null
        state.error = 'failed'
        expect(hasConversationContent(state)).toBe(true)
    })

    it('clears chat, draft, proposal, and transient error together', () => {
        const state = {
            question: 'next question',
            messages: [
                { role: 'operator' as const, text: 'hello' },
                { role: 'atlas' as const, text: 'hi' },
            ],
            proposal: { tier: 'SAFETY' },
            error: 'old error',
        }
        resetConversation(state)
        expect(state).toEqual({ question: '', messages: [], proposal: null, error: '' })
        expect(hasConversationContent(state)).toBe(false)
    })
})
