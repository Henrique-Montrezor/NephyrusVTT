# Plano de implementação do MVP da Fase 1

## Resultado que define o MVP

O MVP está pronto quando um mestre consegue criar uma campanha, preparar uma cena 2D, importar uma ficha em PDF, convidar jogadores por link e conduzir uma sessão completa. O mestre usa desktop ou tablet. O jogador consegue participar pelo celular em modo paisagem sem instalar um aplicativo.

O fluxo deve funcionar tanto em uma instalação self-hosted quanto no serviço cloud, com a mesma base de código e sem recursos da Fase 2.

## Escopo fechado

### Incluído

- Mesa 2D sincronizada em tempo real
- Mestre em desktop e tablet
- Jogador mobile-first em paisagem
- Cenas, mapas, grid, tokens, chat e dados
- Biblioteca de imagens, áudio e PDF
- Ficha preenchível baseada em PDF
- Importação de um sistema customizado mínimo
- Convite de jogadores por link
- Persistência, reconexão e recuperação da sessão
- Distribuição self-hosted e operação cloud Standard

### Fora do MVP

- Mesa 3D
- Geração por IA
- Iluminação dinâmica
- Efeitos de magia
- Integração OBS
- Marketplace público
- Automação profunda específica de sistemas

## Estado atual auditado

| Área | Estado | Evidência no repositório |
| --- | --- | --- |
| Renderização 2D | Base funcional | PixiJS, câmera, mapa e tokens |
| Tempo real | Base funcional | WebSocket, presença e broadcast por campanha |
| Cenas | Base funcional | criar, renomear, ativar, excluir, grid e tamanho |
| Tokens | Base funcional | adicionar, mover, ocultar, condições e propriedade |
| Mesa | Base funcional | desenho, texto, métricas e ordem de turnos |
| Comunicação | Base funcional | chat, dados 3D e compartilhamento de assets |
| Biblioteca | Parcial | upload de imagem, PDF e áudio, sem organização completa |
| Mobile | Parcial | gestos existem; shell ainda precisava priorizar a mesa |
| Campanhas e acesso | Ausente | identidade e campanha dependem de valores locais |
| Ficha PDF | Ausente | PDF pode ser enviado, mas não vira ficha preenchível |
| Sistema custom | Ausente | não há manifesto, campos ou importador |
| Cloud | Ausente | não há contas, assinatura, provisionamento ou isolamento completo |
| Self-hosted | Parcial | host local e Electron existem, falta empacotamento e onboarding confiáveis |
| Qualidade operacional | Ausente | faltam testes automatizados, observabilidade e backup verificado |

## Backlog priorizado

### P0. Sessão jogável ponta a ponta

- [x] Renderizar cena 2D com câmera e grid
- [x] Sincronizar tokens, chat, dados, desenho e turnos
- [x] Upload e uso básico de mapas e assets
- [ ] Criar tela de entrada com nome do jogador e código da mesa
- [ ] Criar campanha e gerar link de convite revogável
- [ ] Separar permissões de mestre e jogador no servidor, sem confiar em query string
- [ ] Reconectar automaticamente e restaurar o estado após queda de rede
- [ ] Mostrar estados claros de conexão, reconexão e erro

Critério de aceite: três navegadores entram na mesma campanha, um como mestre e dois como jogadores. Após perder a conexão por 30 segundos, todos retornam ao mesmo estado sem recarregar manualmente.

### P0. Experiência mobile do jogador

- [x] Usar a mesa como superfície principal em toda a altura disponível
- [x] Abrir chat, dados e tokens como painel inferior no retrato
- [x] Abrir os mesmos painéis lateralmente no modo paisagem
- [x] Garantir alvos de toque com pelo menos 44 px
- [ ] Implementar modo de jogador com apenas chat, dados, ficha e tokens próprios
- [ ] Criar bandeja rápida do personagem com PV, recurso principal e ações favoritas
- [ ] Testar pan, zoom, seleção e movimento em iOS Safari e Chrome Android
- [ ] Tratar safe areas, teclado virtual, rotação e perda de foco

Critério de aceite: um jogador participa de uma sessão de 60 minutos em um aparelho de 360 x 800 px sem solicitar a versão desktop e sem bloquear a visão do mapa para acessar dados ou chat.

### P0. Campanhas, identidade e autorização

- [ ] Modelar usuário, campanha, membro, convite e papel
- [ ] Criar autenticação local simples para self-hosted
- [ ] Criar autenticação por e-mail ou provedor para cloud
- [ ] Aplicar autorização em todos os handlers HTTP e WebSocket
- [ ] Isolar assets, cenas e mensagens por campanha
- [ ] Registrar ações administrativas básicas do mestre

Critério de aceite: um jogador não consegue ler ou alterar recursos de outra campanha nem executar mensagens reservadas ao mestre manipulando chamadas de rede.

### P0. Ficha PDF preenchível

- [ ] Fazer upload de um PDF e detectar páginas e campos AcroForm existentes
- [ ] Permitir posicionar campos sobre PDFs sem formulário
- [ ] Suportar texto, número, checkbox, área longa e imagem de personagem
- [ ] Salvar valores por personagem sem alterar o PDF original
- [ ] Sincronizar somente campos marcados como públicos
- [ ] Exportar uma cópia preenchida
- [ ] Oferecer navegação e zoom utilizáveis no celular

Critério de aceite: o mestre importa uma ficha de sistema indie, define pelo menos dez campos e entrega uma cópia editável a um jogador. Os dados persistem entre sessões e podem ser exportados.

### P0. Sistema customizado mínimo

- [ ] Definir manifesto versionado do sistema
- [ ] Mapear atributos, recursos, rolagens e referências à ficha
- [ ] Criar editor guiado para dados e fórmulas simples
- [ ] Validar fórmulas sem executar código arbitrário
- [ ] Exportar e importar um pacote do sistema
- [ ] Incluir um sistema de exemplo com licença compatível

Critério de aceite: uma pessoa sem alterar código importa um PDF, cadastra atributos e cria uma rolagem usando esses atributos.

### P1. Preparação e condução da mesa

- [ ] Organizar biblioteca por pasta, tipo, busca e ordenação
- [ ] Implementar upload em progresso, cancelamento, erro e retry
- [ ] Duplicar cena e manter uma cena de preparação não publicada
- [ ] Adicionar medição compatível com grid quadrado e sem grid
- [ ] Melhorar seleção múltipla e edição de tokens
- [ ] Persistir histórico relevante de chat e rolagens
- [ ] Criar atalhos de teclado no desktop e equivalentes por toque

Critério de aceite: o mestre prepara e conduz uma aventura curta sem editar arquivos no disco ou reiniciar o servidor.

### P1. Self-hosted pronto para usuário final

- [ ] Empacotar backend, frontend e banco em um instalador por plataforma suportada
- [ ] Criar assistente de primeira execução
- [ ] Exibir diagnóstico de porta, firewall e URL de convite
- [ ] Criar backup e restauração de uma campanha em arquivo único
- [ ] Implementar migrações de banco versionadas e reversíveis
- [ ] Documentar HTTPS e acesso externo com configuração segura
- [ ] Definir atualização do aplicativo sem perda de dados

Critério de aceite: um usuário não técnico instala, cria uma mesa, convida alguém na rede externa e restaura um backup em outra máquina.

### P1. Cloud Standard

- [ ] Provisionar banco, storage e processo de tempo real por ambiente
- [ ] Implementar limite de armazenamento e tamanho de upload
- [ ] Criar assinatura, período de teste e cancelamento
- [ ] Suspender criação sem apagar dados imediatamente após inadimplência
- [ ] Implementar backups automáticos e teste de restauração
- [ ] Adicionar métricas de conexões, latência, erro e uso de storage
- [ ] Definir política de retenção e exclusão de conta

Critério de aceite: uma nova assinatura cria uma mesa acessível publicamente, cobra o plano correto e preserva os dados após reinício e atualização do serviço.

### P1. Qualidade, acessibilidade e lançamento

- [ ] Criar testes unitários para dados, permissões e fórmulas
- [ ] Criar testes de integração para REST e WebSocket
- [ ] Criar testes de fluxo do mestre e do jogador em três viewports
- [ ] Verificar contraste, foco, leitura por teclado e mensagens de erro
- [ ] Definir orçamento de performance para mobile
- [ ] Instrumentar erros do cliente sem coletar conteúdo privado da mesa
- [ ] Publicar termos, privacidade, política de conteúdo e canal de suporte

Critério de aceite: a suíte cobre os fluxos críticos, a versão candidata passa em mobile real e existe um procedimento documentado para incidente e restauração.

## Ordem de execução sugerida

1. Fechar sessão, identidade e permissões
2. Completar a experiência mobile do jogador
3. Entregar ficha PDF preenchível
4. Entregar sistema customizado mínimo
5. Consolidar preparação de mesa e persistência
6. Empacotar self-hosted
7. Provisionar cloud Standard e cobrança
8. Executar hardening, beta fechado e correções de lançamento

## Corte de lançamento

O beta fechado pode começar quando os cinco blocos P0 estiverem aprovados. O lançamento pago exige também self-hosted ou cloud Standard operacional, testes dos fluxos críticos, backup restaurável e políticas básicas publicadas.

Qualquer item da Fase 2 que entrar antes desse corte deve sair do sprint, mesmo que pareça barato. A métrica de sucesso da Fase 1 é uma sessão indie completa e confortável no celular, não a quantidade de recursos demonstráveis.
