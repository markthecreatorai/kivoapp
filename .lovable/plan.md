

## Fix: Lives Integration with Events Calendar + Edit Functionality

### Problems Identified

1. **Lives not linked to Events calendar**: When a live is scheduled via `LiveStreamFormModal`, it only inserts into `community_live_streams` but does NOT create a corresponding entry in `community_events`. The Events page (`CircleEvents.tsx`) only queries `community_events`, so scheduled lives never appear there.

2. **Cannot edit live stream**: The `LiveStreamFormModal` is always opened without a `stream` prop in `CircleFeed.tsx` (line 512-517). There's no UI path to pass an existing stream for editing (no edit button on the banner or viewer).

### Plan

#### 1. Link lives to events calendar (LiveStreamFormModal.tsx)
When saving a new live stream, also insert/update a `community_events` record:
- `title` = live title
- `starts_at` = `scheduled_at`
- `ends_at` = `scheduled_at + 2 hours` (default)
- `meeting_url` = embed_url
- `meeting_platform` = embed_type mapped (youtube/twitch → "custom")
- Add a `live_stream_id` reference concept by storing it in the event description or via a new column

Since adding a column to `community_events` requires a migration:

**Migration**: Add `live_stream_id uuid REFERENCES community_live_streams(id)` column to `community_events` (nullable). This links events to their live stream source.

**LiveStreamFormModal.tsx**: After inserting/updating `community_live_streams`, also upsert a `community_events` row with matching data. On edit, update the linked event too. On the existing `onSuccess`, invalidate `circle-events` query (already done).

#### 2. Enable editing lives (LiveStreamBanner.tsx + CircleFeed.tsx)
- **LiveStreamBanner.tsx**: Add an "Editar" button for admins on each live/scheduled banner item
- **CircleFeed.tsx**: Add state `editingStream` and pass it to `LiveStreamFormModal` as the `stream` prop
- **LiveStreamViewer.tsx**: Add "Editar" button for admin while viewing a live

#### 3. Sync edits bidirectionally
- When editing an event that has a `live_stream_id`, show it's linked to a live (read-only indicator)
- When editing a live, update the linked event's title/datetime automatically

### Files to Change
- **New migration**: Add `live_stream_id` column to `community_events`
- **`src/components/circle/LiveStreamFormModal.tsx`**: Create/update linked `community_events` record on save
- **`src/components/circle/LiveStreamBanner.tsx`**: Add edit callback for admins
- **`src/pages/circle/CircleFeed.tsx`**: Wire `editingStream` state, pass `stream` prop to modal
- **`src/components/circle/LiveStreamViewer.tsx`**: Add edit button for admins

