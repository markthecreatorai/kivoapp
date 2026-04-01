

## Fix: Allow sending image-only comments via Enter key

### Problem
The send **button** (line 895) correctly allows sending when images are attached without text. But the **Enter key handler** (line 302) only checks `commentBody.trim()`, so pressing Enter with only images does nothing.

### Solution — single file

**`src/components/circle/PostDetailModal.tsx`**:

Line 302 — change the Enter key condition to also check for images:
```tsx
// Before
if (commentBody.trim()) addComment.mutate({ body: commentBody });

// After
if (commentBody.trim() || commentImages.length > 0) addComment.mutate({ body: commentBody || "📷" });
```

This mirrors the exact logic already used by the send button on line 895.

### Files to change
- `src/components/circle/PostDetailModal.tsx` — 1 line fix

