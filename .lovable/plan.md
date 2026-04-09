

# Plano: Refatorar editor de curso com componentes reutilizáveis

## Visão geral

Extrair 2 componentes reutilizáveis (`WizardTabLayout` e `StepCard`), adicionar estado global de edição com dirty tracking, e implementar barra de ações sticky com navegação entre abas. O `CourseFlow.tsx` será migrado para usar esses componentes sem alterar lógica de negócio.

## Componentes novos

### 1. `src/components/editor/WizardTabLayout.tsx`

Layout wrapper com 3 zonas:
- **Esquerda**: tabs + conteúdo (children) com scroll
- **Direita**: preview panel fixo (slot `preview`)
- **Bottom sticky**: barra de ações (Salvar rascunho + Próximo/Publicar)

Props:
```text
tabs: { key, label }[]
activeTab: string
onTabChange: (key) => void
preview: ReactNode
actions: ReactNode (ou props isLastTab, onSaveDraft, onNext, onPublish, canPublish)
children: ReactNode
```

A barra sticky renderiza:
- "Salvar rascunho" (sempre visível)
- "Próximo" (abas 1-3, avança para próxima aba)
- "Publicar curso" (aba 4, desabilitado se checklist falhar)

### 2. `src/components/editor/StepCard.tsx`

Card com numeração visual e indicador de completude.

Props:
```text
stepNumber: number
title: string
description?: string
completed?: boolean
children: ReactNode
```

Renderiza: badge circular numerado, título, descrição, ícone de check se `completed`, e children como conteúdo do card.

### 3. `src/hooks/useProductDraft.ts`

Hook de estado global de edição:

```text
interface ProductDraft {
  productDraft: Record<string, any>   // campos editados
  isDirty: boolean                     // tem mudanças não salvas
  dirtyFields: Set<string>            // quais campos mudaram
  lastSavedAt: Date | null
  updateField(key, value): void       // marca campo como dirty
  markSaved(): void                   // limpa dirty, atualiza lastSavedAt
  reset(initialData): void
}
```

Implementado com `useState` + `useRef` para comparação. Integra com o `useAutosave` existente.

## Migração do CourseFlow

### `CourseFlowInner` (linhas 115-151)

Substituir o layout manual por `WizardTabLayout`:

```tsx
<WizardTabLayout
  tabs={[
    { key: "thumbnail", label: "1. Thumbnail" },
    { key: "checkout", label: "2. Checkout" },
    { key: "course", label: "3. Curso" },
    { key: "options", label: "4. Opções" },
  ]}
  activeTab={tab}
  onTabChange={handleTabChange}
  preview={<MobilePreviewPanel ... />}
  onSaveDraft={() => saveStatus2("draft")}
  onNext={handleNext}
  onPublish={() => saveStatus2("published")}
  isLastTab={tab === "options"}
  canPublish={!hasErrors}
>
  {/* TabsContent permanecem iguais */}
</WizardTabLayout>
```

### Cada Tab interna

Substituir os `<Card>` com numeração manual por `<StepCard>`:

```tsx
// Antes (EditPageSubView, linha 1113-1153):
<Card>
  <CardHeader><span className="...">1</span><CardTitle>Page Description</CardTitle></CardHeader>
  <CardContent>...</CardContent>
</Card>

// Depois:
<StepCard stepNumber={1} title="Page Description" completed={!!title && !!heroUrl}>
  ...campos...
</StepCard>
```

Aplicar o mesmo padrão em ThumbnailTab, CheckoutTab, OptionsTab e ContentTab (seções 1 e 2).

### Navegação entre abas

Adicionar ao `CourseFlowInner`:

```tsx
const tabOrder = ["thumbnail", "checkout", "course", "options"];
const handleNext = () => {
  const idx = tabOrder.indexOf(tab);
  if (idx < tabOrder.length - 1) setTab(tabOrder[idx + 1]);
};
```

A validação por aba (ex: título obrigatório na thumbnail) é feita no `handleNext` antes de avançar — mesma lógica que o DigitalProductFlow já usa (linha 120-128).

### Barra sticky

Renderizada pelo `WizardTabLayout` no bottom:

```tsx
<div className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-4 flex justify-end gap-3">
  <SaveStatusIndicator status={saveStatus} />
  <Button variant="outline" onClick={onSaveDraft}>Salvar rascunho</Button>
  {!isLastTab ? (
    <Button onClick={onNext}>Próximo</Button>
  ) : (
    <Button onClick={onPublish} disabled={!canPublish}>Publicar curso</Button>
  )}
</div>
```

## Arquivos criados/alterados

| Arquivo | Ação |
|---|---|
| `src/components/editor/WizardTabLayout.tsx` | Criar — layout com tabs, preview slot, sticky actions |
| `src/components/editor/StepCard.tsx` | Criar — card numerado reutilizável |
| `src/hooks/useProductDraft.ts` | Criar — estado global de edição com dirty tracking |
| `src/pages/editor/CourseFlow.tsx` | Alterar — migrar para usar os 3 novos componentes |

## O que NÃO muda

- Lógica de CRUD (useAutosave, mutations, reorder)
- Sub-views (editPage, lesson) — apenas envolvidas pelo novo layout
- MobilePreviewPanel — passa como slot para WizardTabLayout
- Regras de negócio (checklist, status, drip)
- Outros flows (DigitalProductFlow, etc.) — podem adotar depois

