# Lead Magnet — Paridade Sprint 1 (Stan ↔ Kivo)

> Suíte automatizada: `src/test/lead-magnet-parity-sprint1.test.tsx`
> Execução local: `bunx vitest run src/test/lead-magnet-parity-sprint1.test.tsx`

A suíte exercita as **mesmas funções** consumidas pela UI (mappers,
reducer, schemas, migrations, validation, draft service e
`PreviewSurface`). Verde aqui = verde no produto.

---

## Resumo executivo

| Métrica | Valor |
|---|---|
| Casos obrigatórios cobertos | **8 / 8** |
| Paridade funcional Sprint 1 | **100 %** |
| Versão de payload | `leadMagnetConfigVersion = 2` |
| Regressões na suíte do editor | **0** |

---

## Cenários

| # | Cenário (alvo Stan) | Comportamento Kivo | Status |
|---|---|---|---|
| 1 | Criar lead magnet a partir de `/store` (clique único de cartão) | `createProductDraft` lock por `(workspace, format)` + recovery 30 s em `sessionStorage`. Cliques duplicados retornam o **mesmo `productId`**. | ✅ |
| 2 | Editar Visual: alternar URL externa ↔ Upload sem perder valores; fallback quando vazio | `coverSource` separa `thumbnailUploadUrl` / `thumbnailExternalUrl`. Round-trip preserva ambos. Capa vazia gera **warning** (não bloqueia publish). | ✅ |
| 3 | Limites: Título ≤ 50, Subtítulo ≤ 100, CTA ≤ 30; required em Title/CTA | `contentSchema` (Zod) com mensagens pt-BR centralizadas em `CONTENT_MESSAGES`. Boundary aceito; +1 caractere rejeitado. | ✅ |
| 4 | Adicionar e remover campos adicionais (phone/text/choice) sem afetar Nome/Email | `addField` / `removeField` puros; `ensureSystemFields` reposiciona Nome/Email no topo. Remover system field é no-op. | ✅ |
| 5 | Toggle "obrigatório" em campos adicionais; system fields não toggláveis | `setRequired` ignora `is_system: true`. Nome/Email permanecem `is_required: true`. | ✅ |
| 6 | Alternar entrega pós-captura url ↔ file preservando os dois buckets; URL inválida bloqueia publish | `deliveryUrl` / `deliveryFileUrl` independentes. `validateLeadMagnetIntegrity` retorna erro `deliveryUrl.invalid` para protocolos não http(s). | ✅ |
| 7 | Salvar rascunho, recarregar e manter estado | API → state → API → state' produz o mesmo objeto (ignorando `meta`). Versão é re-carimbada em v2. | ✅ |
| 8 | Preview sincronizado nas 3 abas (Visual / Conteúdo / Configuração) | `PreviewSurface` puro, mesmas props que a UI consome. Test-ids cobertos: `preview-thumb`, `preview-title`, `preview-subtitle`, `preview-cta`, `preview-field-name`, `preview-field-email`. | ✅ |

---

## Evidências (payloads)

Cada `it` emite um log estruturado prefixado por `[parity:N]`,
capturado pelo runner. Exemplo (caso 2):

```json
{
  "afterRead": {
    "coverSource": "url",
    "uploadBucket": "https://…/old-upload.png",
    "urlBucket": "https://cdn.exterior.com/external.png"
  },
  "afterSwitch": {
    "effective": "https://…/old-upload.png",
    "mode": "upload"
  },
  "emptyFallback": { "warnings": ["thumbnail.missing"] }
}
```

Para gerar o relatório completo:

```bash
bunx vitest run src/test/lead-magnet-parity-sprint1.test.tsx --reporter=verbose
```

O bloco final imprime:

```
=========== LEAD MAGNET PARITY — SPRINT 1 ===========
Casos cobertos: 8/8
Paridade: 100%
Faltando neste sprint: —
Gaps planejados para sprint 2:
  • Engine completa de drip …
====================================================
```

---

## Gaps remanescentes (Sprint 2)

1. **Drip engine completa** — sequências, agendamento, condições por evento.
2. **Automação externa Pro** — webhooks/native integrations (Mailchimp, ActiveCampaign, RD).
3. **Rich text avançado** no email de confirmação (atualmente texto simples + variáveis).
4. **Builder de opções** para `multiple_choice` / `dropdown` / `checkboxes` com reordenação por drag.
5. **Pré-visualização do email** de confirmação dentro do editor (atual: só preview da página de captura).
6. **A/B test** de CTA e copy do Lead Magnet.
7. **Reviews** — UI parcial existe; falta persistência e moderação.

---

## Como capturar evidências visuais (opcional)

A suíte é puramente programática. Para evidências de UI:

1. Rode `npm run dev`
2. Abra `/store?tab=loja` → "Novo produto" → "Coletar Emails"
3. Capture screenshots por aba (Visual / Conteúdo / Configuração)
4. Anexe ao PR junto com o output do comando vitest acima

> Convenção: nomear `parity-sprint1-caso-N-evidencia.png`.
