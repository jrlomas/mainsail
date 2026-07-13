<template>
    <panel
        :icon="mdiPulse"
        :title="$t('Panels.AtlasPanel.Headline')"
        card-class="atlas-trace-panel"
        :collapsible="true">
        <template #buttons>
            <v-chip small label class="mr-2" :color="errorCount > 0 ? 'error' : 'default'">
                {{ errorCount }} {{ $t('Panels.AtlasPanel.Errors') }}
            </v-chip>
        </template>

        <div class="atlas-panel-body pa-2">
            <v-alert v-if="bridgeProblem" dense text type="warning" class="mb-3">
                {{ bridgeProblem }}
            </v-alert>

            <!-- diagnosis first: the answer, before the raw stream -->
            <atlas-diagnosis-card :diagnosis="diagnosis" class="mb-3" />
            <atlas-assistant-card />

            <!-- filter bar (1:1 with the CLI/atlas.view filter contract) -->
            <div class="d-flex flex-wrap align-center mb-2" style="gap: 8px">
                <v-select
                    v-model="filter.minSeverity"
                    :items="severityItems"
                    :label="$t('Panels.AtlasPanel.MinSeverity')"
                    dense
                    hide-details
                    outlined
                    style="max-width: 160px" />
                <v-select
                    v-model="filter.subsystems"
                    :items="subsystemItems"
                    :label="$t('Panels.AtlasPanel.Subsystem')"
                    multiple
                    dense
                    hide-details
                    outlined
                    style="max-width: 220px" />
                <v-select
                    v-model="filter.sources"
                    :items="sourceItems"
                    :label="$t('Panels.AtlasPanel.Source')"
                    multiple
                    dense
                    hide-details
                    outlined
                    style="max-width: 220px" />
                <v-select
                    v-model="filter.kinds"
                    :items="kindItems"
                    :label="$t('Panels.AtlasPanel.Kind')"
                    multiple
                    dense
                    hide-details
                    outlined
                    style="max-width: 220px" />
                <v-switch
                    v-model="filter.ordered"
                    :label="$t('Panels.AtlasPanel.MachineTimeOrder')"
                    dense
                    hide-details />
            </div>

            <p v-if="timeline.events.length === 0" class="app-loading">
                {{ $t('Panels.AtlasPanel.NoData') }}
            </p>

            <v-simple-table v-else dense class="atlas-trace-table">
                <thead>
                    <tr>
                        <th>{{ $t('Panels.AtlasPanel.Time') }}</th>
                        <th>{{ $t('Panels.AtlasPanel.Severity') }}</th>
                        <th>{{ $t('Panels.AtlasPanel.Source') }}</th>
                        <th>{{ $t('Panels.AtlasPanel.Kind') }}</th>
                        <th>{{ $t('Panels.AtlasPanel.Summary') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="event in visibleEvents" :key="event.seq" :class="rowClass(event)">
                        <td class="monospace">{{ formatTime(event) }}</td>
                        <td>
                            <v-chip x-small label :color="severityColor(event.severity)">
                                {{ event.severity }}
                            </v-chip>
                        </td>
                        <td>{{ event.source }}</td>
                        <td>{{ event.kind }}</td>
                        <td>{{ event.summary }}</td>
                    </tr>
                </tbody>
            </v-simple-table>

            <div v-if="timeline.notes.length" class="atlas-notes text--secondary caption mt-2">
                <div v-for="(note, i) in timeline.notes" :key="i">· {{ note }}</div>
            </div>
        </div>
    </panel>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import Panel from '@/components/ui/Panel.vue'
import { mdiPulse } from '@mdi/js'
import {
    AtlasDiagnosis,
    AtlasEvent,
    AtlasSeverity,
    AtlasTimeline,
    defaultFilter,
} from '@/components/panels/Atlas/types'
import { buildDiagnosis, buildTimeline } from '@/components/panels/Atlas/atlasAdapter'
import {
    distinctKinds,
    distinctSources,
    distinctSubsystems,
    errorCount,
    selectEvents,
} from '@/components/panels/Atlas/atlasFilter'
import AtlasDiagnosisCard from '@/components/panels/Atlas/AtlasDiagnosisCard.vue'
import AtlasAssistantCard from '@/components/panels/Atlas/AtlasAssistantCard.vue'

@Component({ components: { Panel, AtlasAssistantCard, AtlasDiagnosisCard } })
export default class AtlasPanel extends Mixins(BaseMixin) {
    mdiPulse = mdiPulse
    filter = defaultFilter()

    get rawAtlas(): unknown {
        return this.$store.state.server.atlas?.status ?? {}
    }

    get bridgeProblem(): string {
        const bridge = this.$store.state.server.atlas?.bridge
        if (!bridge) return this.$t('Panels.AtlasPanel.BridgeUnavailable').toString()
        if (bridge.last_error) {
            return this.$t('Panels.AtlasPanel.BridgeError', { error: bridge.last_error }).toString()
        }
        if (bridge.stale) return this.$t('Panels.AtlasPanel.BridgeStale').toString()
        return ''
    }

    get timeline(): AtlasTimeline {
        return buildTimeline((this.rawAtlas as Record<string, unknown>)?.timeline)
    }

    get diagnosis(): AtlasDiagnosis {
        return buildDiagnosis((this.rawAtlas as Record<string, unknown>)?.diagnosis)
    }

    get visibleEvents(): AtlasEvent[] {
        return selectEvents(this.timeline, this.filter)
    }

    get errorCount(): number {
        return errorCount(this.timeline.events)
    }

    get severityItems() {
        return ['debug', 'info', 'notice', 'warning', 'error', 'critical']
    }

    get subsystemItems(): string[] {
        return distinctSubsystems(this.timeline.events)
    }

    get sourceItems(): string[] {
        return distinctSources(this.timeline.events)
    }

    get kindItems(): string[] {
        return distinctKinds(this.timeline.events)
    }

    formatTime(event: AtlasEvent): string {
        if (event.mtime === null) return '?'
        return (event.t_exact ? '' : '~') + event.mtime.toFixed(3)
    }

    severityColor(severity: AtlasSeverity): string {
        const map: Record<AtlasSeverity, string> = {
            debug: 'grey',
            info: 'default',
            notice: 'info',
            warning: 'warning',
            error: 'error',
            critical: 'error',
        }
        return map[severity] ?? 'default'
    }

    rowClass(event: AtlasEvent): string {
        return event.severity === 'critical' || event.severity === 'error' ? 'atlas-row-error' : ''
    }
}
</script>

<style scoped>
.atlas-trace-table .monospace {
    font-family: monospace;
    white-space: nowrap;
}
.atlas-row-error td {
    background-color: rgba(255, 82, 82, 0.08);
}
</style>
