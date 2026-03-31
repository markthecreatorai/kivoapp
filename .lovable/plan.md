

## Fix: Community Card Layout — Icon & Title Alignment

**Problem**: The icon and title are in a horizontal row with `-mt-6`, causing the title to sit too close to the banner and appear misaligned. The reference image shows a vertical stack: icon overlapping the banner, then title below it.

**Solution**: Restructure the card body to use a vertical layout matching the reference:

1. Icon centered horizontally, overlapping the banner by ~50% (`-mt-6`)
2. Title centered below the icon with proper spacing
3. Member count + access type centered below the title
4. Description below that
5. "Acessar comunidade" link at bottom

### Changes (single file: `src/pages/circle/MyCommunities.tsx`)

**Lines 229-264** — Restructure the card body:

```
/* Body */
<div className="p-4 pt-0 flex-1 flex flex-col items-center text-center">
  {/* Avatar overlapping banner */}
  <div className="-mt-8 relative z-10 mb-2">
    {icon_url ? (
      <img ... className="h-14 w-14 rounded-xl ... ring-2 ring-background shadow-md" />
    ) : (
      <div ... className="h-14 w-14 rounded-xl ..." />
    )}
  </div>

  <h3 className="font-semibold text-sm ...">{c.name}</h3>
  <div className="flex items-center gap-2 mt-1 text-xs ...">
    {/* member count + access type */}
  </div>

  {c.description && <p className="text-xs mt-2 ...">...</p>}

  <div className="mt-3 pt-3 border-t w-full ...">
    Acessar comunidade >
  </div>
</div>
```

Key differences from current:
- Vertical stack (`flex-col items-center`) instead of horizontal flex row
- Icon in its own centered block with `-mt-8` and `mb-2` for spacing
- Title no longer crammed next to icon — sits below with breathing room
- Role badge stays on the banner (top-right, unchanged)

