

## Restructure CircleSettings to Skool-like sidebar layout

### What changes

Refactor `src/pages/circle/CircleSettings.tsx` from horizontal pill tabs (5 items) to a **left sidebar + main content** layout matching the Skool screenshots, with 10 navigation items.

### Layout structure

```text
┌──────────────────────────────────────────────────┐
│  [Sidebar 220px]  │  [Main content card]         │
│                   │                              │
│  Communities  ◄───│  Content for active section  │
│  Profile          │  inside a single Card        │
│  Affiliates       │                              │
│  Payouts          │                              │
│  Account          │                              │
│  Notifications    │                              │
│  Chat             │                              │
│  Payment methods  │                              │
│  Payment history  │                              │
│  Theme            │                              │
└──────────────────────────────────────────────────┘
```

On mobile: sidebar collapses to a horizontal scrollable list or dropdown at the top.

### Sidebar items (10 tabs)

| Tab | Content | Status |
|---|---|---|
| Communities | List user's communities with icon, name, SETTINGS button, visibility/pin toggles | New — stub with community list from `community_members` |
| Profile | Existing profile form (already built) | Keep as-is |
| Affiliates | Existing `AffiliatesSettings` component | Keep as-is |
| Payouts | Existing `PayoutsSettings` component | Keep as-is |
| Account | Existing account section (email, password, danger zone) | Keep as-is |
| Notifications | Existing notifications toggles + per-community expandable list | Enhance with community-level toggles |
| Chat | Chat preferences: master toggle, email notifications toggle, per-community ON/OFF, blocked users | New — placeholder/stub |
| Payment methods | List saved payment methods, ADD button | New — placeholder/stub |
| Payment history | Payment history table with empty state | New — placeholder/stub |
| Theme | Theme selector (Light/Dark) with SAVE button | New — placeholder/stub |

### Sidebar visual style (matching Skool)
- No icons in sidebar — text only, like Skool screenshots
- Active item: `bg-amber-100/80 text-foreground font-semibold` with left border radius (yellow/gold highlight like Skool)
- Inactive: `text-foreground hover:bg-muted/30`
- Font size: `text-sm`, padding: `px-4 py-2.5`
- No card wrapper on sidebar — clean text list

### Implementation details

**Single file change**: `src/pages/circle/CircleSettings.tsx`

1. Replace the horizontal tab bar (`flex gap-1.5 mb-6 bg-muted/30`) with a sidebar `<aside>` on the left
2. Expand `sectionButtons` array from 5 to 10 items (remove icons, add new section IDs)
3. Wrap layout in `flex` with sidebar (w-56) + main content area (flex-1)
4. Add stub content blocks for the 5 new sections (communities, chat, payment-methods, payment-history, theme) — each renders a Card with title and placeholder content matching the Skool empty states
5. Mobile: sidebar becomes a horizontal scroll strip at top (`flex md:flex-col`)
6. Remove the `max-w-3xl mx-auto` constraint from the outer wrapper since the sidebar layout handles width

### New stub sections content

- **Communities**: Fetch user's communities, render each as a row with icon + name + "SETTINGS" button + eye icon + pin icon
- **Chat**: Master notification toggle, email notifications toggle, "Who can message me?" with per-community ON/OFF dropdown, blocked users section
- **Payment methods**: Title + "ADD PAYMENT METHOD" button + empty state
- **Payment history**: Title + gear icon + "You have no payments." empty state
- **Theme**: Theme select (Light default) + SAVE button

### Files changed
- `src/pages/circle/CircleSettings.tsx` — layout restructure + 5 new stub sections

### What is NOT changed
- Community admin settings (CircleAdminModal) — untouched
- AffiliatesSettings component — untouched
- PayoutsSettings component — untouched
- No new routes or migrations needed
- No permission changes

