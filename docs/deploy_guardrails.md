# Deploy Guardrails (anti-break)

Use this flow for every release from Lovable/GitHub:

1. Open a branch (never push hotfixes direto na main).
2. Before merge, require green **Quality Gate** (tests + production build).
3. Use Vercel Preview URL to smoke-test:
   - login
   - dashboard
   - product page
   - checkout page load
4. Only then merge to main.
5. After production deploy, run 2-minute smoke in PRD:
   - open home
   - login
   - open one protected route
   - open checkout

## Required branch protections

In GitHub Branch Protection for `main`:
- Require pull request before merge
- Require status checks to pass before merging
- Required check: `build-test`
- Disallow force push

## Emergency rollback

If production breaks:
1. Revert last merge commit in GitHub
2. Redeploy previous healthy commit in Vercel
3. Open incident note with root cause + preventive action
