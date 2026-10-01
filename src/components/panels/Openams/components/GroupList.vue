<template>
    <div class="groups">
        <h4 class="groups-head">{{ labels.groups }}</h4>
        <div
            v-for="row in rows"
            :key="row.key"
            class="grow"
            :data-group="row.key"
            :title="row.group && !row.group.editable ? row.group.reason : undefined">
            <span class="gname">{{ row.label }}</span>
            <span class="members">
                <template v-for="member in row.members">
                    <button
                        v-if="member.mine"
                        :key="member.slot_id"
                        type="button"
                        class="chip"
                        :class="{ dim: !change(member)?.enabled, pending: pending(member) }"
                        :data-slot="member.slot_id"
                        :data-state="member.state"
                        :data-pending="pending(member) ? 'true' : undefined"
                        :aria-disabled="change(member)?.enabled ? undefined : 'true'"
                        :title="reason(member)"
                        @click="ask(member)">
                        <span class="sw" :class="{ unknown: !member.color }" :style="swatch(member)" />
                        <span class="chip-label">{{ member.label }}</span>
                        <spare-badge v-if="member.spare" :spare="badge(member)" />
                    </button>
                    <span
                        v-else
                        :key="member.slot_id"
                        class="chip dim"
                        :data-slot="member.slot_id"
                        :data-state="member.state">
                        <span class="sw" :class="{ unknown: !member.color }" :style="swatch(member)" />
                        <span class="chip-label">{{ member.label }}</span>
                        <spare-badge v-if="member.spare" :spare="badge(member)" />
                    </span>
                </template>
            </span>
            <button
                v-if="hasActions(row)"
                type="button"
                class="gactions"
                :aria-label="actionName(row)"
                :aria-haspopup="'menu'"
                :popovertarget="anchor(row)"
                data-popover-invoker="group"></button>
            <action-popover
                v-if="hasActions(row)"
                :anchor-id="anchor(row)"
                :heading="row.label"
                :actions="actions(row)"
                name="group" />
        </div>
    </div>
</template>

<script lang="ts">
import { Component, Inject, Prop, Vue } from 'vue-property-decorator'
import type { ViewAction, ViewGroup, ViewGroupMember, ViewLabels, ViewTile, ViewUnit } from '../logic/index'
import ActionPopover from './ActionPopover.vue'
import SpareBadge from './SpareBadge.vue'
import { INTERACT, type Interactivity } from '../interact'
import { newAnchor } from '../popover'

/** One row: a group and its members in declared order, or the bays that
 *  belong to none. `key` is the row's name in the view, "" for the ungrouped. */
interface Row {
    label: string
    key: string
    group: ViewGroup | null
    members: ViewGroupMember[]
}

/** A unit's filament groups (docs/GROUPS.md): every group that holds one of
 *  its bays, in order, and a last row for the bays that belong to no group.
 *  A member of another unit is a backup that unit may fall back to, never
 *  something to manage from here, so it is drawn, not made a control. */
@Component({ components: { ActionPopover, SpareBadge } })
export default class GroupList extends Vue {
    @Prop({ required: true }) readonly unit!: ViewUnit
    @Prop({ required: true }) readonly labels!: ViewLabels
    @Inject(INTERACT) readonly ctrl!: Interactivity

    /** One popover anchor per row: the ids are unique per page, so two panels
     *  mounted at once never claim the same one. */
    private readonly anchors: Record<string, string> = {}

    get rows(): Row[] {
        const rows: Row[] = this.unit.groups.map((group) => ({
            label: group.name,
            key: group.name,
            group,
            members: group.members,
        }))
        if (this.unit.ungrouped_bays.length) {
            rows.push({
                label: this.labels.no_group,
                key: '',
                group: null,
                members: this.unit.ungrouped_bays,
            })
        }
        return rows
    }

    hasActions(row: Row): boolean {
        return !!row.group?.actions.length
    }

    actions(row: Row): ViewAction[] {
        return row.group?.actions ?? []
    }

    anchor(row: Row): string {
        this.anchors[row.key] ??= newAnchor()
        return this.anchors[row.key]
    }

    /** The row's own actions, named the way UnitSection names the env pill's. */
    actionName(row: Row): string {
        return row.group?.actions[0]?.label ?? this.labels.groups
    }

    /** The tile of this unit's bay a member names, the way the panel finds
     *  one elsewhere (a member of another unit has none here). */
    bay(member: ViewGroupMember): ViewTile | undefined {
        return this.unit.bays.find((b) => b.slot_id === member.slot_id)
    }

    /** A member of this unit acts through its own bay's change-group action:
     *  the panel asks, and the core decides what that means. */
    change(member: ViewGroupMember): ViewAction | undefined {
        return this.bay(member)?.actions.find((a) => a.id === 'change_group')
    }

    /** An action that cannot run now says why (principle 8). */
    reason(member: ViewGroupMember): string | undefined {
        const action = this.change(member)
        return action && !action.enabled ? action.reason : undefined
    }

    /** The press is shown at once, and never sent twice (principle 9). */
    pending(member: ViewGroupMember): boolean {
        const action = this.change(member)
        return !!action && this.ctrl.isPending(action)
    }

    ask(member: ViewGroupMember): void {
        const action = this.change(member)
        if (action) this.ctrl.ask(action)
    }

    /** The spool's own color as the swatch; a member with no color gets the
     *  neutral hatched surface instead, as a tile with no color does. */
    swatch(member: ViewGroupMember): Record<string, string> {
        return member.color ? { background: member.color } : {}
    }

    /** The same spare mark the tile carries, so `∞n` means the same thing
     *  here; another unit's bay has no tile here, so it takes a bare `∞`. */
    badge(member: ViewGroupMember): NonNullable<ViewTile['spare']> {
        return this.bay(member)?.spare ?? { position: null, count: 1 }
    }
}
</script>

<style lang="scss" scoped>
@use '../tokens' as *;

/* The section sits under the bays: a small muted head, then one row per group.
   A row is a fixed line tall whatever is in it, so a press or a dimmed action
   never moves what is below it (principle 2). */
.groups {
    margin-top: 10px;
    min-width: 0;
}

.groups-head {
    margin: 0 0 6px;
    font-size: var(--oams-fs-meta);
    font-weight: var(--oams-fw-meta);
    color: var(--oams-text-faint);
}

.grow {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    min-width: 0;
}

.gname {
    flex: none;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    background: var(--oams-pill-bg);
    color: var(--oams-pill-text);
    border-radius: var(--oams-radius-pill);
    padding: 3px 8px;
    font-size: var(--oams-fs-meta);
    line-height: 1.2;
    white-space: nowrap;
}

/* The members wrap inside the row rather than scroll it sideways. */
.members {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
}

/* A member: a swatch of the spool's own color and the bay's name. */
.chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    max-width: 100%;
    margin: 0;
    padding: 0 8px 0 5px;
    border: 0;
    border-radius: var(--oams-radius-pill);
    background: var(--oams-surface-3);
    color: inherit;
    font-family: inherit;
    font-size: var(--oams-fs-meta);
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
}

button.chip {
    cursor: pointer;

    &:hover:not([aria-disabled='true']) {
        background: color-mix(in srgb, currentColor 12%, transparent);
    }

    &:active:not([aria-disabled='true']) {
        background: color-mix(in srgb, currentColor 20%, transparent);
    }

    @include oams-focus;
}

/* The press is shown at once, and never sent twice (principle 9). */
.chip.pending {
    box-shadow: inset 2px 0 0 var(--oams-accent);
}

/* Dimmed, not hidden: another unit's backup still says where it is, and a
   change-group that cannot run now still explains itself (ruling 1). */
.chip.dim {
    background: transparent;
    color: var(--oams-text-faint);
    box-shadow: inset 0 0 0 1px var(--oams-line);
    cursor: default;
}

.chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    /* The line box a translation needs: a letter with a descender is taller
       than the 12 px it is set at (tests/i18n-fit.spec.ts). */
    line-height: 1.2;
}

/* The spool's color. A bay nobody told us about takes the neutral hatched
   surface, as a tile with no color does, so it never reads as black filament
   (principle 6). */
.sw {
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: var(--oams-radius-chip);
    box-shadow: inset 0 0 0 1px var(--oams-line);
    background: var(--oams-surface-3);
}

.sw.unknown {
    @include oams-hatch;
}

/* The row's own actions ("Delete group"), which the popover dims with the
   group's own reason when it cannot run. */
.gactions {
    flex: none;
    width: 26px;
    height: 26px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: var(--oams-radius-chip);
    background: transparent;
    color: var(--oams-text-faint);
    font: inherit;
    line-height: 1;
    cursor: pointer;

    &::after {
        content: '\22ef';
        font-size: 15px;
    }

    &:hover {
        background: color-mix(in srgb, currentColor 12%, transparent);
    }

    &:active {
        background: color-mix(in srgb, currentColor 20%, transparent);
    }

    @include oams-focus;
}

.gactions[aria-expanded='true'] {
    background: color-mix(in srgb, var(--oams-accent) 16%, transparent);
    color: var(--oams-text);
}
</style>
