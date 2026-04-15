# HMS — Hospital Management System: Complete UI Design System & Implementation Prompt

> **Purpose**: Drop this file into your project root as `DESIGN.md`. Then tell Claude Code: "Read DESIGN.md and implement [screen/component name]."

---

## 1. Visual Theme & Atmosphere

**Design Philosophy**: "Clinical Clarity" — A healthcare design language that feels trustworthy, organized, and modern. Inspired by the airy light-blue glassmorphism aesthetic of modern hospital dashboards and the clean mobile-first patterns of MedPlus health records app.

**Mood**: Professional yet warm. Light, breathable layouts with generous whitespace. No clutter. Every element earns its place. Feels like walking into a pristine, well-lit modern hospital lobby.

**Density**: Medium — not too sparse (wasted space), not too dense (overwhelming). Dashboard cards breathe. Tables are scannable. Mobile screens focus on one task at a time.

**Platform Consistency Rule**: Web and Android share the SAME design tokens (colors, radii, shadows, spacing scale). Components adapt to platform conventions but visual identity is identical. A user switching between web and Android should feel "this is the same app."

---

## 2. Color Palette & Roles

### Light Mode (Primary)

| Token | Hex | Role |
|---|---|---|
| `--primary-50` | `#EBF5FF` | Page backgrounds, tinted surfaces |
| `--primary-100` | `#D6EBFF` | Card hover states, selected rows |
| `--primary-200` | `#ADD6FF` | Progress bar tracks, light badges |
| `--primary-400` | `#4DA3FF` | Secondary buttons, links |
| `--primary-500` | `#2B7FE0` | Primary buttons, active nav icons, chart bars |
| `--primary-600` | `#1A5FB0` | Primary button hover, focused inputs |
| `--primary-700` | `#0D3F80` | Primary button pressed |
| `--surface-white` | `#FFFFFF` | Cards, modals, inputs |
| `--surface-bg` | `#F0F6FF` | Page background (light blue tint) |
| `--surface-sidebar` | `#FAFCFF` | Sidebar background |
| `--neutral-50` | `#F8FAFC` | Table stripe rows |
| `--neutral-100` | `#F1F5F9` | Dividers, borders |
| `--neutral-200` | `#E2E8F0` | Input borders |
| `--neutral-400` | `#94A3B8` | Placeholder text, muted icons |
| `--neutral-500` | `#64748B` | Secondary text, captions |
| `--neutral-700` | `#334155` | Body text |
| `--neutral-900` | `#0F172A` | Headings, high-emphasis text |
| `--success` | `#10B981` | Healthy status badge, success toasts |
| `--warning` | `#F59E0B` | Elevated status, pending states |
| `--danger` | `#EF4444` | Hospital status badge, errors, delete |
| `--info` | `#3B82F6` | Consultation badge, info toasts |
| `--purple` | `#8B5CF6` | Analytics accent, donut chart segment |
| `--gradient-primary` | `linear-gradient(135deg, #2B7FE0 0%, #60A5FA 100%)` | Primary buttons, hero cards |
| `--gradient-card` | `linear-gradient(180deg, #FFFFFF 0%, #F0F6FF 100%)` | Stat cards background |

### Dark Mode

| Token | Hex | Role |
|---|---|---|
| `--dm-bg` | `#0F1729` | Page background |
| `--dm-surface` | `#1A2332` | Cards, sidebar |
| `--dm-surface-elevated` | `#243044` | Modals, dropdowns, popovers |
| `--dm-border` | `#2D3B4F` | Borders, dividers |
| `--dm-text-primary` | `#F1F5F9` | Headings, primary text |
| `--dm-text-secondary` | `#94A3B8` | Body, captions |
| `--dm-text-muted` | `#64748B` | Placeholders, disabled |
| `--dm-primary` | `#60A5FA` | Primary accent (lighter for contrast) |
| `--dm-primary-hover` | `#93C5FD` | Hover states |
| `--dm-input-bg` | `#1E293B` | Input fields |

**Dark Mode Rule**: All semantic colors (`--success`, `--warning`, `--danger`, `--info`) remain the same hex but get `opacity: 0.9` in dark mode. Primary blue shifts lighter for readability. Backgrounds invert from light-blue to deep navy.

---

## 3. Typography

### Font Stack
- **Headings**: `'Plus Jakarta Sans', 'Inter', sans-serif` — Weight 600–700
- **Body**: `'Inter', 'Segoe UI', sans-serif` — Weight 400–500
- **Mono** (IDs, codes): `'JetBrains Mono', 'Fira Code', monospace` — Weight 400

### Scale

| Token | Size | Weight | Use |
|---|---|---|---|
| `--text-display` | 28px / 1.2 | 700 | Dashboard greeting "Good Morning, Dr. Ashlynn" |
| `--text-h1` | 24px / 1.3 | 700 | Page titles |
| `--text-h2` | 20px / 1.4 | 600 | Section headers, card titles |
| `--text-h3` | 16px / 1.4 | 600 | Sub-section headers |
| `--text-body` | 14px / 1.5 | 400 | Default body text |
| `--text-body-medium` | 14px / 1.5 | 500 | Emphasis body, table cells |
| `--text-small` | 12px / 1.5 | 400 | Captions, timestamps, badges |
| `--text-tiny` | 11px / 1.4 | 500 | Status labels, overline text |
| `--text-stat` | 32px / 1.1 | 700 | Dashboard stat numbers (102, 128, 254) |

### Android Typography
Use the same scale but with Material3 `TextStyle` mapping:
- Display → `headlineLarge`
- H1 → `headlineMedium`
- Body → `bodyMedium` (16sp on Android for readability)
- Small → `bodySmall`

---

## 4. Component Styling

### 4.1 Buttons

```
PRIMARY BUTTON
  background: var(--gradient-primary)
  color: white
  padding: 10px 24px
  border-radius: 10px
  font: 14px/1 weight-600
  shadow: 0 2px 8px rgba(43, 127, 224, 0.3)
  hover: shadow grows, slight scale(1.02)
  active: scale(0.98), darker gradient
  disabled: opacity 0.5, cursor not-allowed

SECONDARY BUTTON
  background: white
  border: 1.5px solid var(--primary-200)
  color: var(--primary-500)
  same padding/radius as primary
  hover: background var(--primary-50)

GHOST BUTTON
  background: transparent
  color: var(--neutral-500)
  hover: background var(--neutral-50)

DANGER BUTTON
  background: var(--danger)
  shadow: 0 2px 8px rgba(239, 68, 68, 0.3)

ICON BUTTON (sidebar, toolbar)
  size: 40px × 40px
  border-radius: 12px
  background: transparent
  hover: background var(--primary-50)
  active: background var(--primary-100)
```

### 4.2 Cards

```
STAT CARD (Dashboard — Total Patient, Overall Room, Appointment)
  background: var(--surface-white)
  border: 1px solid var(--neutral-100)
  border-radius: 16px
  padding: 20px 24px
  shadow: 0 1px 3px rgba(0,0,0,0.04)
  LAYOUT:
    Row: [icon-circle 40px] [spacer] [3-dot menu]
    stat-label: text-small, neutral-500, uppercase tracking-wide
    stat-number: text-stat, neutral-900
    stat-change: text-small, success/danger color, "↑ 12.8% the last month"
    sub-stats: text-small, e.g. "New patient: 48  Old patient: 54"

CONTENT CARD (patient folders, folder files)
  background: var(--surface-white)
  border-radius: 14px
  border: 1px solid var(--neutral-100)
  padding: 16px
  hover: border-color var(--primary-200), shadow 0 4px 12px rgba(43,127,224,0.08)
  transition: all 0.2s ease

FOLDER CARD (grid item in patient folders view)
  aspect-ratio: 1
  border-radius: 14px
  background: var(--surface-white)
  border: 1px solid var(--neutral-100)
  LAYOUT:
    center: folder-icon (40px, colored per folder type)
    below: folder-name (text-body-medium)
    below: folder-id (text-small, mono, neutral-400)
    bottom-right: file-count badge
  hover: lift with shadow, icon scale(1.05)
```

### 4.3 Inputs

```
TEXT INPUT
  height: 44px (web) / 48dp (android)
  background: var(--surface-white)
  border: 1.5px solid var(--neutral-200)
  border-radius: 10px
  padding: 0 14px
  font: text-body
  placeholder: neutral-400
  focus: border-color var(--primary-500), ring 0 0 0 3px rgba(43,127,224,0.1)
  error: border-color var(--danger), ring rgba(239,68,68,0.1)
  error-text: text-small, danger color, below input

SEARCH INPUT
  Same as text input but:
    left-icon: search (neutral-400)
    background: var(--neutral-50) or var(--surface-bg)
    border: none
    border-radius: 12px
    focus: background white, border appears

OTP INPUT (6 boxes)
  6 individual boxes, 48×48px each
  border: 2px solid var(--neutral-200)
  border-radius: 10px
  font: text-h2, center-aligned
  focus: border var(--primary-500)
  filled: background var(--primary-50), border var(--primary-500)
  gap: 8px between boxes
```

### 4.4 Tables (Web — Patient List, Session Viewer)

```
TABLE
  background: var(--surface-white)
  border-radius: 16px
  border: 1px solid var(--neutral-100)
  overflow: hidden

TABLE HEADER
  background: var(--neutral-50)
  font: text-small, weight-600, neutral-500, uppercase, tracking-wider
  padding: 12px 16px
  border-bottom: 1px solid var(--neutral-100)

TABLE ROW
  padding: 14px 16px
  border-bottom: 1px solid var(--neutral-50)
  hover: background var(--primary-50)
  transition: background 0.15s

TABLE CELL — Patient Name
  Row layout: [avatar-circle 36px] [name + email column]
  Name: text-body-medium, neutral-900
  Email: text-small, neutral-400

TABLE CELL — Status Badge
  padding: 4px 12px
  border-radius: 20px (pill)
  font: text-tiny, weight-500
  Variants:
    Hospital: bg rgba(239,68,68,0.1), color #EF4444, dot before text
    Consultation: bg rgba(59,130,246,0.1), color #3B82F6
    Healthy: bg rgba(16,185,129,0.1), color #10B981

PAGINATION
  justify-end
  Page buttons: 32×32px, radius 8px
  Active: bg var(--primary-500), color white
  Inactive: bg transparent, color neutral-500, hover bg neutral-100
  "Previous" / "Next" as text links
```

### 4.5 Sidebar Navigation (Web)

```
SIDEBAR
  width: 72px (collapsed) / 240px (expanded)
  background: var(--surface-white)
  border-right: 1px solid var(--neutral-100)
  padding: 16px 12px
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1)

NAV ITEM
  height: 44px
  border-radius: 12px
  padding: 0 12px
  icon: 20px, neutral-400
  label (when expanded): text-body, neutral-500
  hover: background var(--primary-50), icon and label color var(--primary-500)
  active: background var(--primary-500), icon and label white, shadow

NAV ITEMS (top to bottom):
  1. Dashboard (grid icon)
  2. Patients (users icon)
  3. Calendar (calendar icon) — future
  4. Documents (folder icon)
  5. Settings (gear icon)
  ── divider ──
  Bottom: Profile avatar (40px circle)

ACTIVE INDICATOR: Left 3px rounded bar, primary-500 color, on active item
```

### 4.6 Bottom Navigation Bar (Android)

```
BOTTOM NAV
  height: 64dp
  background: white (light) / dm-surface (dark)
  elevation: 8dp
  border-top: 1px solid neutral-100

NAV ITEM
  icon: 24dp
  label: 11sp, weight-500
  inactive: neutral-400
  active: primary-500, icon filled variant
  indicator: pill shape behind active icon, primary-50 background

ITEMS:
  1. Home (house icon)
  2. Patients (clipboard icon)
  3. Scan (camera icon — center, primary button style, raised)
  4. Profile (user icon)
  5. Settings (gear icon)
```

### 4.7 Dialogs & Modals

```
MODAL OVERLAY
  background: rgba(15, 23, 42, 0.5)
  backdrop-filter: blur(4px)
  animation: fade-in 0.2s ease

MODAL CARD
  background: var(--surface-white)
  border-radius: 20px
  padding: 28px
  max-width: 480px (small) / 640px (medium) / 800px (large)
  shadow: 0 20px 60px rgba(0,0,0,0.15)
  animation: scale from 0.95 + fade-in, 0.25s cubic-bezier(0.4, 0, 0.2, 1)

MODAL HEADER
  h2 title + optional subtitle
  close button (X icon, top-right, ghost button)

MODAL FOOTER
  flex, justify-end, gap 12px
  [Cancel — ghost button] [Confirm — primary button]

CONFIRMATION DIALOG (Delete Hospital)
  Icon: warning triangle in danger-colored circle (48px)
  Title: "Delete Hospital Permanently?"
  Body: warning text
  Input: "Type hospital name to confirm"
  Buttons: [Cancel] [Delete — danger button]

BOTTOM SHEET (Android alternative to modal)
  border-radius: 20dp 20dp 0 0
  drag handle: 40×4dp, neutral-300, center top, 8dp margin
  animation: slide up from bottom, 0.3s
  Same content structure as modal
```

### 4.8 Toasts & Notifications

```
TOAST
  position: top-right (web) / top-center (android)
  background: white
  border-radius: 12px
  border-left: 4px solid [success/danger/warning/info color]
  padding: 14px 16px
  shadow: 0 8px 24px rgba(0,0,0,0.1)
  max-width: 380px
  animation: slide-in from right, 0.3s
  auto-dismiss: 4 seconds
  LAYOUT: [color-icon 20px] [title + message] [close X]
```

### 4.9 Loading States

```
SKELETON SCREEN (preferred over spinners)
  Match exact layout of the content being loaded
  Skeleton blocks: neutral-100 background
  Animation: shimmer gradient sweep left-to-right
    background: linear-gradient(90deg, neutral-100 25%, neutral-50 50%, neutral-100 75%)
    background-size: 200% 100%
    animation: shimmer 1.5s infinite ease-in-out

  Dashboard skeleton: 3 stat cards + chart placeholder + table rows
  Patient list skeleton: 8 row placeholders with avatar circles
  Folder grid skeleton: 8 folder card placeholders

BUTTON LOADING
  Replace text with spinner (16px, white, 2px stroke)
  Keep button same width (prevent layout shift)
  disabled state during loading

PAGE TRANSITION (between routes)
  Subtle fade: opacity 0→1, 0.15s
  No jarring flashes

PROGRESS BAR (file upload)
  height: 4px
  background: neutral-100
  fill: gradient-primary
  border-radius: 2px
  animation: smooth width transition

PULL-TO-REFRESH (Android)
  Material3 circular indicator
  Primary color
```

### 4.10 Empty States

```
EMPTY STATE (no patients, no files, no records)
  Center of content area
  Illustration: simple SVG/Lottie (blue tones, 160×160px)
  Title: text-h3, neutral-700
  Subtitle: text-body, neutral-400
  CTA button: primary or secondary
  
  Examples:
    "No patients yet" → "Add your first patient" button
    "No files in this folder" → "Upload files" button with drag-drop hint
    "No active sessions" → informational text only
```

### 4.11 Dropdown Menus & Popovers

```
DROPDOWN MENU
  background: white
  border: 1px solid neutral-100
  border-radius: 12px
  padding: 6px
  shadow: 0 10px 40px rgba(0,0,0,0.12)
  animation: fade + scale from anchor point, 0.15s
  min-width: 180px

MENU ITEM
  padding: 10px 12px
  border-radius: 8px
  font: text-body
  icon: 16px, left, neutral-400
  hover: background primary-50, color primary-600
  danger variant: hover bg rgba(239,68,68,0.1), color danger

DIVIDER in menu: 1px solid neutral-100, 4px vertical margin

POPOVER (download options, 3-dot menus)
  Same styling as dropdown
  Arrow/caret pointing to trigger element
```

---

## 5. Layout Principles

### Spacing Scale
`4 — 8 — 12 — 16 — 20 — 24 — 32 — 40 — 48 — 64 — 80`

### Web Layout
```
OVERALL LAYOUT
  Sidebar (72px collapsed / 240px expanded) | Main Content
  Main Content: max-width 1400px, centered, padding 24px
  
DASHBOARD GRID
  Stat cards: 3 columns, gap 20px
  Charts row: 2 columns (Analytics chart 60% | Gender donut 40%), gap 20px
  Below: 2 columns (Calendar | Patient table), gap 20px

PATIENT LIST
  Full width table within content area
  Search bar above table, right-aligned "Add Patient" button

FOLDER GRID
  4 columns on desktop, 2 on tablet, 2 on mobile
  gap: 16px

FILE LIST
  Responsive grid: thumbnails at 120px with file info
```

### Android Layout
```
Single column layouts
Content padding: 16dp horizontal
Card margin: 12dp vertical spacing
Bottom nav persistent on main screens
FAB (Floating Action Button): bottom-right, 56dp, for primary actions
```

### Responsive Breakpoints
| Breakpoint | Width | Behavior |
|---|---|---|
| Mobile | < 640px | Single column, bottom nav, stacked cards |
| Tablet | 640–1024px | 2-column grids, collapsed sidebar |
| Desktop | 1024–1440px | Full layout, expanded sidebar option |
| Wide | > 1440px | Content max-width 1400px, centered |

---

## 6. Depth & Elevation

| Level | Shadow | Use |
|---|---|---|
| 0 | none | Flat elements, inline text |
| 1 | `0 1px 3px rgba(0,0,0,0.04)` | Cards at rest, sidebar |
| 2 | `0 4px 12px rgba(0,0,0,0.06)` | Cards on hover, dropdowns |
| 3 | `0 8px 24px rgba(0,0,0,0.1)` | Toasts, popovers |
| 4 | `0 20px 60px rgba(0,0,0,0.15)` | Modals, bottom sheets |

---

## 7. Screen-by-Screen Specification

### 7.1 WEB PORTAL SCREENS

**LOGIN PAGE** (`/login`)
- Split layout: left 55% illustration/gradient, right 45% form
- Left panel: gradient-primary background, hospital illustration, app name "HMS" large
- Right panel: white, centered form card
- Form: email-or-phone input, password input (with eye toggle), "Login" primary button full-width
- Below: "Forgot Password?" link, no register link (registration is Android-only)
- AuthCode step: separate clean screen, 6-box OTP-style input

**DASHBOARD** (`/dashboard`)
- Top bar: "Good Morning, Dr. [Name] 👋" greeting (text-display) + "Your progress this week is Awesome." subtitle
- Top bar right: search input + notification bell + message icon + avatar
- Row 1: 3 stat cards (Total Patient, Overall Room, Appointment) — see card spec above
- Row 2: Analytics bar chart (7-day, blue gradient bars, rounded tops) + Gender donut chart (blue/purple/light-blue)
- Row 3: Monthly Activity calendar + Patient analytics table
- Stat card icons: each in a 40px circle with primary-50 background

**PATIENT LIST** (`/patients` or dashboard section)
- Page title + "Add Patient" primary button (top right)
- Search bar with 350ms debounce
- Table columns: checkbox, NO. ROOM (mono font), PATIENT NAME (avatar + name + email), AGE, DIAGNOSIS, STATUS (badge)
- Pagination: "Displaying 1 to 8 of 100 entries" + page numbers

**PATIENT FOLDERS** (`/patients/:id`)
- Breadcrumb: Dashboard > Patient Name
- Patient header: name + ID (mono badge) + remarks
- Folder grid: 4-column, each folder card with icon + name + ID + file count
- "Add Custom Folder" card (dashed border, + icon)
- Bulk download button in header

**FOLDER FILES** (`/patients/:id/folders/:name`)
- Breadcrumb: Dashboard > Patient Name > Folder Name
- Upload zone: dashed border area, "Drag & drop or click to upload"
- File list: thumbnail/icon + fileName + size + uploadedAt + actions (View, Download, Rename, ⋯)
- Download options dropdown: Individual | As PDF | As ZIP
- Activity Log tab at bottom

**SECURITY SETTINGS** (`/security`)
- AuthCode section: masked code with reveal toggle
- Active Sessions: card list with device icon, platform badge, IP, "This device" label, revoke button
- Change Password: 3-field form in a card

**HOSPITAL PROFILE** (`/profile`)
- Two-column: left = avatar/logo upload area, right = form fields
- Editable: name, email (with OTP badge), phone (with OTP badge), logo
- Read-only: Hospital ID, registration date, T&C status

**ADMIN — HOSPITALS LIST** (`/hospitals`)
- Table: Hospital Name, Email, Phone, Registered Date, Status badge, Actions dropdown
- Search + filter by status

**ADMIN — HOSPITAL DETAIL** (`/hospitals/:id`)
- Profile card + action buttons: Resend Credentials, Disable/Enable toggle, Delete (danger)
- Delete confirmation: modal with type-to-confirm

### 7.2 ANDROID APP SCREENS

**SPLASH → ONBOARDING** (3 swipeable cards like MedPlus)
- Page 1: "Manage Patient Records" + illustration + dot indicator
- Page 2: "Secure Document Storage" + illustration
- Page 3: "Access Anywhere" + illustration
- "Get Started" button (primary, full-width, bottom)
- Skip link top-right

**REGISTRATION** (step-by-step like MedPlus login flow)
- Step 1: Hospital Name input → Continue button
- Step 2: Email input → Continue
- Step 3: Phone number input (with +91 prefix) → Continue
- Step 4: Password + Confirm → Continue
- Step 5: Logo upload (optional) → Continue
- Step 6: T&C checkbox + Review summary → Submit
- OTP verification screen: 6-box OTP, timer, resend link
- All steps: back arrow, progress bar at top (thin, primary color)

**LOGIN** (clean, single-screen)
- "Welcome Back" heading
- Email or Phone input
- Password input with eye toggle
- "Login" primary button full-width
- "Forgot Password?" link below
- "Register" secondary link at bottom
- Biometric shortcut icon if enrolled

**DASHBOARD/HOME** (inspired by MedPlus home)
- Top: greeting + hospital logo small
- Quick Actions: 2 cards side-by-side: "Add Patient" + "Scan Document" (with icons, like MedPlus)
- Recent Patients section: horizontal scroll or list
- Stats row: Total patients, This week's uploads
- Search bar: sticky top on scroll
- FAB: primary, "+" icon → opens quick add bottom sheet
- Sync indicator if offline items pending

**PATIENT LIST** (scrollable list)
- Each row: patient avatar (initials), name, patient ID (mono), created date
- Swipe actions: quick folder access
- Search bar at top

**PATIENT FOLDERS** (grid like web)
- 2-column grid of folder cards
- Each: icon + name + ID + file count badge
- "Add Folder" card (dashed, + icon)
- Top: patient name + ID header

**FOLDER FILES** (list)
- Thumbnail grid or list toggle
- Image files: 120×120 thumbnail
- Non-image: file-type icon
- Per-file: name, size, date
- Actions: long-press → bottom sheet (View, Download, Rename, Delete)
- FAB: camera/upload icon

**ADD RECORD** (inspired by MedPlus "Add Record")
- Image preview strip (horizontal scroll, + add more)
- Inputs: file name, remarks (optional)
- Source selector: Take Photo | Choose from Gallery | Upload File
- "Save" primary button full-width bottom

**PROFILE** (card-style)
- Hospital logo (large, editable)
- Fields: name, email, phone (each with edit icon → OTP flow)
- Read-only fields greyed

**SECURITY SETTINGS**
- Change Password section
- Active Sessions list (card-based)
- Each session: device name, platform icon, IP, last seen, "Revoke" button

**ACTIVITY LOG** (per patient)
- Timeline-style list
- Each entry: action icon, description, timestamp
- Newest first

**NOTIFICATION PREFERENCES**
- Toggle list: 5 categories with switches
- Material3 switch component

**FORCE UPDATE SCREEN**
- Full screen, centered
- App icon + "Update Required" heading
- Message text
- "Update Now" primary button → Play Store

---

## 8. Shared Component Library Reference

### Status Badges
| Status | BG | Text | Dot |
|---|---|---|---|
| Hospital (admitted) | `rgba(239,68,68,0.1)` | `#EF4444` | red |
| Consultation | `rgba(59,130,246,0.1)` | `#3B82F6` | blue |
| Healthy | `rgba(16,185,129,0.1)` | `#10B981` | green |
| Suspended (account) | `rgba(245,158,11,0.1)` | `#F59E0B` | amber |
| Active (account) | `rgba(16,185,129,0.1)` | `#10B981` | green |

### Folder Icons & Colors
| Folder | Icon | Color |
|---|---|---|
| ID | id-card | `#3B82F6` |
| Claim Paper | file-text | `#8B5CF6` |
| Hospital Bills | receipt | `#F59E0B` |
| Discharge Summary | clipboard-check | `#10B981` |
| Hospital Documents | building | `#6366F1` |
| Reports | bar-chart | `#EC4899` |
| Prescriptions & Bills | pill | `#14B8A6` |
| Consent | shield-check | `#F97316` |
| Custom folder | folder | `--primary-500` |

### Chart Styling
```
BAR CHART (Analytics — 7-day)
  Bars: gradient from primary-500 (bottom) to primary-300 (top)
  Bar border-radius: 6px 6px 0 0
  Grid lines: neutral-100, horizontal only
  Labels: text-small, neutral-400
  Tooltip: dark (neutral-900 bg, white text, 8px radius)

DONUT CHART (Gender / Demographics)
  Colors: primary-500, purple, primary-200
  Center: total count + label
  Legend: below, horizontal, dot + label
  Stroke width: 32px
  Gap between segments: 2px
```

---

## 9. Interaction Patterns

### Navigation Transitions
- **Web**: Fade content (0.15s), sidebar stays fixed
- **Android**: Material3 shared-axis forward/backward transitions
- **Tab switches**: Cross-fade (0.2s)

### Pull-to-Refresh (Android)
- Material3 circular indicator, primary color
- Triggers data reload

### Swipe Actions (Android patient list)
- Right swipe: quick view folders (blue bg)
- Left swipe: quick call/action (green bg)

### Drag & Drop (Web file upload)
- Drop zone: dashed 2px border, primary-200
- On drag-over: border primary-500, background primary-50, scale(1.01)
- Files appear as thumbnail strip below

### Search Debounce
- 350ms debounce on keystroke
- Skeleton rows during search
- "No results" empty state if nothing matches

### Form Validation
- Real-time inline validation
- Error appears below field: text-small, danger color
- Success checkmark appears in field for validated emails/phones
- Submit button disabled until all required fields valid

---

## 10. Do's and Don'ts

### DO
- ✅ Use skeleton loaders — NEVER blank screens
- ✅ Use consistent 10-12px border radius on all interactive elements
- ✅ Use the gradient-primary for primary CTAs only (one per screen ideally)
- ✅ Use mono font for all IDs (Patient ID, Folder ID, Room No.)
- ✅ Use status badges with dots + pills, never raw text
- ✅ Maintain 16px minimum touch target padding on mobile
- ✅ Use bottom sheets on Android instead of center modals for contextual actions
- ✅ Animate entrances (stagger cards on dashboard load)
- ✅ Use breadcrumbs on web for 2+ level navigation
- ✅ Match loading patterns: skeleton → content fade-in, everywhere

### DON'T
- ❌ Don't use different border-radius values arbitrarily
- ❌ Don't use spinners as primary loading (skeleton first, spinners for inline actions only)
- ❌ Don't use more than 2 levels of nesting in navigation
- ❌ Don't use raw hex colors — always use CSS variables / design tokens
- ❌ Don't put critical actions in 3-dot menus — surface them directly
- ❌ Don't use different blue shades — stick to the palette
- ❌ Don't use alert() or browser default dialogs — use custom modals
- ❌ Don't use horizontal scroll on tables — make them responsive (card layout on mobile)

---

## 11. Dark Mode Implementation

### Toggle
- Web: system preference detection + manual toggle in nav (sun/moon icon)
- Android: follow system theme + manual toggle in settings

### Strategy
```css
:root { /* light mode tokens */ }
[data-theme="dark"] { /* override with dm- tokens */ }

/* Or media query */
@media (prefers-color-scheme: dark) { ... }
```

### What Changes
- Backgrounds: light-blue → deep navy
- Cards: white → dm-surface
- Text: dark → light (but NOT pure white, use dm-text-primary)
- Borders: neutral-100 → dm-border
- Shadows: reduce opacity by 50% (dark surfaces don't need prominent shadows)
- Primary accent: shifts to lighter blue (--dm-primary)
- Status badges: same colors, slightly adjusted opacity
- Charts: bars get lighter shade, grid lines use dm-border

### What Stays Same
- Border radius values
- Spacing/padding
- Font sizes and weights
- Component structure
- Icon sizes
- Animation timing

---

## 12. Agent Prompt Guide

### Quick Color Reference for AI Agents
```
Page background: #F0F6FF (light) / #0F1729 (dark)
Cards: #FFFFFF / #1A2332
Primary blue: #2B7FE0 / #60A5FA
Text primary: #0F172A / #F1F5F9
Text secondary: #64748B / #94A3B8
Success green: #10B981
Danger red: #EF4444
Warning amber: #F59E0B
```

### Ready-to-Use Implementation Prompts

**Dashboard**: "Build the HMS dashboard page. Light blue (#F0F6FF) background. Three stat cards across top (Total Patient: 102, Overall Room: 128, Appointment: 254) with icons in colored circles. Below: analytics bar chart (7-day, blue gradient bars) and gender donut chart. Use Plus Jakarta Sans for headings, Inter for body. Skeleton loading on mount. Sidebar with icon navigation."

**Patient Table**: "Build a patient list table. Columns: checkbox, Room No (mono font), Patient Name (avatar + name + email), Age, Diagnosis, Status (colored pill badges — Hospital=red, Consultation=blue, Healthy=green). Pagination below. Search bar above. 'Add Patient' primary gradient button top-right."

**Mobile Login**: "Build Android login screen. Clean white background. 'Welcome Back' heading (Plus Jakarta Sans 700). Email-or-phone input + password input with eye toggle. Blue gradient full-width Login button (10px radius). 'Forgot Password?' link below. 'Don't have an account? Register' at bottom. Support dark mode."

**File Upload Dialog**: "Build a file upload modal. Drag-drop zone (dashed border). Selected files appear as thumbnail strip. File name + type + size shown. Upload progress bar (4px, gradient-primary fill). Cancel and Upload buttons in footer."

---

## 13. Technology-Specific Notes

### React (Web Portal)
- Use Tailwind CSS with custom theme extending these tokens
- Use @headlessui/react for modals, dropdowns, transitions
- Use Recharts or Chart.js for dashboard charts
- Framer Motion for page transitions and staggered animations
- React Router DOM 6 for routing

### Kotlin Android
- Material3 theme with custom ColorScheme matching these tokens
- Jetpack Compose for new screens
- Use MaterialTheme.colorScheme.primary = Color(0xFF2B7FE0)
- Surface colors, typography, and shapes defined in Theme.kt
- Accompanist for system UI controller (status bar color)
- Dark theme: isSystemInDarkTheme() + manual toggle stored in DataStore

---

*This DESIGN.md is the single source of truth for all HMS UI implementation. Every screen, component, dialog, loading state, and interaction must conform to these specifications. When in doubt, refer back to this document.*
