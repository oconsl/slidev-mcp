import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { setProjectPath } from "../state.js";
import { spawnAsync } from "../lib/shell.js";
import { validateProjectName } from "../lib/validator.js";
import {
  DEFAULT_THEME,
  DEFAULT_COLOR_SCHEMA,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_TRANSITION,
  DEFAULT_GLOBAL_STYLE_CSS,
} from "../lib/defaults.js";
import { parse } from "../lib/slides-parser.js";

const InitPresentationSchema = z.object({
  project_name: z.string().min(1),
  title: z.string().min(1),
  theme: z.string().optional(),
});

/**
 * Builds the initial slides.md content with global frontmatter and two starter slides.
 * The first slide uses `cover` layout (matching the preferred presentation style).
 */
function buildInitialSlidesmd(title: string, theme?: string): string {
  const resolvedTheme = theme ?? DEFAULT_THEME;

  return [
    `---`,
    `title: "${title.replace(/"/g, '\\"')}"`,
    `theme: ${resolvedTheme}`,
    `colorSchema: ${DEFAULT_COLOR_SCHEMA}`,
    `aspectRatio: "${DEFAULT_ASPECT_RATIO}"`,
    `transition: ${DEFAULT_TRANSITION}`,
    `layout: cover`,
    `class: text-center`,
    `background: https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1920&q=80`,
    `---`,
    ``,
    `# ${title}`,
    ``,
    `---`,
    ``,
    `# Slide 2`,
    ``,
    `Add your content here`,
    ``,
  ].join("\n");
}

/**
 * Builds the package.json content for a new Slidev project.
 */
function buildPackageJson(projectName: string, theme?: string): string {
  const resolvedTheme = theme ?? DEFAULT_THEME;
  const deps: Record<string, string> = {
    "@slidev/cli": "^0.52.0",
    "@slidev/theme-default": "latest",
  };

  if (resolvedTheme !== "default") {
    deps[`@slidev/theme-${resolvedTheme}`] = "latest";
  }

  return JSON.stringify(
    {
      name: projectName,
      version: "0.0.1",
      private: true,
      scripts: {
        dev: "slidev --open",
        build: "slidev build",
        export: "slidev export",
        format: "slidev format",
      },
      dependencies: deps,
    },
    null,
    2
  );
}

// ── Vue component definitions ────────────────────────────────────────────────

/**
 * Returns a map of { filename → content } for all bundled Vue components.
 * These components implement the MCP design system and are automatically
 * registered by Slidev from the project's `components/` directory.
 */
function buildComponentFiles(): Record<string, string> {
  return {
    "CalloutBox.vue": `<!--
  CalloutBox — highlighted callout box, ideal for notes, tips or warnings.

  Props:
    color   : 'violet' | 'teal' | 'amber' | 'green' | 'danger'  (default: 'amber')
    variant : 'border-left' | 'card'  (default: 'card')
    icon    : string emoji (optional)

  Slots:
    default — free HTML content
-->
<template>
  <div class="callout" :class="[\`callout--\${color}\`, \`callout--\${variant}\`]">
    <span v-if="icon" class="callout__icon">{{ icon }}</span>
    <div class="callout__body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  color?: 'violet' | 'teal' | 'amber' | 'green' | 'danger'
  variant?: 'border-left' | 'card'
  icon?: string
}>(), {
  color: 'amber',
  variant: 'card',
})
</script>

<style scoped>
.callout {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  border-radius: 8px;
  font-size: 0.88rem;
}

.callout--card { padding: 0.85rem 1rem; }

.callout--border-left {
  padding: 1rem 1.25rem;
  border-radius: 0 8px 8px 0;
}

.callout--card.callout--violet { background: rgba(124,106,247,0.08); border: 1px solid rgba(124,106,247,0.25); }
.callout--card.callout--teal   { background: rgba(79,209,197,0.08);  border: 1px solid rgba(79,209,197,0.25);  }
.callout--card.callout--amber  { background: rgba(246,173,85,0.08);  border: 1px solid rgba(246,173,85,0.25);  }
.callout--card.callout--green  { background: rgba(104,211,145,0.08); border: 1px solid rgba(104,211,145,0.25); }
.callout--card.callout--danger { background: rgba(252,129,129,0.08); border: 1px solid rgba(252,129,129,0.25); }

.callout--border-left.callout--violet { background: rgba(124,106,247,0.08); border-left: 4px solid #7c6af7; }
.callout--border-left.callout--teal   { background: rgba(79,209,197,0.08);  border-left: 4px solid #4fd1c5; }
.callout--border-left.callout--amber  { background: rgba(246,173,85,0.08);  border-left: 4px solid #f6ad55; }
.callout--border-left.callout--green  { background: rgba(104,211,145,0.08); border-left: 4px solid #68d391; }
.callout--border-left.callout--danger { background: rgba(252,129,129,0.08); border-left: 4px solid #fc8181; }

.callout__icon {
  font-size: 1rem;
  flex-shrink: 0;
  margin-top: 0.1rem;
}

.callout__body {
  flex: 1;
}
</style>
`,

    "InfoCard.vue": `<!--
  InfoCard — information card with semi-transparent colored background.

  Props:
    color    : 'violet' | 'teal' | 'amber' | 'green' | 'danger' | 'muted'  (default: 'violet')
    icon     : string emoji or text (optional)
    title    : string (optional)
    size     : 'sm' | 'md' | 'lg'  (default: 'md')
    center   : boolean              (default: false)

  Slots:
    default  — free body content
    icon     — icon override
    title    — title override
-->
<template>
  <div
    class="info-card"
    :class="[\`info-card--\${color}\`, \`info-card--\${size}\`, { 'info-card--center': center }]"
  >
    <slot name="icon">
      <div v-if="icon" class="info-card__icon">{{ icon }}</div>
    </slot>
    <slot name="title">
      <div v-if="title" class="info-card__title">{{ title }}</div>
    </slot>
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  color?: 'violet' | 'teal' | 'amber' | 'green' | 'danger' | 'muted'
  icon?: string
  title?: string
  size?: 'sm' | 'md' | 'lg'
  center?: boolean
}>(), {
  color: 'violet',
  size: 'md',
  center: false,
})
</script>

<style scoped>
.info-card {
  border-radius: 8px;
}

.info-card--sm { padding: 0.6rem 0.85rem; }
.info-card--md { padding: 1rem 1.15rem; }
.info-card--lg { padding: 1.25rem 1.5rem; }

.info-card--center { text-align: center; }

.info-card--violet {
  background: rgba(124, 106, 247, 0.08);
  border: 1px solid rgba(124, 106, 247, 0.2);
}

.info-card--teal {
  background: rgba(79, 209, 197, 0.08);
  border: 1px solid rgba(79, 209, 197, 0.2);
}

.info-card--amber {
  background: rgba(246, 173, 85, 0.08);
  border: 1px solid rgba(246, 173, 85, 0.2);
}

.info-card--green {
  background: rgba(104, 211, 145, 0.08);
  border: 1px solid rgba(104, 211, 145, 0.25);
}

.info-card--danger {
  background: rgba(252, 129, 129, 0.08);
  border: 1px solid rgba(252, 129, 129, 0.25);
}

.info-card--muted {
  background: rgba(90, 90, 114, 0.15);
  border: 2px solid rgba(90, 90, 114, 0.4);
}

.info-card__icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.info-card__title {
  font-weight: 700;
  margin-bottom: 0.35rem;
  font-size: 0.95rem;
}

.info-card--green  .info-card__title { color: #68d391; }
.info-card--danger .info-card__title { color: #fc8181; }
.info-card--violet .info-card__title { color: #7c6af7; }
.info-card--teal   .info-card__title { color: #4fd1c5; }
.info-card--amber  .info-card__title { color: #f6ad55; }
</style>
`,

    "MutedText.vue": `<!--
  MutedText — utility text component for descriptions, captions and secondary content.

  Props:
    as     : 'div' | 'p' | 'span'                          (default: 'div')
    size   : 'xs' | 'sm' | 'md'                            (default: 'sm')
    tone   : 'dim' | 'muted' | 'success' | 'danger'        (default: 'dim')
    center : boolean                                         (default: false)

  Slots:
    default — text content
-->
<template>
  <component
    :is="as"
    class="muted-text"
    :class="[
      \`muted-text--\${size}\`,
      \`muted-text--\${tone}\`,
      { 'muted-text--center': center },
    ]"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  as?: 'div' | 'p' | 'span'
  size?: 'xs' | 'sm' | 'md'
  tone?: 'dim' | 'muted' | 'success' | 'danger'
  center?: boolean
}>(), {
  as: 'div',
  size: 'sm',
  tone: 'dim',
  center: false,
})
</script>

<style scoped>
.muted-text--xs { font-size: 0.75rem; }
.muted-text--sm { font-size: 0.88rem; }
.muted-text--md { font-size: 0.95rem; }

.muted-text--dim     { color: var(--color-text-dim); }
.muted-text--muted   { color: var(--color-muted); }
.muted-text--success { color: var(--color-success); }
.muted-text--danger  { color: var(--color-danger); }

.muted-text--center { text-align: center; }
</style>
`,

    "StepItem.vue": `<!--
  StepItem — row with a number/emoji aligned left + title + optional description.
  Useful for step-by-step lists and exercise slides.

  Props:
    number  : string — number emoji (e.g. '1️⃣') or short text
    title   : string
    color   : 'violet' | 'teal' | 'amber' | 'green' | 'danger'  (default: 'violet')

  Slots:
    default — description/subtitle (optional)
-->
<template>
  <div class="step-item" :class="\`step-item--\${color}\`">
    <span class="step-item__number">{{ number }}</span>
    <div class="step-item__body">
      <strong class="step-item__title">{{ title }}</strong>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  number: string
  title: string
  color?: 'violet' | 'teal' | 'amber' | 'green' | 'danger'
}>(), {
  color: 'violet',
})
</script>

<style scoped>
.step-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0.85rem;
  border-radius: 8px;
}

.step-item--violet { background: rgba(124,106,247,0.08); border: 1px solid rgba(124,106,247,0.2); }
.step-item--teal   { background: rgba(79,209,197,0.08);  border: 1px solid rgba(79,209,197,0.2);  }
.step-item--amber  { background: rgba(246,173,85,0.08);  border: 1px solid rgba(246,173,85,0.2);  }
.step-item--green  { background: rgba(104,211,145,0.08); border: 1px solid rgba(104,211,145,0.2); }
.step-item--danger { background: rgba(252,129,129,0.08); border: 1px solid rgba(252,129,129,0.2); }

.step-item__number {
  font-size: 1.5rem;
  width: 2rem;
  flex-shrink: 0;
  text-align: center;
}

.step-item__body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.step-item__title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
}
</style>
`,

    "FeatureItem.vue": `<!--
  FeatureItem — horizontal row with large icon + text block (title + description).
  Ideal for principles, best practices, and rules lists.

  Props:
    icon    : string emoji (required)
    title   : string — bold title
    desc    : string — inline description (avoids Slidev's markdown <p> wrapping)
    color   : 'violet' | 'teal' | 'amber' | 'green' | 'danger' | 'muted'  (default: 'violet')
    size    : 'sm' | 'md'  (default: 'md')

  Tip: use \`desc\` prop to avoid Slidev wrapping slot content in <p>.
  The default slot is still available as fallback for complex content.
-->
<template>
  <div
    class="feature-item"
    :class="[\`feature-item--\${color}\`, \`feature-item--\${size}\`, { 'feature-item--slot': !desc }]"
  >
    <span class="feature-item__icon">{{ icon }}</span>
    <div class="feature-item__body">
      <span v-if="desc">
        <strong v-if="title">{{ title }}</strong>
        <span v-if="title && desc" class="feature-item__sep"> — </span>
        <span class="feature-item__desc">{{ desc }}</span>
      </span>
      <template v-else>
        <strong v-if="title">{{ title }}</strong>
        <slot />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  icon: string
  title?: string
  desc?: string
  color?: 'violet' | 'teal' | 'amber' | 'green' | 'danger' | 'muted'
  size?: 'sm' | 'md'
}>(), {
  color: 'violet',
  size: 'md',
})
</script>

<style scoped>
.feature-item {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  border-radius: 8px;
}

.feature-item--sm { padding: 0.45rem 0.75rem; }
.feature-item--md { padding: 0.75rem 1rem;    }

.feature-item--violet { background: rgba(124,106,247,0.08); border: 1px solid rgba(124,106,247,0.2); }
.feature-item--teal   { background: rgba(79,209,197,0.08);  border: 1px solid rgba(79,209,197,0.2);  }
.feature-item--amber  { background: rgba(246,173,85,0.08);  border: 1px solid rgba(246,173,85,0.2);  }
.feature-item--green  { background: rgba(104,211,145,0.08); border: 1px solid rgba(104,211,145,0.2); }
.feature-item--danger { background: rgba(252,129,129,0.08); border: 1px solid rgba(252,129,129,0.2); }
.feature-item--muted  { background: rgba(90,90,114,0.1);    border: 1px solid rgba(90,90,114,0.25);  }

.feature-item__icon {
  font-size: 1.4rem;
  flex-shrink: 0;
  line-height: 1;
}

.feature-item--sm .feature-item__icon { font-size: 1.15rem; }

.feature-item__body {
  flex: 1;
  line-height: 1.4;
}

.feature-item__sep {
  color: var(--color-text-dim);
}

.feature-item__desc {
  color: var(--color-text-dim);
}

.feature-item--slot .feature-item__body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
</style>
`,

    "FlowNode.vue": `<!--
  FlowNode — flow diagram node: circle with icon, label and sub-label.
  Designed to be used alongside FlowArrow.

  Props:
    icon    : string emoji (required)
    label   : string — node title (required)
    sub     : string — small description (optional)
    color   : 'violet' | 'teal' | 'amber' | 'green' | 'muted'  (default: 'violet')
    size    : 'sm' | 'md'  (default: 'md')
-->
<template>
  <div class="flow-node" :class="[\`flow-node--\${color}\`, \`flow-node--\${size}\`]">
    <div class="flow-node__icon">{{ icon }}</div>
    <strong class="flow-node__label">{{ label }}</strong>
    <p v-if="sub" class="flow-node__sub">{{ sub }}</p>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  icon: string
  label: string
  sub?: string
  color?: 'violet' | 'teal' | 'amber' | 'green' | 'muted'
  size?: 'sm' | 'md'
}>(), {
  color: 'violet',
  size: 'md',
})
</script>

<style scoped>
.flow-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  border-radius: 12px;
}

.flow-node--sm { padding: 0.5rem; width: 5.5rem; }
.flow-node--md { padding: 1rem;   width: 7rem;   }

.flow-node--violet { background: rgba(124,106,247,0.10); border: 2px solid rgba(124,106,247,0.35); }
.flow-node--teal   { background: rgba(79,209,197,0.08);  border: 2px solid rgba(79,209,197,0.35);  }
.flow-node--amber  { background: rgba(246,173,85,0.08);  border: 2px solid rgba(246,173,85,0.35);  }
.flow-node--green  { background: rgba(104,211,145,0.08); border: 2px solid rgba(104,211,145,0.35); }
.flow-node--muted  { background: rgba(90,90,114,0.12);   border: 2px solid rgba(90,90,114,0.35);   }

.flow-node__icon {
  font-size: 1.8rem;
  margin-bottom: 0.25rem;
  line-height: 1;
}

.flow-node--sm .flow-node__icon { font-size: 1.4rem; }

.flow-node__label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text);
}

.flow-node__sub {
  font-size: 0.65rem;
  color: var(--color-text-dim);
  margin-top: 0.2rem;
  line-height: 1.3;
}
</style>
`,

    "FlowArrow.vue": `<!--
  FlowArrow — directional arrow between FlowNodes.
  Use inside a flex container alongside FlowNode components.

  Props:
    color : 'violet' | 'teal' | 'amber' | 'green' | 'muted'  (default: 'violet')
-->
<template>
  <div class="flow-arrow" :class="\`flow-arrow--\${color}\`">→</div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  color?: 'violet' | 'teal' | 'amber' | 'green' | 'muted'
}>(), {
  color: 'violet',
})
</script>

<style scoped>
.flow-arrow {
  display: flex;
  align-items: center;
  font-size: 1.2rem;
  font-weight: 700;
  padding: 0 0.25rem;
  flex-shrink: 0;
}

.flow-arrow--violet { color: rgba(124,106,247,0.7); }
.flow-arrow--teal   { color: rgba(79,209,197,0.7);  }
.flow-arrow--amber  { color: rgba(246,173,85,0.7);  }
.flow-arrow--green  { color: rgba(104,211,145,0.7); }
.flow-arrow--muted  { color: rgba(90,90,114,0.5);   }
</style>
`,

    "ToneBox.vue": `<!--
  ToneBox — minimal tinted container. Simpler than InfoCard, no icon/title.
  Use for inline tinted regions or code-vs-text comparisons.

  Props:
    color   : 'violet' | 'teal' | 'amber' | 'green' | 'danger' | 'muted'  (default: 'violet')
    variant : 'filled' | 'outlined'  (default: 'filled')

  Slots:
    default — free content
-->
<template>
  <div class="tone-box" :class="[\`tone-box--\${color}\`, \`tone-box--\${variant}\`]">
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  color?: 'violet' | 'teal' | 'amber' | 'green' | 'danger' | 'muted'
  variant?: 'filled' | 'outlined'
}>(), {
  color: 'violet',
  variant: 'filled',
})
</script>

<style scoped>
.tone-box {
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
}

.tone-box--filled.tone-box--violet { background: rgba(124, 106, 247, 0.08); }
.tone-box--filled.tone-box--teal   { background: rgba(79, 209, 197, 0.08); }
.tone-box--filled.tone-box--amber  { background: rgba(246, 173, 85, 0.08); }
.tone-box--filled.tone-box--green  { background: rgba(104, 211, 145, 0.08); }
.tone-box--filled.tone-box--danger { background: rgba(252, 129, 129, 0.08); }
.tone-box--filled.tone-box--muted  { background: rgba(90, 90, 114, 0.12); }

.tone-box--outlined.tone-box--violet { background: rgba(124, 106, 247, 0.08); border: 1px solid rgba(124, 106, 247, 0.2); }
.tone-box--outlined.tone-box--teal   { background: rgba(79, 209, 197, 0.08);  border: 1px solid rgba(79, 209, 197, 0.2);  }
.tone-box--outlined.tone-box--amber  { background: rgba(246, 173, 85, 0.08);  border: 1px solid rgba(246, 173, 85, 0.2);  }
.tone-box--outlined.tone-box--green  { background: rgba(104, 211, 145, 0.08); border: 1px solid rgba(104, 211, 145, 0.2); }
.tone-box--outlined.tone-box--danger { background: rgba(252, 129, 129, 0.08); border: 1px solid rgba(252, 129, 129, 0.2); }
.tone-box--outlined.tone-box--muted  { background: rgba(90, 90, 114, 0.12);   border: 1px solid rgba(90, 90, 114, 0.25);  }
</style>
`,

    "LevelCard.vue": `<!--
  LevelCard — centered card for level/tier displays (e.g. AI levels).
  Large number icon, title, tools label, and a mono demo string.

  Props:
    number : string emoji ('1️⃣', '2️⃣', '3️⃣') or label
    title  : string
    tool   : string — example tools label (optional)
    demo   : string — demo string shown in mono box (optional)
    color  : 'muted' | 'violet' | 'teal'  (default: 'muted')
-->
<template>
  <div class="level-card" :class="\`level-card--\${color}\`">
    <div class="level-card__number">{{ number }}</div>
    <strong class="level-card__title">{{ title }}</strong>
    <p v-if="tool" class="level-card__tool">{{ tool }}</p>
    <div v-if="demo" class="level-card__demo">{{ demo }}</div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  number: string
  title: string
  tool?: string
  demo?: string
  color?: 'muted' | 'violet' | 'teal'
}>(), {
  color: 'muted',
})
</script>

<style scoped>
.level-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 1.25rem;
  border-radius: 12px;
}

.level-card--muted  { background: rgba(90,90,114,0.15);   border: 2px solid rgba(90,90,114,0.4);    }
.level-card--violet { background: rgba(124,106,247,0.08);  border: 2px solid rgba(124,106,247,0.35); }
.level-card--teal   { background: rgba(79,209,197,0.08);   border: 2px solid rgba(79,209,197,0.4);   }

.level-card__number {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
  line-height: 1;
}

.level-card__title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}

.level-card__tool {
  font-size: 0.78rem;
  color: var(--color-text-dim);
  margin-top: 0.35rem;
}

.level-card__demo {
  margin-top: 0.65rem;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  width: 100%;
}

.level-card--muted  .level-card__demo { background: rgba(90,90,114,0.3); }
.level-card--violet .level-card__demo { background: rgba(124,106,247,0.15); }
.level-card--teal   .level-card__demo { background: rgba(79,209,197,0.15); }
</style>
`,

    "SkillCard.vue": `<!--
  SkillCard — compact card for skill/tool items in a list.
  Icon + title + optional code example slot.

  Props:
    icon   : string emoji (required)
    title  : string (required)
    color  : 'violet' | 'teal' | 'amber' | 'green'  (default: 'violet')

  Slots:
    default — code line or example below the title
-->
<template>
  <div class="skill-card" :class="\`skill-card--\${color}\`">
    <strong class="skill-card__title">{{ icon }} {{ title }}</strong>
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  icon: string
  title: string
  color?: 'violet' | 'teal' | 'amber' | 'green'
}>(), {
  color: 'violet',
})
</script>

<style scoped>
.skill-card {
  padding: 0.6rem 0.85rem;
  border-radius: 8px;
  font-size: 0.85rem;
}

.skill-card--violet { background: rgba(124,106,247,0.08); border: 1px solid rgba(124,106,247,0.2); }
.skill-card--teal   { background: rgba(79,209,197,0.08);  border: 1px solid rgba(79,209,197,0.2);  }
.skill-card--amber  { background: rgba(246,173,85,0.08);  border: 1px solid rgba(246,173,85,0.2);  }
.skill-card--green  { background: rgba(104,211,145,0.08); border: 1px solid rgba(104,211,145,0.2); }

.skill-card__title {
  display: block;
  margin-bottom: 0.2rem;
  color: var(--color-text);
}
</style>
`,
  };
}

export function registerInitPresentation(server: McpServer): void {
  server.tool(
    "init_presentation",
    "Initialize a new Slidev presentation project. Creates the project directory, installs dependencies, and generates a slides.md file.",
    InitPresentationSchema.shape,
    async (params) => {
      const { project_name, title, theme } = params;
      const resolvedTheme = theme ?? DEFAULT_THEME;

      // Validate project name
      try {
        validateProjectName(project_name);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }

      const workspaceRoot = process.cwd();
      const projectDir = path.resolve(workspaceRoot, project_name);

      // Check for existing directory — attach to it if it already has a slides.md
      if (fs.existsSync(projectDir)) {
        const existingSlidesPath = path.join(projectDir, "slides.md");
        if (fs.existsSync(existingSlidesPath)) {
          // Attach to the existing Slidev project without modifying anything
          setProjectPath(projectDir);
          const slideCount = (() => {
            try {
              const raw = fs.readFileSync(existingSlidesPath, "utf8");
              return parse(raw).slides.length;
            } catch {
              return 0;
            }
          })();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  projectPath: projectDir,
                  attached: true,
                  slideCount,
                  message: `Attached to existing Slidev project at ${projectDir}`,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Error: Directory "${project_name}" already exists at ${projectDir} but contains no slides.md. ` +
                `Remove or rename the directory, or point to an existing Slidev project.`,
            },
          ],
          isError: true,
        };
      }

      try {
        // Create project directory
        fs.mkdirSync(projectDir, { recursive: true });

        // Write package.json
        fs.writeFileSync(
          path.join(projectDir, "package.json"),
          buildPackageJson(project_name, theme),
          "utf8"
        );

        // Write slides.md
        fs.writeFileSync(
          path.join(projectDir, "slides.md"),
          buildInitialSlidesmd(title, resolvedTheme),
          "utf8"
        );

        // Write default global style file (dark minimal palette)
        fs.writeFileSync(
          path.join(projectDir, "style.css"),
          DEFAULT_GLOBAL_STYLE_CSS,
          "utf8"
        );

        // Write bundled Vue components into components/ directory.
        // Slidev auto-registers any .vue file found in components/ — no imports needed.
        const componentsDir = path.join(projectDir, "components");
        fs.mkdirSync(componentsDir, { recursive: true });
        const componentFiles = buildComponentFiles();
        for (const [filename, content] of Object.entries(componentFiles)) {
          fs.writeFileSync(path.join(componentsDir, filename), content, "utf8");
        }

        // Run npm install
        process.stderr.write(
          `[slidev-mcp] Running npm install in ${projectDir}...\n`
        );
        const result = await spawnAsync("npm", ["install"], {
          cwd: projectDir,
        });

        if (result.exitCode !== 0) {
          // Clean up on failure
          fs.rmSync(projectDir, { recursive: true, force: true });
          return {
            content: [
              {
                type: "text",
                text: `Error: npm install failed.\n\nstderr:\n${result.stderr}`,
              },
            ],
            isError: true,
          };
        }

        // Set the project path in state
        setProjectPath(projectDir);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                projectPath: projectDir,
                slideCount: 2,
                theme: resolvedTheme,
                styleFile: path.join(projectDir, "style.css"),
                components: Object.keys(componentFiles),
                message: `Presentation "${title}" initialized at ${projectDir}`,
              }),
            },
          ],
        };
      } catch (err) {
        // Clean up partial directory on unexpected error
        if (fs.existsSync(projectDir)) {
          fs.rmSync(projectDir, { recursive: true, force: true });
        }
        return {
          content: [
            {
              type: "text",
              text: `Error: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
