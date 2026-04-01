

## Simplify PostCard layout + make entire card clickable

### Changes to `src/components/circle/PostCard.tsx`

1. **Make the entire card clickable**: Add `onClick={() => onOpenPost?.(post.id)}` and `cursor-pointer` to the outer `<div>`. Remove the separate clickable wrappers on the avatar and title/body sections.

2. **Stop propagation on interactive elements**: Add `e.stopPropagation()` to the like button, comment button, report dropdown trigger, and poll vote buttons so they don't trigger the card click.

3. **Simplify header to match reference image**:
   - Move the date/time below the display name (second line) instead of inline with badges
   - Show category/space info on the same line as the date
   - Remove `@username` display
   - Layout: name + role badge + level on first line; date + space on second line

4. **Simplify title rendering**: Remove the `group-hover:text-primary` since the whole card is now the click target — keep a subtle hover on the card border instead.

### Visual reference (target layout)
```text
[Avatar]  Name  [Role badge] [Level]
          just now · 💬 Discussion

● Title text here bold
Body preview text truncated...

👍 1   💬 0
```

### Single file change
- `src/components/circle/PostCard.tsx` — ~30 lines modified

