<template>
    <span class="status-tag" :class="`tone-${tag.tone}`" :title="title">{{ tag.text }}</span>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import type { ViewTile } from '../logic/index'

/** The status tag over the ring (docs/design/UNIFIED_UI.md 4b): red for an
 *  error, yellow for information, gray for a plain state. The text is the
 *  core's; only the tone is drawn here. */
@Component
export default class StatusTag extends Vue {
    @Prop({ required: true }) readonly tag!: NonNullable<ViewTile['tag']>

    get title(): string {
        return this.tag.code ? `${this.tag.detail} (${this.tag.code})` : this.tag.detail
    }
}
</script>

<style lang="scss" scoped>
/* Overlaid on the ring, centered both ways and hiding the percentage. A tag may
   be wider than the ring but never than the tile, and never wraps. */
.status-tag {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    max-width: calc(100cqw - 6px);
    white-space: nowrap;
    line-height: 1.2;
    font-size: 11px;
    font-weight: 700;
    border-radius: 5px;
    padding: 2px 7px;
    text-shadow: none;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);

    &.tone-error {
        color: #fff;
        background: #b3263a;
    }

    &.tone-info {
        color: #2a1c00;
        background: #f5b942;
    }

    &.tone-neutral {
        color: #e6e9ed;
        background: #3a4048;
    }
}
</style>
