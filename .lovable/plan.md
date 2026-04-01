

## Fix: GIF sent as text URL instead of visual attachment

### Problem
Line 888: GIF selection appends the URL to `commentBody` as plain text. It should instead be added to `commentImages` so it renders visually like an image attachment.

### Solution — single file change

**`src/components/circle/PostDetailModal.tsx`** (line 887-889):

Change the GIF `onSelect` handler from appending to `commentBody` to pushing the GIF URL into `commentImages`:

```tsx
// Before
setCommentBody((prev) => prev + (prev ? " " : "") + gifUrl);

// After
setCommentImages((prev) => [...prev, gifUrl]);
```

This reuses the existing image preview/rendering pipeline — GIF URLs will display as visual thumbnails before sending, and get stored in the `images` array column on `community_comments`, just like uploaded photos.

### Files to change
- `src/components/circle/PostDetailModal.tsx` — 1 line change in GIF picker `onSelect`

