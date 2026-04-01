

## Audit: "FREE_WITH_PRODUCT requires linked_product_id" Error

### Root Cause

The error originates from the **trigger `fn_validate_community_pricing`** on the `communities` table. It enforces:

```sql
IF NEW.access_type = 'FREE_WITH_PRODUCT' THEN
  IF NEW.linked_product_id IS NULL THEN
    RAISE EXCEPTION 'FREE_WITH_PRODUCT requires linked_product_id';
  END IF;
END IF;
```

The **`set_community_pricing_model_v2` RPC** backward-compat section maps two models to `FREE_WITH_PRODUCT`:

- **`freemium`** → sets `linked_product_id` from the first paid tier's `linked_product_id`, which may be `NULL` if the user didn't pick a product.
- **`tiers`** → sets `linked_product_id = NULL` **always**, guaranteed to fail.

So any save of "tiers" model fails, and "freemium" without a linked product also fails.

### Fix Plan

**1. Migration: Update `set_community_pricing_model_v2` backward-compat logic**

For models that use the new tier system, stop forcing legacy `access_type` values that trigger validation errors:

| Model | Current mapping | Fixed mapping |
|-------|----------------|---------------|
| `tiers` | `FREE_WITH_PRODUCT`, `linked_product_id = NULL` | `PAID_SUBSCRIPTION`, `price_cents = 0`, `linked_product_id = NULL` |
| `freemium` | `FREE_WITH_PRODUCT`, `linked_product_id = first_paid` | Keep if product exists; use `OPEN` if no product linked |

Alternatively (simpler and more future-proof): **relax the trigger** to allow `FREE_WITH_PRODUCT` without `linked_product_id` when `community_tiers` exist for that community. This avoids fragile mapping logic.

**Recommended approach**: Update the trigger to skip the `linked_product_id` check when active `community_tiers` exist:

```sql
IF NEW.access_type = 'FREE_WITH_PRODUCT' THEN
  IF NEW.linked_product_id IS NULL THEN
    -- Allow if community has active tiers (new system)
    IF NOT EXISTS (
      SELECT 1 FROM community_tiers
      WHERE community_id = NEW.id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'FREE_WITH_PRODUCT requires linked_product_id';
    END IF;
  END IF;
END IF;
```

**2. Additionally fix `set_community_pricing_model_v2` 'tiers' case**

Change the `tiers` backward-compat to use `OPEN` instead of `FREE_WITH_PRODUCT` when no single linked product exists, since access is now governed entirely by the tier system:

```sql
WHEN 'tiers' THEN
  UPDATE communities SET
    access_type = 'OPEN',
    price_cents = 0,
    billing_period = 'monthly',
    linked_product_id = NULL,
    updated_at = now()
  WHERE id = p_community_id;
```

### Files to Change

- **New migration**: 
  - Replace `fn_validate_community_pricing` trigger function with the relaxed version
  - Replace `set_community_pricing_model_v2` with fixed backward-compat for `tiers` and `freemium`

### No frontend changes needed

The UI code in `AdminPricingTab.tsx` correctly builds the payload. The bug is entirely server-side.

