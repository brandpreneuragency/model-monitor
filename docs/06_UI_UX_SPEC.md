# UI/UX Specification

## Visual direction

A premium technical control panel:

- spacious page layouts
- dense data only inside tables
- strong typographic hierarchy
- restrained borders and color
- light and dark themes
- optional compact table density
- desktop-first, fully responsive monitoring

## Application shell

### Sidebar

- Product mark and name
- Dashboard
- Models
- Subscriptions
- Access Matrix
- Benchmarks
- Imports
- Audit Log
- Settings

### Top bar

- global search
- Create menu
- theme switcher
- owner menu

## Dashboard

### KPI row

- Active subscriptions
- Monthly fixed cost
- Accessible models
- Canonical models
- Needs recheck
- Renewing within 30 days

### Main panels

1. Usage status
2. Upcoming renewals
3. Access coverage
4. Models with multiple access paths
5. Recently updated
6. Data quality warnings

### Data quality warning examples

- renewal date unknown
- access unconfirmed
- missing canonical ID
- score methodology missing
- verification older than threshold
- duplicate alias collision
- imported conflict unresolved

## Model library

### Default columns

- Model
- Developer
- Family
- Lifecycle
- Capability
- Balanced
- Value
- Context
- Vision
- Reasoning
- Speed
- Available through
- Verified
- Recheck

### Table behavior

- sticky model column
- server-side sorting and filtering
- column chooser
- density toggle
- saved views
- multi-select
- row actions
- full keyboard navigation
- empty-state guidance

### Row actions

- Open
- Edit
- Add access
- Duplicate
- Archive
- Merge

## Model detail

### Header

- name
- canonical ID
- developer
- lifecycle badge
- verification state
- Edit action
- More menu

### Tabs

- Overview
- Capabilities
- Scores
- Benchmarks
- Access
- Sources
- History

### Overview cards

- context
- maximum output
- modalities
- reasoning
- tools
- speed
- best use
- avoid for

### Score display

- composite cards
- factor score bars
- rank and eligible-count context
- methodology version
- confidence and override indicator

Never imply that a blank score is zero.

## Subscription list

### Columns

- Provider
- Plan
- Account
- Status
- Regular cost
- Current cost
- Next billing
- Access type
- Included models
- Usage status

### Detail sections

- Billing
- Access and authentication
- Usage and limits
- Included models
- Sources
- Notes
- History

## Access matrix

### Desktop

- frozen model column
- one column per active subscription
- icon plus text cell state
- column header shows plan and monthly cost
- cells open a side panel for edit

### Mobile

- select one model
- show its access cards vertically
- filter by subscription

## Import flow

### Step 1: Upload

- file picker
- supported sheet list
- file checksum
- parser version

### Step 2: Preview

Summary cards:

- new models
- matched models
- updated fields
- possible duplicates
- conflicts
- skipped rows
- validation errors

### Step 3: Resolve

Each conflict displays:

- current value
- imported value
- source sheet/row
- verification date
- resolution choice
- apply-to-similar option

### Step 4: Commit

- final summary
- explicit confirmation
- transaction result
- downloadable import log

## Forms

- Group related fields.
- Mark optional fields explicitly.
- Show source and verification beside researched values.
- Use tri-state controls for supported / unsupported / unknown.
- Warn before changing canonical ID.
- Prevent archive when unresolved merge or import is active.

## Destructive actions

Archive is the primary destructive action.

Permanent deletion requires:

1. danger settings page
2. typed entity name
3. reference impact summary
4. second confirmation
5. audit event
