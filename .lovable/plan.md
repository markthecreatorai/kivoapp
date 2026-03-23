

## Problem

Multiple file uploads to the `assets` storage bucket fail with RLS policy violation. The policy requires the first folder in the file path to match `auth.uid()`, but several components use incorrect path structures.

**Affected components:**

1. **`ProductDetailsStep.tsx`** — uses `${Date.now()}-${random}.${ext}` (no user ID folder at all)
2. **`SettingsProfile.tsx`** — uses `avatars/${user.id}/...` (first folder is "avatars", not the user ID)

**Working correctly:**
- `ProfileSection.tsx` — uses `${user.id}/${storefront.id}-avatar.${ext}` (correct)

## Plan

### Step 1: Fix `ProductDetailsStep.tsx` upload path
Change the `uploadFile` function to get the current user and prefix the path with `user.id`:

```
const path = `${user.id}/${Date.now()}-${random}.${ext}`;
```

### Step 2: Fix `SettingsProfile.tsx` upload path
Change from `avatars/${user.id}/...` to `${user.id}/avatars/${Date.now()}.${ext}` so the first folder is the user UUID.

### Technical detail
The existing RLS policy on `storage.objects` for the `assets` bucket INSERT operation requires:
```
(storage.foldername(name))[1] = (auth.uid())::text
```
All file paths must start with the authenticated user's UUID as the first directory segment.

