

## Fix: Community Landing Auth Modal — Two Bugs

### Bug 1 — "Entrar" button not working

The code at line 240 already has the correct handler: `onClick={() => { setModalMode("login"); setShowJoinModal(true); }}`. However, the button is wrapped in `{!user && ...}` (line 235), so it's hidden when the user is logged in. The button should work for non-authenticated visitors.

**Possible cause**: The button may be visually present but blocked by an overlapping element, or there's a rendering issue. I'll ensure the button works by verifying the onClick is properly wired and check for any CSS/z-index issues. If the code is correct as-is, I'll add a small debugging check.

**Action**: Verify and ensure the onClick handler fires correctly. The code looks correct — this may be a browser cache issue. However, to be safe, I'll make the handler more explicit.

### Bug 2 — "Esqueci minha senha" opens new tab

**Current**: Line 646 uses `<a href="/forgot-password" target="_blank">` which navigates away.

**Fix**: Add a third modal state `"forgot-password"` to the existing `modalMode` state, and replace the `<a>` tag with a button that switches to this new state.

---

### Changes (single file: `src/pages/CommunityLanding.tsx`)

1. **Expand modalMode type** (line 56):
   - Change from `"signup" | "login"` to `"signup" | "login" | "forgot-password"`

2. **Add forgot-password state and handler**:
   - Add state: `forgotEmail`, `forgotLoading`, `forgotSent`
   - Add `handleForgotPassword` function that calls `supabase.auth.resetPasswordForEmail()` (same logic as ForgotPassword.tsx)

3. **Replace the `<a href="/forgot-password">` link** (lines 645-650):
   - Change to `<button onClick={() => setModalMode("forgot-password")}>`

4. **Add third modal view** after the login form (around line 664):
   - Insert a new conditional block for `modalMode === "forgot-password"`:
     - Title: "Esqueceu sua senha?"
     - Subtitle: "Digite seu email e enviaremos um link para redefinir sua senha"
     - Email input field
     - "Enviar link de redefinição" button (primary/red)
     - "← Voltar ao login" link that switches back to `modalMode="login"`
     - Success state: "✅ Email enviado!" message with "← Voltar ao login" button

5. **Reset forgot-password state** when modal closes:
   - In `onOpenChange` or when switching modes, reset `forgotEmail`, `forgotSent`, `forgotLoading`

