<template>
    <v-card outlined class="atlas-assistant mb-3">
        <v-card-title class="py-2 text-subtitle-1">
            <v-icon small class="mr-2">{{ mdiRobotOutline }}</v-icon>
            {{ $t('Panels.AtlasPanel.Assistant') }}
            <v-spacer />
            <v-chip v-if="enabled" x-small label color="success">
                {{ modelLabel }}
            </v-chip>
        </v-card-title>

        <v-card-text class="pt-2">
            <v-alert v-if="!enabled" dense text type="info" class="mb-0">
                {{ $t('Panels.AtlasPanel.AssistantDisabled') }}
            </v-alert>

            <template v-else>
                <div v-if="messages.length" class="atlas-conversation mb-3" aria-live="polite">
                    <div
                        v-for="(message, index) in messages"
                        :key="index"
                        class="atlas-message mb-2"
                        :class="`atlas-message--${message.role}`">
                        <strong>{{ messageLabel(message.role) }}</strong>
                        <div class="atlas-message-text">{{ message.text }}</div>
                    </div>
                </div>

                <v-alert v-if="error" dense text type="error" class="mb-3">
                    {{ error }}
                </v-alert>

                <v-textarea
                    v-model="question"
                    :label="$t('Panels.AtlasPanel.AskPlaceholder')"
                    :disabled="busy"
                    :counter="4096"
                    :maxlength="4096"
                    outlined
                    dense
                    rows="2"
                    hide-details="auto"
                    @keydown.ctrl.enter.prevent="ask" />

                <div class="d-flex flex-wrap mt-2" style="gap: 8px">
                    <v-btn
                        small
                        color="primary"
                        :loading="busyAction === 'ask'"
                        :disabled="busy || !canSubmit"
                        @click="ask">
                        <v-icon small left>{{ mdiSend }}</v-icon>
                        {{ $t('Panels.AtlasPanel.Ask') }}
                    </v-btn>
                    <v-btn small outlined :loading="busyAction === 'interpret'" :disabled="busy" @click="interpret">
                        <v-icon small left>{{ mdiTextSearch }}</v-icon>
                        {{ $t('Panels.AtlasPanel.InterpretIncident') }}
                    </v-btn>
                    <v-btn
                        v-if="configPreview"
                        small
                        outlined
                        :loading="busyAction === 'propose'"
                        :disabled="busy || !canSubmit"
                        @click="propose">
                        <v-icon small left>{{ mdiFileEditOutline }}</v-icon>
                        {{ $t('Panels.AtlasPanel.DraftConfig') }}
                    </v-btn>
                </div>

                <v-alert v-if="proposal" dense text :type="proposalAlertType" class="mt-3 mb-0">
                    <div class="font-weight-medium">
                        {{ $t('Panels.AtlasPanel.ConfigPreview') }} · {{ proposal.tier }}
                    </div>
                    <div v-if="proposal.rationale" class="mb-2">{{ proposal.rationale }}</div>
                    <div v-for="(change, index) in proposal.changes" :key="index" class="monospace caption">
                        {{ change.section }}.{{ change.key || '*' }}: {{ change.old || '∅' }} → {{ change.new || '∅' }}
                    </div>
                    <div class="caption mt-2">
                        {{
                            proposal.needs_confirmation
                                ? $t('Panels.AtlasPanel.SafetyConfirmation')
                                : $t('Panels.AtlasPanel.PreviewOnly')
                        }}
                    </div>
                </v-alert>
            </template>
        </v-card-text>
    </v-card>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { mdiFileEditOutline, mdiRobotOutline, mdiSend, mdiTextSearch } from '@mdi/js'
import type { AtlasConfigProposal } from '@/types/moonraker/AtlasRPC'

type MessageRole = 'operator' | 'atlas'

interface ChatMessage {
    role: MessageRole
    text: string
}

@Component
export default class AtlasAssistantCard extends Mixins(BaseMixin) {
    mdiFileEditOutline = mdiFileEditOutline
    mdiRobotOutline = mdiRobotOutline
    mdiSend = mdiSend
    mdiTextSearch = mdiTextSearch

    question = ''
    messages: ChatMessage[] = []
    proposal: AtlasConfigProposal | null = null
    error = ''
    busyAction = ''

    get assistantState(): Record<string, unknown> {
        const status = this.$store.state.server.atlas?.status
        if (!status || typeof status !== 'object') return {}
        const assistant = status.assistant
        return assistant && typeof assistant === 'object' ? (assistant as Record<string, unknown>) : {}
    }

    get enabled(): boolean {
        return this.assistantState.enabled === true
    }

    get configPreview(): boolean {
        return this.assistantState.config_preview === true
    }

    get modelLabel(): string {
        const model = this.assistantState.model
        return typeof model === 'string' && model ? model : this.$t('Panels.AtlasPanel.LocalModel').toString()
    }

    get busy(): boolean {
        return this.busyAction !== ''
    }

    get canSubmit(): boolean {
        return this.question.trim().length > 0
    }

    get proposalAlertType(): 'warning' | 'info' {
        return this.proposal?.needs_confirmation ? 'warning' : 'info'
    }

    messageLabel(role: MessageRole): string {
        return this.$t(`Panels.AtlasPanel.${role === 'atlas' ? 'Atlas' : 'You'}`).toString()
    }

    errorText(reason: unknown): string {
        if (reason && typeof reason === 'object' && 'message' in reason) {
            const message = (reason as { message?: unknown }).message
            if (typeof message === 'string') return message
        }
        return this.$t('Panels.AtlasPanel.AssistantError').toString()
    }

    async ask(): Promise<void> {
        const question = this.question.trim()
        if (!question || this.busy) return
        this.busyAction = 'ask'
        this.error = ''
        this.proposal = null
        this.messages.push({ role: 'operator', text: question })
        this.question = ''
        try {
            const response = await this.$socket.emitAndWait('server.atlas.assistant.ask', { question })
            this.messages.push({ role: 'atlas', text: response.result.answer })
        } catch (reason) {
            this.error = this.errorText(reason)
        } finally {
            this.busyAction = ''
        }
    }

    async interpret(): Promise<void> {
        if (this.busy) return
        this.busyAction = 'interpret'
        this.error = ''
        this.proposal = null
        try {
            const response = await this.$socket.emitAndWait('server.atlas.assistant.interpret', {
                structured: false,
            })
            this.messages.push({ role: 'atlas', text: response.result.interpretation })
        } catch (reason) {
            this.error = this.errorText(reason)
        } finally {
            this.busyAction = ''
        }
    }

    async propose(): Promise<void> {
        const request = this.question.trim()
        if (!request || this.busy) return
        this.busyAction = 'propose'
        this.error = ''
        this.proposal = null
        try {
            const response = await this.$socket.emitAndWait('server.atlas.assistant.propose', { request })
            this.proposal = response.result.proposal
            if (!this.proposal) {
                this.error = response.result.reason || this.$t('Panels.AtlasPanel.NoProposal').toString()
            } else {
                this.question = ''
            }
        } catch (reason) {
            this.error = this.errorText(reason)
        } finally {
            this.busyAction = ''
        }
    }
}
</script>

<style scoped>
.atlas-conversation {
    max-height: 320px;
    overflow-y: auto;
}
.atlas-message {
    border-left: 3px solid var(--v-primary-base);
    padding-left: 10px;
}
.atlas-message--operator {
    border-left-color: var(--v-secondary-base);
}
.atlas-message-text {
    white-space: pre-wrap;
}
.monospace {
    font-family: monospace;
}
</style>
