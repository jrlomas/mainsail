<template>
    <div class="stepper-wrap">
        <ol class="stepper" :class="`kind-${activity.kind}`" :aria-label="label">
            <li
                v-for="(name, i) in activity.steps"
                :key="i"
                class="step"
                :class="state(i)"
                :aria-current="i === activity.index && activity.failed < 0 ? 'step' : undefined">
                <i></i>
                <span>{{ name }}</span>
            </li>
        </ol>
        <div class="step-name" :class="{ failed: isFailed }" aria-hidden="true">{{ currentLabel }}</div>
    </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import type { ViewToolhead } from '../logic/index'

/** The stepper: labeled steps, the current one pulsing, a failed one red.
 *  Its row is always reserved, so the status area never changes height.
 *  Narrow (a container query, in ToolheadCard) the segments stay and one
 *  full-width label names the current or failed step. */
@Component
export default class Stepper extends Vue {
    @Prop({ required: true }) readonly activity!: ViewToolhead['activity']
    @Prop({ required: true }) readonly label!: string

    get isFailed(): boolean {
        return this.activity.failed >= 0
    }

    get currentLabel(): string {
        const at = this.isFailed ? this.activity.failed : this.activity.index
        return at >= 0 ? this.activity.steps[at] : ''
    }

    state(i: number): string {
        if (i === this.activity.failed) return 'failed'
        if (i < this.activity.index) return 'done'
        return i === this.activity.index ? 'current' : 'todo'
    }
}
</script>

<style lang="scss" scoped>
.stepper-wrap {
    width: 100%;
}

.stepper {
    display: flex;
    gap: 4px;
    width: 100%;
}

.step-name {
    display: none;
    margin-top: 6px;
    height: 16px;
    font-size: 11px;
    line-height: 16px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &.failed {
        color: var(--oams-error);
    }
}

.step {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    color: var(--oams-text-faint);

    i {
        display: block;
        height: 4px;
        border-radius: 2px;
        background: var(--oams-surface-3);
    }

    span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &.done i {
        background: var(--oams-accent);
    }

    &.done {
        color: var(--oams-text-muted);
    }

    &.current i {
        background: var(--oams-accent);
        animation: pulse 1.2s ease-in-out infinite;
    }

    &.current {
        color: var(--oams-text);
        font-weight: 600;
    }

    &.failed i {
        background: var(--oams-error);
    }

    &.failed {
        color: var(--oams-error);
        font-weight: 600;
    }
}

@keyframes pulse {
    50% {
        opacity: 0.45;
    }
}

@media (prefers-reduced-motion: reduce) {
    .step.current i {
        animation: none;
    }
}
</style>
