<template>
    <panel
        v-if="models.length"
        :title="$t('Panels.AmsHtQualifierPanel.Headline')"
        :icon="mdiTuneVariant"
        :collapsible="true"
        card-class="ams-ht-qualifier-panel">
        <v-card-text>
            <v-btn color="error" class="mb-4" :disabled="!canStopAllMotion" @click="stopAllMotion">
                {{ $t('Panels.AmsHtQualifierPanel.StopAllMotion') }}
            </v-btn>
            <ams-ht-qualifier-card v-for="model in models" :key="model.objectName" :model="model" />
        </v-card-text>
    </panel>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import { mdiTuneVariant } from '@mdi/js'
import BaseMixin from '@/components/mixins/base'
import AmsHtQualifierCard from '@/components/panels/AmsHtQualifier/AmsHtQualifierCard.vue'
import {
    buildAmsHtQualifierModels,
    AmsHtQualifierModel,
    commandForAmsHt,
} from '@/components/panels/AmsHtQualifier/adapter'

@Component({ components: { AmsHtQualifierCard } })
export default class AmsHtQualifierPanel extends Mixins(BaseMixin) {
    mdiTuneVariant = mdiTuneVariant

    get models(): AmsHtQualifierModel[] {
        return buildAmsHtQualifierModels(this.$store.state.printer)
    }

    get canStopAllMotion(): boolean {
        return this.models.some((model) => model.connected)
    }

    stopAllMotion(): void {
        this.models
            .filter((model) => model.connected)
            .forEach((model) => {
                this.$store.dispatch('printer/sendGcode', commandForAmsHt(model, 'AMS_HT_MOTION_STOP'))
            })
    }
}
</script>
