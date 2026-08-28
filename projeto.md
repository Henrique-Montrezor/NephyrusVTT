# Projeto VTT — Estrutura Completa

> Documento de referência consolidando toda a análise (conselho de 5 perspectivas + pesquisa de mercado) para transferir a um board no Miro.

---

## 1. Visão do Produto

**O que é:** Virtual Tabletop (VTT) web/mobile com hospedagem dual (self-hosted no estilo Foundry + cloud por assinatura), atacando o gap de mercado de suporte mobile robusto e a lacuna de sistemas de RPG indie/não-oficiais.

**Tese central:** Nenhum concorrente relevante combina hoje: (a) suporte mobile de verdade (jogador em paisagem, focado em ficha/tokens/tabuleiro), (b) hospedagem flexível (self-host OU cloud), (c) mesa híbrida 2D + 3D no mesmo produto, (d) importação de sistemas custom via PDF.

**Público primário de entrada:** Mestres de sistemas indie/nacionais mal atendidos pelos grandes VTTs (ex: Ordem Paranormal e similares no mercado lusófono), que hoje improvisam com módulos de terceiros ou soluções manuais.

---

## 2. Panorama Competitivo (referência)

| Concorrente | Força | Fraqueza que você ataca |
|---|---|---|
| **Roll20** | Maior base de usuários, LFG, marketplace | Mobile limitado, interface datada |
| **Foundry VTT** | Customização máxima, pagamento único ($50) | Sem app mobile, hospedagem cai com internet do mestre, setup técnico |
| **Owlbear Rodeo** | Simplicidade, grátis, plugins | Sem automação, sem fichas, sem 3D |
| **Talespire** | Único com mesa 3D real | Sem web/mobile, sem suporte a tokens 2D recortados (recusa oficial), $25/jogador |
| **Alchemy RPG** | Visual cinematográfico | Explicitamente não otimizado para mobile |
| **Quest Portal** | Único concorrente já mobile-first | Sacrifica recursos (sem ficha nativa robusta, sem iluminação dinâmica) |

**Gap validado:** ninguém combina 2D + 3D + mobile + hospedagem flexível + importação de sistema custom.

---

## 3. Estrutura de Produto

### 3.1 Modelos de hospedagem

- **Self-hosted** — pagamento único (licença), no estilo Foundry. Cobre todas as features de código (2D, 3D, iluminação dinâmica, efeitos, importador de sistema). Features com custo variável (IA) exigem chave de API própria do usuário — **nunca incluídas de graça indefinidamente**, para não gerar prejuízo recorrente sobre um pagamento único.
- **Cloud** — assinatura mensal, hospedagem gerenciada por você. Inclui cota de geração de IA por plano.

### 3.2 Tiers (cloud)

| Tier | Nome sugerido (revisar "Dungeon Master" — neutro de sistema) | Conteúdo |
|---|---|---|
| **Standard** ("Adventure") | Entrada | 2D, celular + PC, biblioteca de arquivos/explorer, importador de sistema via PDF custom, fichas preenchíveis |
| **Pro** (renomear, evitar "Dungeon Master") | Intermediário/Premium | Tudo do Standard + mesa 3D, iluminação dinâmica, efeitos de magia, integração OBS, geração de imagens por IA (com cota limitada por mês) |

**Regra crítica de precificação:** separar sempre "custo fixo de código" (3D, iluminação, efeitos → livre em qualquer tier pago) de "custo variável por API" (IA de imagem → cota fixa por período, mesmo no self-hosted via chave própria).

### 3.3 Diferenciais específicos a construir

- Tokens de formatos não padrão (top-down, corpo inteiro — referência: Ordem Paranormal Desconjuração/Calamidade vs. Hexatombe)
- Geração de tokens via IA (feature de aquisição, não de retenção — cuidado com custo)
- Importador de sistema + ficha em PDF preenchível (wedge de entrada para sistemas indie/BR)
- Integração futura com OBS Studio (stream para Twitch/YouTube)

---

## 4. Roadmap por Fases

### Fase 1 — Provar a tese central (MVP)
- VTT 2D, mobile-first para jogador (landscape), desktop para mestre
- Hospedagem dual: self-hosted (licença única) + cloud (assinatura Standard)
- Importador de sistema custom + PDF de ficha preenchível
- **Objetivo:** validar que mobile + sistemas indie é dor real, gerando primeiros pagantes
- **Não incluir ainda:** 3D, IA, OBS, iluminação dinâmica, efeitos

### Fase 2 — Diferencial "matador" (após tração validada)
- Mesa 3D híbrida com suporte a tokens 2D (o gap que nem o Talespire cobre)
- Iluminação dinâmica, efeitos de magia
- Geração de tokens por IA (com sistema de cotas already definido)
- Integração OBS
- Lançar como tier Pro / upgrade de self-hosted

**Por que essa ordem:** lançar 3D antes de validar mobile arrisca contradizer a própria proposta central (3D pesado historicamente roda mal em celular). Validar primeiro com escopo menor e tecnicamente administrável.

---

## 5. Modelo de Monetização

### 5.1 Preços de referência (mercado)
- Self-hosted: licença única, faixa R$ 150–300 (ancorado no Foundry, US$50)
- Cloud Standard: R$ 25–40/mês
- Cloud Pro: R$ 40–60/mês
- (Quem paga é o mestre; jogadores entram grátis — padrão do mercado inteiro)

### 5.2 Unit economics (por mesa/assinante cloud)

| Item | Valor |
|---|---|
| Receita por mesa/mês | R$ 30–50 |
| Custo de infra marginal | R$ 5–15 |
| Custo de processamento de pagamento | R$ 2–4 |
| **Margem bruta por mesa** | **R$ 15–35 (~50–70%)** |

### 5.3 Custos fixos mensais (baseline, poucos usuários)

| Item | Estimativa |
|---|---|
| Servidor/API/banco de dados | R$ 150–500 |
| CDN + storage | R$ 100–400 |
| Domínio, e-mail, certificados | R$ 50–100 |
| Monitoramento/backup | R$ 50–150 |
| **Total fixo mínimo** | **R$ 350–1.150/mês** |

### 5.4 Ponto de equilíbrio
- Só infraestrutura: **~28 mesas pagantes**
- Com pró-labore + marketing mínimo: **~150–300 mesas pagantes ativas**

### 5.5 Cenários de receita anual

| Cenário | Pagantes | Receita/ano |
|---|---|---|
| Conservador (ano 1–2, nicho BR/indie) | 2.000–5.000 | R$ 150 mil – 500 mil |
| Base (ano 2–3, tração validada) | 15.000–30.000 | R$ 1,5 – 4 milhões |
| Otimista (3+ anos, 3D viraliza) | — | R$ 8 – 20 milhões |

**Tratar o cenário conservador como meta real do ano 1** (validação + sustento); tudo acima é upside, não plano de negócio.

---

## 6. Regra de Ouro: Custo de IA

Geração de imagem por IA custa ~US$ 0,01–0,08 por imagem via API. **Sem limite por plano, um único usuário pode custar mais em API do que paga de assinatura.**

- Definir cota de gerações/mês por tier antes de lançar
- Self-hosted: exigir chave de API própria do usuário para features de IA
- Esta é a única peça da precificação capaz de gerar prejuízo recorrente silencioso

---

## 7. Marketing e Divulgação

**Evitar:** anúncios genéricos (Google/Meta Ads) — CAC alto, baixa conversão em nicho fechado como TTRPG.

**Priorizar (baixo custo, alto tempo):**
- Comunidades já existentes: Discord de sistemas indie/BR (Ordem Paranormal etc.), r/rpg, r/FoundryVTT, fóruns BR
- Seeding com criadores pequenos/médios de conteúdo RPG (YouTube/Twitch BR) — acesso antecipado grátis em troca de review
- Orçamento pago inicial, se quiser acelerar: R$ 1.000–3.000/mês em nichos segmentados

---

## 8. Riscos Identificados (e mitigação)

| Risco | Mitigação |
|---|---|
| Escopo grande demais para lançamento único | Fases 1 e 2 separadas — nunca lançar tudo de uma vez |
| 3D pesado não roda bem em mobile | Validar mobile primeiro em 2D antes de investir em 3D |
| Self-hosted canibaliza assinatura Pro | Diferenciação é conveniência (cloud) vs. controle técnico (self-host) — normal e esperado, não é falha |
| IA generativa sem limite quebra margem | Cota fixa por tier + chave própria no self-hosted |
| Nome "Dungeon Master" restringe percepção de neutralidade de sistema | Renomear tier premium para algo sistema-agnóstico |
| Hosting no PC do mestre = ponto único de falha | Aceitável — é característica intrínseca do hobby, não é falha exclusiva do produto (mesmo argumento vale pra sessão presencial sem mestre) |

---

## 9. Próximos Passos Imediatos

1. Validar a dor diretamente com 5–10 mestres reais de sistemas indie/BR (Foundry self-hosted hoje) — perguntar especificamente sobre uso mobile e frustrações de sistema custom
2. Definir política de cota de IA por plano (antes de qualquer definição de preço)
3. Escolher nome de marca/tier neutro para o nível premium
4. Especificar o escopo técnico exato da Fase 1 (2D + mobile + importador PDF + hospedagem dual) como MVP fechado
5. Rascunhar orçamento mensal real (R$ 2.000–5.500/mês) e definir por quanto tempo é sustentável sem receita