
## Live/Aulas ao Vivo — Zoom & Jitsi Providers

### Estado atual
- Sistema de live streams já funciona com YouTube, Twitch e custom embed
- Tabela `community_live_streams` com `embed_type` e `embed_url`
- Viewer com chat em tempo real, contador de espectadores
- Integração com calendário de eventos

### Plano de implementação

#### 1. Migração SQL
- Adicionar novos valores de `embed_type`: suporte a `zoom` e `jitsi`
- Adicionar coluna `access_rule` (all | level | tier | members) e `access_value` na tabela `community_live_streams` para controle de acesso por plano/membro
- Adicionar coluna `recording_password` (opcional, para salas Zoom protegidas)

#### 2. Provider Adapter Layer (`src/lib/liveProviders.ts`)
- Interface `LiveProvider` com métodos: `getEmbedUrl()`, `getJoinUrl()`, `supportsEmbed()`
- Adapters: `ZoomAdapter`, `JitsiAdapter`, `YouTubeAdapter`, `TwitchAdapter`, `CustomAdapter`
- Factory function `getLiveProvider(type, url)` retorna o adapter correto
- Jitsi: embed via iframe (meet.jit.si), sem API key necessária
- Zoom: link direto para join (não embeddable), fallback para "Abrir no Zoom"

#### 3. UI — LiveStreamFormModal
- Adicionar Zoom e Jitsi no seletor de plataforma
- Preview do tipo detectado automaticamente pela URL
- Campo de controle de acesso (dropdown: Todos / Nível / Plano / Membros específicos)

#### 4. UI — LiveStreamViewer (EmbedPlayer)
- Jitsi: embed via iframe com API do Jitsi Meet
- Zoom: botão "Entrar na sala Zoom" (Zoom não permite embed de terceiros)
- Verificação de acesso antes de mostrar o player

#### 5. Arquivos alterados/criados
| Arquivo | Ação |
|---|---|
| Migration SQL | Novas colunas em `community_live_streams` |
| `src/lib/liveProviders.ts` | **Novo** — adapter pattern |
| `src/components/circle/LiveStreamFormModal.tsx` | Zoom/Jitsi no form |
| `src/components/circle/LiveStreamViewer.tsx` | Zoom/Jitsi no player |

#### Critérios de aceite
- ✅ Criar live com Zoom ou Jitsi funcional
- ✅ Jitsi embeddado, Zoom abre em nova aba
- ✅ Controle de acesso por plano/membro
- ✅ Adapter pattern desacoplado — fácil adicionar novos providers
- ✅ Sem regressão em YouTube/Twitch/custom

#### Riscos
- Zoom não permite embed — UX de "abrir em nova aba" é o melhor possível
- Jitsi público (meet.jit.si) pode ter limites de uso; self-hosted é futuro
- Rollback: remover colunas novas + reverter código
