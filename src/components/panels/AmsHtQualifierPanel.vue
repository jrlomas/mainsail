<template>
    <panel
        v-if="models.length"
        :title="$t('Panels.AmsHtQualifierPanel.Headline')"
        :icon="mdiTuneVariant"
        :collapsible="true"
        card-class="ams-ht-qualifier-panel">
        <v-card-text>
            <ams-ht-qualifier-card v-for="model in models" :key="model.objectName" :model="model" />
        </v-card-text>
    </panel>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import { mdiTuneVariant } from '@mdi/js'
import BaseMixin from '@/components/mixins/base'
import AmsHtQualifierCard from '@/components/panels/AmsHtQualifier/AmsHtQualifierCard.vue'
import { buildAmsHtQualifierModels, AmsHtQualifierModel } from '@/components/panels/AmsHtQualifier/adapter'

@Component({ components: { AmsHtQualifierCard } })
export default class AmsHtQualifierPanel extends Mixins(BaseMixin) {
    mdiTuneVariant = mdiTuneVariant

    get models(): AmsHtQualifierModel[] {
        return buildAmsHtQualifierModels(this.$store.state.printer)
    }
}
</script>
