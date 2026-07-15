export type MessageRole = 'operator' | 'atlas'

export interface ChatMessage {
    role: MessageRole
    text: string
}

export interface ConversationState {
    question: string
    messages: ChatMessage[]
    proposal: unknown | null
    error: string
}

export function hasConversationContent(state: ConversationState): boolean {
    return (
        state.messages.length > 0 ||
        state.question.trim().length > 0 ||
        state.proposal !== null ||
        state.error.length > 0
    )
}

export function resetConversation(state: ConversationState): void {
    state.question = ''
    state.messages = []
    state.proposal = null
    state.error = ''
}
