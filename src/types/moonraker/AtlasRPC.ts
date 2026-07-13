export interface AtlasConfigChange {
    section: string
    key: string | null
    op: string
    old: string | null
    new: string | null
}

export interface AtlasConfigProposal {
    proposal_id: string
    created_at: number
    expires_at: number
    rationale: string
    tier: 'cosmetic' | 'consequential' | 'safety'
    action: string
    needs_confirmation: boolean
    applied: false
    changes: AtlasConfigChange[]
    before_sha256: string
    after_sha256: string
}

export interface AtlasAssistantEnvelope<T> {
    schema_version: 1
    operation: string
    result: T
}

/** Local-only Atlas assistant endpoints supplied by the HELIX fork. */
export interface AtlasRPC {
    'server.atlas.assistant.ask': (params: {
        question: string
    }) => Promise<AtlasAssistantEnvelope<{ answer: string; read_only: true }>>
    'server.atlas.assistant.interpret': (params: {
        structured?: boolean
    }) => Promise<AtlasAssistantEnvelope<{ interpretation: string; read_only: true }>>
    'server.atlas.assistant.propose': (params: { request: string }) => Promise<
        AtlasAssistantEnvelope<{
            proposal: AtlasConfigProposal | null
            reason?: string
        }>
    >
}
