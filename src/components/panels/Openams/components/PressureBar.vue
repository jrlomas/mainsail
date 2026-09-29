<template>
    <div v-if="pressure" class="pressure">
        <div class="pressure-row">
            <span class="pressure-label">{{ pressure.label }}</span>
            <span class="pressure-val">{{ pressure.text }}</span>
        </div>
        <div
            class="pressure-bar"
            role="meter"
            :aria-label="pressure.label"
            aria-valuemin="0"
            aria-valuemax="1"
            :aria-valuenow="pressure.value"
            :aria-valuetext="pressure.text">
            <i :style="{ width: fill }"></i>
            <b class="setpoint" :style="{ left: setPoint }"></b>
        </div>
        <div class="pressure-scale" aria-hidden="true">
            <span v-for="(tick, i) in pressure.scale" :key="i">{{ tick }}</span>
        </div>
    </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import type { ViewToolhead } from '../logic/index'

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

/** The toolhead's pressure: the label from the core, its reading, and the bar
 *  with the set point. The bar is always neutral: a reading is not a judgment
 *  (docs/design/UNIFIED_UI.md 4b). */
@Component
export default class PressureBar extends Vue {
    @Prop({ default: null }) readonly pressure!: ViewToolhead['pressure']

    get fill(): string {
        return `${(clamp01(this.pressure!.value) * 100).toFixed(2)}%`
    }

    get setPoint(): string {
        return `${(clamp01(this.pressure!.set_point) * 100).toFixed(2)}%`
    }
}
</script>

<style lang="scss" scoped>
@use '../tokens' as *;

.pressure {
    min-width: 0;
}

.pressure-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
}

.pressure-label {
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--oams-text-faint);
}

.pressure-val {
    @include oams-mono;
    font-size: var(--oams-fs-value-mono);
    font-variant-numeric: tabular-nums;
    line-height: 1;
}

.pressure-bar {
    position: relative;
    height: 7px;
    border-radius: 99px;
    background: var(--oams-surface-3);
    overflow: hidden;

    > i {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--oams-accent);
        transition: width 0.12s linear;
    }
}

.setpoint {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--oams-text-faint);
}

.pressure-scale {
    @include oams-mono;
    display: flex;
    justify-content: space-between;
    margin-top: 5px;
    font-size: 11px;
    color: var(--oams-text-faint);
}
</style>
