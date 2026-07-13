<template>
    <v-card outlined class="atlas-diagnosis">
        <v-card-title class="text-subtitle-1 py-2">
            {{ $t('Panels.AtlasPanel.Diagnosis') }}
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text>
            <!-- A matched pattern: show cause + fix, most-confident first. -->
            <template v-if="diagnosis.matched">
                <div v-for="match in diagnosis.matches" :key="match.pattern_id" class="mb-3">
                    <div class="d-flex align-center">
                        <v-chip x-small color="success" label class="mr-2">{{ match.pattern_id }}</v-chip>
                        <span class="text--secondary caption">
                            {{ $t('Panels.AtlasPanel.Confidence') }}: {{ (match.confidence * 100).toFixed(0) }}% ·
                            {{ match.provenance }}
                        </span>
                    </div>
                    <div class="mt-1">
                        <strong>{{ $t('Panels.AtlasPanel.Cause') }}:</strong>
                        {{ match.cause }}
                    </div>
                    <div>
                        <strong>{{ $t('Panels.AtlasPanel.Fix') }}:</strong>
                        {{ match.fix }}
                    </div>
                </div>
            </template>

            <!-- No match: the "case captured" path is a first-class result. -->
            <template v-else-if="diagnosis.case">
                <v-chip x-small color="warning" label class="mb-2">
                    {{ $t('Panels.AtlasPanel.CaseCaptured') }}
                </v-chip>
                <div>{{ diagnosis.case.summary }}</div>
                <div class="text--secondary caption mt-1">
                    {{ $t('Panels.AtlasPanel.CaseHash') }}:
                    <code>{{ diagnosis.case.case_hash }}</code>
                </div>
                <div class="text--secondary caption">{{ diagnosis.case.note }}</div>
            </template>

            <template v-else>
                <span class="text--secondary">{{ $t('Panels.AtlasPanel.NoDiagnosis') }}</span>
            </template>
        </v-card-text>
    </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import { AtlasDiagnosis } from '@/components/panels/Atlas/types'

@Component
export default class AtlasDiagnosisCard extends Vue {
    @Prop({ required: true, type: Object }) readonly diagnosis!: AtlasDiagnosis
}
</script>
