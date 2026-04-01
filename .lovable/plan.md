

## Fix: GIF/Image Lightbox closing the entire post modal

### Problem
The lightbox overlay `div` (line 1011) uses `onClick={() => setLightboxImg(null)}`, but the click event **propagates up** to the `Dialog` component, which interprets it as an outside click and closes the entire post modal — sending the user back to the feed.

### Solution — single file change

**`src/components/circle/PostDetailModal.tsx`** (lines 1010-1014):

1. Add `e.stopPropagation()` to the overlay click handler so the event doesn't reach the Dialog
2. Add `e.stopPropagation()` to the inner `<img>` so clicking the image itself doesn't dismiss the lightbox
3. Add an **X close button** (top-right corner) for explicit dismissal

```tsx
{lightboxImg && (
  <div
    className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 cursor-pointer"
    onClick={(e) => { e.stopPropagation(); setLightboxImg(null); }}
  >
    <button
      onClick={(e) => { e.stopPropagation(); setLightboxImg(null); }}
      className="absolute top-4 right-4 text-white/80 hover:text-white ..."
    >
      <X className="h-6 w-6" />
    </button>
    <img
      src={lightboxImg}
      alt=""
      className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
      onClick={(e) => e.stopPropagation()}
    />
  </div>
)}
```

### Files to change
- `src/components/circle/PostDetailModal.tsx` — ~5 lines modified around line 1010

