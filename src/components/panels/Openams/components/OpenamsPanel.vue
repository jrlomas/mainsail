<template>
    <div class="oams-panel panel" :data-theme="theme">
        <panel-bar v-if="theme !== 'host' && view" :view="view" />
        <div v-if="note" class="notice panel-notice" :class="`tone-${note.tone}`" role="status">{{ note.text }}</div>
        <template v-if="view">
            <toolhead-card
                v-for="toolhead in view.toolheads"
                :key="toolhead.id"
                :toolhead="toolhead"
                :labels="view.labels" />
            <section v-if="view.unassigned_units.length" class="fps unassigned">
                <div class="mmus">
                    <unit-section
                        v-for="unit in view.unassigned_units"
                        :key="unit.id"
                        :unit="unit"
                        :labels="view.labels" />
                </div>
            </section>
        </template>
        <action-dialog :labels="view ? view.labels : null" />
    </div>
</template>

<script lang="ts">
import { Component, Prop, ProvideReactive, Vue, Watch } from 'vue-property-decorator'
import type { ActionResult, Core, Tone, View } from '../logic/index'
import { Interactivity, INTERACT, type FormValues } from '../interact'
import ActionDialog from './ActionDialog.vue'
import PanelBar from './PanelBar.vue'
import ToolheadCard from './ToolheadCard.vue'
import UnitSection from './UnitSection.vue'

export type Theme = 'host' | 'dark' | 'light'

/** The panel: it draws the view tree the logic returns and nothing else
 *  (docs/design/UNIFIED_UI.md 2). It reads no printer object and composes no
 *  text; every string on the screen is the core's.
 *
 *   logic  the Core (web/logic) to draw; without one the panel draws its frame.
 *   theme  "host" (the host's card, text and font, through Vuetify's --v-*
 *          variables), "dark" or "light" for a standalone page.
 *
 * It also owns the one interaction state (Interactivity) and the one dialog,
 * and emits `request` with the ActionResult for every action that has one. That
 * event is the host's contract: a Mainsail wrapper sends the gcode or makes the
 * RPC call, so the panel itself never talks to a printer. */
@Component({ components: { ActionDialog, PanelBar, ToolheadCard, UnitSection } })
export default class OpenamsPanel extends Vue {
    @Prop({ default: null }) readonly logic!: Core | null
    @Prop({ default: 'host' }) readonly theme!: Theme

    view: View | null = null
    private stop: (() => void) | null = null
    private made: Interactivity | null = null

    /** The interaction state, provided to every widget below. */
    @ProvideReactive(INTERACT)
    get ctrl(): Interactivity {
        if (!this.made) this.made = new Interactivity(this.resolve)
        return this.made
    }

    mounted() {
        // The core writes English in v1; the strings live in the host's own
        // table (UNIFIED_UI.md 4), so a host that sets a language keeps it.
        if (!this.$el.closest('[lang]')) this.$el.setAttribute('lang', 'en')
        this.watchLogic()
    }

    beforeDestroy() {
        this.stop?.()
        this.stop = null
        this.made?.dispose()
        this.made = null
    }

    @Watch('logic')
    onLogic() {
        this.watchLogic()
    }

    /** The one message row: the panel's own transient message while it lasts,
     *  the core's notice otherwise (principle 2: a state gets its place). */
    get note(): { text: string; tone: Tone } | null {
        if (this.ctrl.message) return { text: this.ctrl.message, tone: this.ctrl.tone }
        if (this.view?.notice) return { text: this.view.notice.text, tone: 'neutral' }
        return null
    }

    /** Draw the current view, then redraw on every flush of the core. */
    private watchLogic() {
        this.stop?.()
        this.stop = null
        const logic = this.logic
        if (!logic) {
            this.view = null
            this.ctrl.setView(null)
            return
        }
        this.view = logic.view()
        this.ctrl.setView(this.view)
        this.stop = logic.subscribe((view: View) => {
            this.view = view
            this.ctrl.setView(view)
        })
    }

    /** Ask the logic what an action line does, and hand a request to the host.
     *  An error is said in the panel; a "local" line has nothing to send. */
    private resolve(line: string, form: FormValues | null): ActionResult | null {
        const logic = this.logic
        if (!logic) return null
        const result = logic.action(line, form)
        if (result.kind === 'gcode' || result.kind === 'rpc') this.$emit('request', result)
        return result
    }
}
</script>

<style lang="scss">
/* The panel's own frame, for every child component: a host's card carries its
   own resets, so these are kept to what the design needs (principle 1). */
.oams-panel * {
    box-sizing: border-box;
}

.oams-panel h2,
.oams-panel h3,
.oams-panel h4,
.oams-panel p,
.oams-panel ul,
.oams-panel ol {
    margin: 0;
    padding: 0;
}

.oams-panel ul,
.oams-panel ol {
    list-style: none;
}

.oams-panel button {
    font: inherit;
    color: inherit;
}

/* A tone's severity color, for the alert badges (principle 6). */
.oams-panel .tone-error {
    --sev: var(--oams-error);
}

.oams-panel .tone-info {
    --sev: var(--oams-warn);
}

/* A popover and a dialog float above the panel, so they need a base of their
   own instead of the alpha surfaces a host's card is made of. A host's theme is
   Vuetify's own light/dark class, so the base follows it. */
.oams-panel {
    --oams-pop-base: #1e1e1e;
}

.oams-panel[data-theme='dark'] {
    --oams-pop-base: #14161a;
}

.oams-panel[data-theme='light'] {
    --oams-pop-base: #f4f5f7;
}

.v-application--is-l .oams-panel {
    --oams-pop-base: #ffffff;
}
</style>

<style lang="scss" scoped>
.panel {
    display: flex;
    flex-direction: column;
    gap: var(--oams-gap-card-gap);
    color: var(--oams-text, inherit);
    font-family: var(--oams-font-ui, inherit);
    font-size: var(--oams-fs-body);
    background: var(--oams-bg);
    -webkit-font-smoothing: antialiased;
    container: panel / inline-size;
}

.notice {
    margin: 0 6px 12px;
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 13px;
    background: var(--oams-surface-2);
}

.panel-notice {
    margin: 0 0 12px;
}

/* An error is red, and says so in words, not only in a color (principle 6). */
.notice.tone-error {
    color: var(--oams-error);
}
</style>
