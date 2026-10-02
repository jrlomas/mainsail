<template>
    <section class="fps" :data-toolhead="toolhead.id">
        <div class="fps-head">
            <div class="fps-title">
                <div class="th-icon" :class="{ loaded: !!tool }" :style="style">
                    <toolhead-icon :color="iconColor" />
                    <span v-if="tool" class="th-tool" :class="`ink-${tool.ink}`">{{ tool.label }}</span>
                </div>
                <div class="fps-text">
                    <h2>{{ toolhead.title }}</h2>
                    <p>{{ toolhead.subtitle }}</p>
                </div>
            </div>
            <pressure-bar :pressure="toolhead.pressure" />
            <div class="fps-alert">
                <alert-badge :group="toolhead.alert" :clear="toolhead.alert_clear" :labels="labels" />
            </div>
        </div>
        <div class="status" role="status">
            <div class="status-steps">
                <stepper v-if="hasStepsOrRest" :activity="toolhead.activity" :label="toolhead.message.text" />
            </div>
            <message-row :message="toolhead.message" />
        </div>
        <div class="mmus">
            <unit-section v-for="unit in toolhead.units" :key="unit.id" :unit="unit" :labels="labels" />
        </div>
        <div class="th-actions">
            <action-button v-for="action in toolhead.actions" :key="action.id" :action="action" />
        </div>
    </section>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import type { ViewLabels, ViewToolhead } from '../logic/index'
import ActionButton from './ActionButton.vue'
import AlertBadge from './AlertBadge.vue'
import MessageRow from './MessageRow.vue'
import PressureBar from './PressureBar.vue'
import Stepper from './Stepper.vue'
import ToolheadIcon from './ToolheadIcon.vue'
import UnitSection from './UnitSection.vue'

/** A toolhead (an FPS lane): the icon and titles, the pressure block centered,
 *  the alert slot, the fixed status area, its units and its actions. */
@Component({
    components: { ActionButton, AlertBadge, MessageRow, PressureBar, Stepper, ToolheadIcon, UnitSection },
})
export default class ToolheadCard extends Vue {
    @Prop({ required: true }) readonly toolhead!: ViewToolhead
    @Prop({ required: true }) readonly labels!: ViewLabels

    get tool(): ViewToolhead['tool'] {
        return this.toolhead.tool
    }

    /** The hotend icon's frame is highlighted in the loaded filament's color. */
    get style(): Record<string, string> {
        return this.tool?.color ? { '--tool': this.tool.color } : {}
    }

    get iconColor(): string {
        return this.tool?.color ?? '#5c6370'
    }

    get hasSteps(): boolean {
        return this.toolhead.activity.steps.length > 0
    }

    /** The slot never sits empty: with a plan it shows the steps, and with no
     *  plan the core's resting path (PRINCIPLES.md 2). Either way the same
     *  rows, so its height is the same. */
    get hasStepsOrRest(): boolean {
        return this.hasSteps || this.toolhead.activity.rest !== null
    }
}
</script>

<style lang="scss" scoped>
@use '../tokens' as *;

.fps {
    container: fps / inline-size;
    background: var(--oams-surface-1);
    border-radius: var(--oams-radius-card);
    padding: 18px 16px 14px;
}

/* In a host the card is the host's own, so each FPS card gets a hairline to
   read as a card. */
.oams-panel[data-theme='host'] .fps {
    box-shadow: inset 0 0 0 1px var(--oams-line);
}

/* Three zones: icon and titles left, the pressure block centered, the alert
   slot top right (its space is always reserved). */
.fps-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(200px, 320px) minmax(0, 1fr);
    gap: 20px;
    align-items: center;
    margin: 0 6px 12px;
}

.fps-title {
    grid-column: 1;
}

/* The alert's own column whether or not a pressure reading fills the middle
   one: the three zones stay where they are (principle 2). */
.fps-alert {
    grid-column: 3;
    justify-self: end;
    align-self: start;

    ::v-deep .alert-slot {
        width: 42px;
        height: 34px;
    }
}

.fps-title {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
}

.th-icon {
    position: relative;
    width: 56px;
    height: 56px;
    flex: 0 0 56px;
    border-radius: 12px;
    background: var(--oams-surface-3);
    border: 1px solid var(--oams-line);
    display: grid;
    place-items: center;

    svg {
        width: 42px;
        height: 42px;
    }

    &.loaded {
        border: 2px solid var(--tool);
        box-shadow:
            0 0 0 1px color-mix(in srgb, var(--tool) 35%, transparent),
            0 0 14px color-mix(in srgb, var(--tool) 45%, transparent);
    }
}

.th-tool {
    @include oams-mono;
    position: absolute;
    left: 50%;
    top: 52%;
    transform: translate(-50%, -50%);
    font-size: 15px;
    font-weight: 700;
    padding: 3px 6px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.62);
    color: #fff;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.55);
    pointer-events: none;

    &.ink-dark {
        background: rgba(255, 255, 255, 0.82);
        color: #111;
        text-shadow: none;
    }
}

.fps-text {
    min-width: 0;

    h2 {
        font-size: var(--oams-fs-title);
        font-weight: var(--oams-fw-title);
        letter-spacing: -0.02em;
    }

    p {
        margin-top: 5px;
        font-size: 13px;
        color: var(--oams-text-muted);
    }
}

/* The status area never changes height: one row for the stepper, one line
   (two on a narrow card) for the message. */
.status {
    margin: 0 6px 12px;
}

.status-steps {
    min-height: 30px;
    container: steps / inline-size;
}

.mmus {
    container: mmus / inline-size;
    display: flex;
    flex-wrap: wrap;
    gap: var(--oams-gap-card-gap);
}

/* Reserved height: the row keeps its space with no button in it. */
.th-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
    margin: 12px 6px 0;
    min-height: 34px;
    align-items: center;
}

@container steps (max-width: 900px) {
    ::v-deep .step:not(.rest) span {
        display: none;
    }

    /* The resting path keeps its one label at every width (it is the only text
     * there is), and the narrow-width current-step row has nothing to name. */
    ::v-deep .stepper-wrap:not(.atrest) .step-name {
        display: block;
    }

    ::v-deep .stepper {
        gap: 3px;
    }
}

@container fps (max-width: 640px) {
    .fps-head {
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas:
            'title alert'
            'pressure pressure';
        gap: 12px 14px;
    }

    .fps-title {
        grid-area: title;
    }

    .fps-alert {
        grid-area: alert;
    }

    .pressure {
        grid-area: pressure;
    }

    .fps-text h2 {
        font-size: 18px;
    }

    ::v-deep .message {
        min-height: 44px;

        span {
            -webkit-line-clamp: 2;
        }
    }
}

@container panel (max-width: 440px) {
    .fps {
        padding: 12px 8px 8px;
        border-radius: 18px;
    }

    .fps-head {
        margin: 0 4px 12px;
    }
}
</style>
