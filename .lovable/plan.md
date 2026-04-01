

## Fix: Link & Video buttons not working in comment toolbar

### Root Cause

Both buttons use `window.prompt()` (lines 864, 875) which is **blocked in iframe/sandbox environments** like the Lovable preview. The browser silently returns `null`, so nothing happens.

### Solution

Replace `prompt()` with **Popover-based inline inputs** (same pattern already used for Emoji and GIF pickers), each with a text input + confirm button.

### Changes — single file

**`src/components/circle/PostDetailModal.tsx`**:

1. Add two new state variables: `showLinkInput` and `showVideoInput` (booleans), plus `linkInputValue` and `videoInputValue` (strings)
2. Replace the Link button (lines 861-869) with a `<Popover>` containing:
   - Text input with placeholder "Cole o link"
   - "Inserir" button that appends URL to `commentBody`
3. Replace the Video button (lines 872-880) with a `<Popover>` containing:
   - Text input with placeholder "Cole o link do vídeo (YouTube, Vimeo, Loom)"
   - "Inserir" button that appends URL to `commentBody`
4. Both popovers use `align="end" side="top"` like the existing emoji/GIF pickers

No other files affected. No database changes.

