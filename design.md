# Design System: FB Crawler Control Center

## 1. Visual Theme & Atmosphere
FB Crawler Control Center is a premium desktop SaaS workbench for operators who manage crawling, grouping, routing, and monetization flows all day. The interface should feel precise, expensive, and calm under pressure.

Atmosphere:
- Premium, professional, dark luxury dashboard
- Dense enough for operational work, but never cramped
- Inspired by Linear, Raycast, Arc Browser, and modern fintech control rooms
- Strong hierarchy, low visual noise, sharp state clarity
- Motion is restrained and utility-first, never playful

Design scores:
- Density: 7/10
- Variance: 4/10
- Motion: 4/10

Core principles:
- Clarity before decoration
- All emphasis must communicate state, importance, or action
- Gold is a premium accent, not a wallpaper color
- Surfaces must separate layers without looking card-heavy
- Tables, forms, logs, and KPI modules must feel like one system

## 2. Brand Direction
The product should read as a high-trust operator console:
- Warm titanium in dark mode for long-session comfort
- Soft wood neutrals in light mode for daylight readability
- Gold communicates authority, focus, and premium value
- Green, amber, blue, and red are reserved for meaning, not decoration

Banned patterns:
- Neon gradients
- Purple glows
- Oversaturated glassmorphism
- Generic AI-dashboard cyan accents
- Over-rounded toy-like components
- Huge floating shadows
- Decorative charts without functional purpose

## 3. Color Palette & Roles

### Dark Mode: Warm Titanium
- `bg.canvas`: `#111315` - Main app background
- `bg.surface`: `#1B1F24` - Primary card, panel, dialog, sidebar surface
- `bg.surface-hover`: `#232830` - Hovered cards, rows, menu items
- `border.default`: `#313843` - Standard dividers and component borders
- `text.primary`: `#F4F1EB` - Main content text
- `text.secondary`: `#B7AEA2` - Secondary labels, metadata, helper copy
- `brand.primary`: `#C8A46B` - Primary CTA fill, active navigation, important focus
- `brand.accent`: `#E4C792` - Premium highlights, selected chips, emphasis text

### Light Mode: Soft Wood
- `bg.canvas`: `#F6F4EF` - Main app background
- `bg.surface`: `#FFFFFF` - Primary cards, tables, dialogs
- `bg.surface-hover`: `#F0EADF` - Hover and selected neutral surface
- `border.default`: `#DDD5C8` - Standard divider and outline color
- `text.primary`: `#2E2A26` - Main content text
- `text.secondary`: `#756E66` - Secondary labels, helper copy, metadata
- `brand.primary`: `#A67C52` - Primary CTA fill, active navigation, important focus
- `brand.accent`: `#C79A6B` - Premium highlights and selected emphasis

### Semantic Status Colors
- `success.dark`: `#56B985`
- `success.light`: `#3E9B68`
- `warning.dark`: `#D9A441`
- `warning.light`: `#B47D23`
- `danger.dark`: `#D46A6A`
- `danger.light`: `#C8555E`
- `info.dark`: `#6F9CD6`
- `info.light`: `#5D7FA8`

### Neutral Support Tokens
- `overlay.dark`: `rgba(7, 8, 10, 0.72)`
- `overlay.light`: `rgba(35, 28, 22, 0.18)`
- `focus.gold.dark`: `rgba(200, 164, 107, 0.28)`
- `focus.gold.light`: `rgba(166, 124, 82, 0.24)`
- `shadow.dark.sm`: `0 6px 18px rgba(0, 0, 0, 0.22)`
- `shadow.dark.md`: `0 16px 40px rgba(0, 0, 0, 0.28)`
- `shadow.dark.lg`: `0 28px 72px rgba(0, 0, 0, 0.34)`
- `shadow.light.sm`: `0 6px 18px rgba(73, 55, 34, 0.08)`
- `shadow.light.md`: `0 16px 40px rgba(73, 55, 34, 0.12)`
- `shadow.light.lg`: `0 28px 72px rgba(73, 55, 34, 0.14)`

## 4. Typography Rules

Font families:
- Display: `Satoshi`, `Geist`, `system-ui`, `sans-serif`
- Body: `Geist`, `system-ui`, `sans-serif`
- Mono: `Geist Mono`, `JetBrains Mono`, `ui-monospace`, `monospace`

Usage rules:
- Headlines use tight tracking and strong weight, not oversized novelty scale
- Body text is neutral and highly readable
- Monospace is mandatory for IDs, logs, ports, KPIs with frequent number changes, timestamps, and tabular data
- Serif fonts are banned for this product
- Inter is banned for this product

Type scale:
- `text-display-1`: `32px / 40px`, weight `700`, tracking `-0.04em`
- `text-display-2`: `28px / 36px`, weight `700`, tracking `-0.035em`
- `text-title-1`: `22px / 30px`, weight `650`, tracking `-0.03em`
- `text-title-2`: `18px / 26px`, weight `650`, tracking `-0.02em`
- `text-body-lg`: `15px / 24px`, weight `450`
- `text-body`: `14px / 22px`, weight `450`
- `text-body-sm`: `13px / 20px`, weight `450`
- `text-label`: `12px / 16px`, weight `600`, tracking `0.02em`
- `text-micro`: `11px / 14px`, weight `600`, tracking `0.06em`

Text hierarchy:
- Primary content uses `text.primary`
- Labels, descriptions, helper text, and timestamps use `text.secondary`
- Gold text is reserved for active state, premium emphasis, and critical summary stats

## 5. Layout, Spacing & Shape

Grid philosophy:
- Desktop-first app shell
- Fixed left rail sidebar
- Scrollable content region
- 12-column content grid for dashboards
- Tables and settings pages may use constrained content widths inside wide panels

Spacing scale:
- `space-1`: `4px`
- `space-2`: `8px`
- `space-3`: `12px`
- `space-4`: `16px`
- `space-5`: `20px`
- `space-6`: `24px`
- `space-7`: `32px`
- `space-8`: `40px`
- `space-9`: `48px`
- `space-10`: `64px`

Radius scale:
- `radius-xs`: `6px`
- `radius-sm`: `8px`
- `radius-md`: `10px`
- `radius-lg`: `12px`
- `radius-xl`: `16px`
- `radius-pill`: `999px`

Border strategy:
- Standard border width is `1px`
- Dividers should be quieter than action outlines
- Use border plus subtle surface separation before using heavy shadows

## 6. Motion & Interaction
Motion should support confidence and productivity:
- Hover transition: `140ms ease`
- Press transition: `80ms ease`
- Focus ring appears immediately
- No bounce
- No elastic overshoot
- No decorative perpetual motion on data surfaces

Motion tokens:
- `dur-fast`: `120ms`
- `dur-base`: `180ms`
- `dur-slow`: `260ms`
- `ease-standard`: `cubic-bezier(0.22, 1, 0.36, 1)`
- `ease-press`: `cubic-bezier(0.4, 0, 1, 1)`

Interaction rules:
- Hover lifts may move by `-1px` at most
- Active press moves by `1px` at most
- Keyboard focus must always be visible
- Disabled components lose saturation and contrast, not only opacity

## 7. Semantic Design Tokens

### CSS Variables
```css
:root,
.theme-dark,
[data-theme="dark"] {
  color-scheme: dark;

  --ds-bg-canvas: #111315;
  --ds-bg-surface: #1b1f24;
  --ds-bg-surface-hover: #232830;
  --ds-bg-surface-elevated: #20252b;
  --ds-bg-surface-muted: #171b20;

  --ds-border-default: #313843;
  --ds-border-strong: #414956;
  --ds-border-soft: rgba(49, 56, 67, 0.58);

  --ds-text-primary: #f4f1eb;
  --ds-text-secondary: #b7aea2;
  --ds-text-muted: #8f877d;
  --ds-text-on-brand: #17120d;

  --ds-brand-primary: #c8a46b;
  --ds-brand-accent: #e4c792;
  --ds-brand-hover: #d7b37a;
  --ds-brand-active: #b69155;
  --ds-brand-soft: rgba(200, 164, 107, 0.16);
  --ds-brand-ring: rgba(200, 164, 107, 0.28);

  --ds-success: #56b985;
  --ds-success-hover: #63c692;
  --ds-success-soft: rgba(86, 185, 133, 0.14);

  --ds-warning: #d9a441;
  --ds-warning-hover: #e5b154;
  --ds-warning-soft: rgba(217, 164, 65, 0.16);

  --ds-danger: #d46a6a;
  --ds-danger-hover: #df7a7a;
  --ds-danger-soft: rgba(212, 106, 106, 0.16);

  --ds-info: #6f9cd6;
  --ds-info-hover: #80a8dc;
  --ds-info-soft: rgba(111, 156, 214, 0.16);

  --ds-overlay: rgba(7, 8, 10, 0.72);
  --ds-shadow-sm: 0 6px 18px rgba(0, 0, 0, 0.22);
  --ds-shadow-md: 0 16px 40px rgba(0, 0, 0, 0.28);
  --ds-shadow-lg: 0 28px 72px rgba(0, 0, 0, 0.34);

  --ds-radius-xs: 6px;
  --ds-radius-sm: 8px;
  --ds-radius-md: 10px;
  --ds-radius-lg: 12px;
  --ds-radius-xl: 16px;
  --ds-radius-pill: 999px;

  --ds-font-display: "Satoshi", "Geist", system-ui, sans-serif;
  --ds-font-body: "Geist", system-ui, sans-serif;
  --ds-font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
}

.theme-light,
[data-theme="light"] {
  color-scheme: light;

  --ds-bg-canvas: #f6f4ef;
  --ds-bg-surface: #ffffff;
  --ds-bg-surface-hover: #f0eadf;
  --ds-bg-surface-elevated: #fbf8f2;
  --ds-bg-surface-muted: #f4efe6;

  --ds-border-default: #ddd5c8;
  --ds-border-strong: #cbbfae;
  --ds-border-soft: rgba(221, 213, 200, 0.72);

  --ds-text-primary: #2e2a26;
  --ds-text-secondary: #756e66;
  --ds-text-muted: #938980;
  --ds-text-on-brand: #fffaf2;

  --ds-brand-primary: #a67c52;
  --ds-brand-accent: #c79a6b;
  --ds-brand-hover: #956d45;
  --ds-brand-active: #825d39;
  --ds-brand-soft: rgba(166, 124, 82, 0.12);
  --ds-brand-ring: rgba(166, 124, 82, 0.24);

  --ds-success: #3e9b68;
  --ds-success-hover: #34895b;
  --ds-success-soft: rgba(62, 155, 104, 0.12);

  --ds-warning: #b47d23;
  --ds-warning-hover: #9f6f1f;
  --ds-warning-soft: rgba(180, 125, 35, 0.14);

  --ds-danger: #c8555e;
  --ds-danger-hover: #b94951;
  --ds-danger-soft: rgba(200, 85, 94, 0.14);

  --ds-info: #5d7fa8;
  --ds-info-hover: #527298;
  --ds-info-soft: rgba(93, 127, 168, 0.14);

  --ds-overlay: rgba(35, 28, 22, 0.18);
  --ds-shadow-sm: 0 6px 18px rgba(73, 55, 34, 0.08);
  --ds-shadow-md: 0 16px 40px rgba(73, 55, 34, 0.12);
  --ds-shadow-lg: 0 28px 72px rgba(73, 55, 34, 0.14);
}
```

### Tailwind Tokens
```js
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        ds: {
          bg: {
            canvas: "var(--ds-bg-canvas)",
            surface: "var(--ds-bg-surface)",
            hover: "var(--ds-bg-surface-hover)",
            elevated: "var(--ds-bg-surface-elevated)",
            muted: "var(--ds-bg-surface-muted)",
          },
          border: {
            DEFAULT: "var(--ds-border-default)",
            strong: "var(--ds-border-strong)",
            soft: "var(--ds-border-soft)",
          },
          text: {
            primary: "var(--ds-text-primary)",
            secondary: "var(--ds-text-secondary)",
            muted: "var(--ds-text-muted)",
            onBrand: "var(--ds-text-on-brand)",
          },
          brand: {
            DEFAULT: "var(--ds-brand-primary)",
            accent: "var(--ds-brand-accent)",
            hover: "var(--ds-brand-hover)",
            active: "var(--ds-brand-active)",
            soft: "var(--ds-brand-soft)",
            ring: "var(--ds-brand-ring)",
          },
          success: {
            DEFAULT: "var(--ds-success)",
            hover: "var(--ds-success-hover)",
            soft: "var(--ds-success-soft)",
          },
          warning: {
            DEFAULT: "var(--ds-warning)",
            hover: "var(--ds-warning-hover)",
            soft: "var(--ds-warning-soft)",
          },
          danger: {
            DEFAULT: "var(--ds-danger)",
            hover: "var(--ds-danger-hover)",
            soft: "var(--ds-danger-soft)",
          },
          info: {
            DEFAULT: "var(--ds-info)",
            hover: "var(--ds-info-hover)",
            soft: "var(--ds-info-soft)",
          },
        },
      },
      fontFamily: {
        display: ['"Satoshi"', '"Geist"', "system-ui", "sans-serif"],
        sans: ['"Geist"', "system-ui", "sans-serif"],
        mono: ['"Geist Mono"', '"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        xs: "var(--ds-radius-xs)",
        sm: "var(--ds-radius-sm)",
        md: "var(--ds-radius-md)",
        lg: "var(--ds-radius-lg)",
        xl: "var(--ds-radius-xl)",
        pill: "var(--ds-radius-pill)",
      },
      boxShadow: {
        "ds-sm": "var(--ds-shadow-sm)",
        "ds-md": "var(--ds-shadow-md)",
        "ds-lg": "var(--ds-shadow-lg)",
      },
      ringColor: {
        brand: "var(--ds-brand-ring)",
      },
      spacing: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
        7: "32px",
        8: "40px",
        9: "48px",
        10: "64px",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.22, 1, 0.36, 1)",
        press: "cubic-bezier(0.4, 0, 1, 1)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "180ms",
        slow: "260ms",
      },
    },
  },
};
```

## 8. Button System

### Shared Button Structure
- Height: `36px` default, `32px` compact, `40px` large
- Horizontal padding: `14px` default
- Radius: `10px`
- Font: `12px`, weight `600`
- Inline gap: `8px`
- Border is always explicit, even on filled buttons

### Variants

#### Primary
- Fill: `brand.primary`
- Text: `text.onBrand`
- Border: `brand.primary`
- Use for main page action, submit, confirm, create

Dark states:
- Hover: `#D7B37A`
- Active: `#B69155`
- Focus: `0 0 0 4px rgba(200, 164, 107, 0.28)`

Light states:
- Hover: `#956D45`
- Active: `#825D39`
- Focus: `0 0 0 4px rgba(166, 124, 82, 0.24)`

#### Secondary
- Fill: `bg.surface`
- Text: `text.primary`
- Border: `border.default`
- Use for safe secondary actions

Hover:
- Fill moves to `bg.surface-hover`
- Border becomes `border.strong`

Active:
- Slightly darker fill
- Translate down `1px`

#### Ghost
- Fill: transparent
- Text: `text.secondary`
- Border: transparent
- Use for toolbar actions, row-level utilities, low-emphasis controls

Hover:
- Fill: `bg.surface-hover`
- Text: `text.primary`

#### Success
- Fill: semantic success
- Text: white or near-white
- Border: same as fill

#### Warning
- Fill: semantic warning
- Text: dark ink in dark mode, white in light mode if contrast requires
- Border: same as fill

#### Danger
- Fill: transparent or soft-danger for low-risk contexts
- Filled danger is reserved for destructive confirmation
- Border: danger tone
- Text: danger tone

#### Info
- Fill: semantic info soft or solid depending importance
- Text: info tone
- Border: info tone or soft border

### Disabled State
- Pointer events disabled
- Text contrast reduced by about 20%
- Border remains visible
- Never reduce opacity below `0.45`

### Focus State
- Always use 4px outer ring
- Focus ring color follows semantic variant where possible
- Keyboard focus must be stronger than hover

## 9. Table System

### Table Container
- Surface: `bg.surface`
- Border: `border.default`
- Radius: `12px`
- Shadow: `shadow-sm` in dark, optional `shadow-sm` in light

### Table Header
- Height: `38px` to `42px`
- Background: subtly differentiated surface
- Text: `text.secondary`
- Font: `11px` to `12px`, weight `600`, uppercase only when density is very high

### Table Row
- Default height: `46px` to `50px`
- Border-bottom: `1px solid border.soft`
- Hover: `bg.surface-hover`
- Selected: `brand.soft` background plus brand border cue
- Active/open row: stronger border or left indicator, not a loud fill

### Table Cell Rules
- Numeric data uses mono
- Metadata and IDs use `text.secondary`
- Row actions stay hidden or low emphasis until hover
- Dense tables should prefer truncation plus tooltip over wrapping

### Sort & Selection
- Sorted column uses brand text or brand underline cue
- Checkbox column remains narrow and consistent
- Bulk action bars use a slightly elevated surface

## 10. Form System

### Field Layout
- Label above input
- Helper text below input
- Error text below helper, never inside placeholder
- Vertical gap: `6px`

### Input / Select / Textarea
- Height: `36px`
- Padding: `0 10px`
- Radius: `10px`
- Surface: `bg.surface` or `bg.surface-muted`
- Border: `border.default`
- Text: `text.primary`

States:
- Hover: border -> `border.strong`
- Focus: border -> `brand.primary`, ring -> `brand.ring`
- Error: border -> `danger`, ring -> danger soft
- Disabled: muted fill, muted text, reduced contrast but still legible

Textarea:
- Min-height: `88px`
- Padding-top: `10px`
- Resize: vertical only

Search fields:
- Can use icon-leading treatment
- Slightly softer background than standard forms

## 11. Badge System

### Badge Base
- Height: `22px`
- Padding: `0 8px`
- Radius: `999px`
- Font: `11px`, weight `600`
- Border: always present

### Variants
- Neutral: muted text, subtle border
- Brand: gold text, gold-soft background
- Success: green text, green-soft background
- Warning: amber text, amber-soft background
- Danger: red text, red-soft background
- Info: blue text, blue-soft background

Use badges for:
- Status summaries
- Queue stage
- Tagging mode or category
- Not for primary CTA replacement

## 12. Alert System

### Alert Base
- Radius: `12px`
- Border: semantic border
- Padding: `14px 16px`
- Layout: icon, title, description

### Variants
- Info: blue soft background, info border
- Success: green soft background, success border
- Warning: amber soft background, warning border
- Danger: red soft background, danger border

Behavior:
- Alerts should be inline and contextual
- Toasts are for transient system feedback
- Critical alerts may pin at top of content region

## 13. Status Colors & Operational Meaning
- `Running`: success
- `Paused`: warning
- `Idle`: neutral
- `Failed`: danger
- `Connected`: success
- `Disconnected`: danger or neutral depending severity
- `Queued`: info or warning depending urgency
- `Review Needed`: warning

Status language rules:
- Color must be backed by icon or label
- Never rely on color alone
- Chips and dots should align with the same semantic token set everywhere

## 14. KPI Cards

### Structure
- Surface: elevated surface with subtle gradient only if it helps depth
- Border: quiet but visible
- Radius: `12px`
- Padding: `16px`
- Min height: `120px` to `128px`

### Content Stack
- Eyebrow label: `text-label`, secondary color
- Value: `28px` to `32px`, display font or strong sans
- Delta: semantic status color
- Footnote: `text-micro` or `text-body-sm`, secondary color

Rules:
- One strong value per card
- At most one delta and one note
- Use mono for IDs or fast-changing numeric widgets
- Avoid overloading KPI cards with action buttons

## 15. Dashboard Cards

Dashboard cards should feel flatter and more structural than marketing cards.

Rules:
- Use border and tonal separation before using strong shadow
- Keep panel headers consistent
- Action buttons in card headers must be ghost or secondary, not primary unless the card is a workflow control
- Charts should use no more than one brand accent plus semantic support colors

Card anatomy:
- Header
- Optional toolbar
- Content area
- Optional footer or status strip

## 16. Data Table Components

Required subcomponents:
- Toolbar
- Search
- Filter select
- Bulk action bar
- Empty state
- Loading skeleton
- Pagination

Empty state:
- Short explanation
- One clear next action
- No giant illustration for dense operator pages

Loading state:
- Skeleton rows matching actual table density
- No generic centered spinner for full tables

Pagination:
- Compact controls
- Current page should have stronger border or fill
- Metadata uses secondary text

## 17. Sidebar Navigation

### Sidebar Shell
- Width: `236px`
- Surface: `bg.surface` with slightly darker depth in dark mode
- Border-right: `1px solid border.default`
- No loud gradients

### Brand Block
- Tight, premium, understated
- Small gold accent mark is acceptable
- Product title should not compete with page title

### Section Labels
- `text-micro`
- Uppercase
- Secondary text
- Generous spacing above section start

### Nav Items
- Height: `42px`
- Radius: `9px`
- Padding-inline: `11px`
- Text: `12px`, weight `500`

States:
- Default: secondary text
- Hover: `bg.surface-hover`, primary text
- Active: brand-soft background, brand text
- Active cue: slim left rail or inset border, not both

### Collapsed Sidebar
- Icon-first
- Tooltip support required
- Active state must remain obvious without relying on label text

## 18. Accessibility & Productivity Rules
- Minimum body size for desktop UI is `13px`
- Touch targets remain at least `36px` even in compact desktop mode
- Contrast must stay above WCAG AA for all text and controls
- Focus rings cannot be disabled
- Keyboard navigation must work across sidebar, filters, dialogs, tables
- Dense screens should still maintain strong scan hierarchy

## 19. Anti-Patterns (Banned)
- Inter as the primary font
- Purple, neon, or cyberpunk accents
- Glassmorphism-heavy cards
- Oversized rounded pills everywhere
- Three equal marketing cards reused as dashboard layout defaults
- Giant shadows that detach panels from the workspace
- Gradient text headlines
- Emoji in core product UI
- Floating labels
- Circular spinner-only loading states for tables
- Decorative charts without exact labeling
- Inconsistent semantic color usage
- Low-contrast placeholder-like body text

## 20. Implementation Notes
- Prefer semantic tokens over raw hex in component CSS
- Keep dark and light themes structurally identical
- Build variants from tokens, not per-component one-off colors
- Sidebar, topbar, forms, tables, dialogs, and KPI cards should all consume the same semantic base tokens

This file is the source of truth for future UI implementation, component refactors, and theme extension work in FB Crawler Control Center.
