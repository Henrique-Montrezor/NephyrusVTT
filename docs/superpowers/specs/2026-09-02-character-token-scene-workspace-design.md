# Fichas, tokens e cenas — reformulação do espaço de jogo

## Objetivo

Transformar fichas, tokens e cenas em um único fluxo compreensível: o Mestre cria fichas a partir do modelo da campanha, vincula imagens e estágios ao personagem, arrasta o token para a cena e conduz iniciativa e mudanças visuais sem perder estado.

## Princípios

- Reaproveitar os serviços, WebSocket, modal e biblioteca já existentes.
- Persistir automaticamente toda alteração concluída pelo usuário.
- Mostrar no painel de tokens apenas instâncias presentes na cena aberta.
- Manter configurações avançadas em modais amplos, deixando o painel lateral leve.
- Remover extensões de imagem dos nomes sugeridos (`personagem.png` vira `personagem`).

## Fichas

O painel passa a exibir uma coleção de cartões. Cada cartão mostra personagem, proprietário, miniatura do token e última atualização. A ficha abre em modal amplo; a engrenagem abre sua configuração. A coleção aceita várias fichas por jogador e inclui o próprio Mestre como proprietário possível, por meio do membro de campanha do Mestre.

O Mestre terá duas formas de criar:

1. **Montar com o modelo da mesa:** duplica o modelo definido pelo sistema da campanha, conservando campos e PDF, mas iniciando valores vazios.
2. **Importar PDF:** mantém o fluxo atual para uma ficha específica.

O modal da ficha usa as abas `Info`, `Ficha`, `Token` e, somente para o Mestre, ações de configuração. O PDF continua disponível como documento visual; a aba Info é a representação rápida e nativa dos campos mapeados.

## Modelo de fichas

O painel Sistema deixa de mostrar o editor inteiro. Para o Mestre, ele apresenta o modelo ativo e um botão `Configurar modelo`, que abre um modal amplo.

O configurador renderiza o PDF e sobrepõe seus campos. Campos AcroForm sem geometria válida não aparecem como controles dispersos: ficam numa lista de itens não mapeados. O Mestre pode desenhar ou selecionar uma área, nomear o atributo, escolher seu tipo e marcar se ele gera rolagem. Para campos de rolagem, escolhe-se o dado; a fórmula padrão é `{atributo}dN`, de modo que `FOR = 2` e `d20` resulte em `2d20`.

O PDF é a fonte visual; os campos explicitamente mapeados formam a ficha nativa do aplicativo. Sistemas prontos e customizados usam o mesmo contrato de modelo.

## Token do personagem e estágios

As imagens e estágios pertencem à ficha. Cada estágio contém nome, imagem e ordem; por exemplo `1 · Normal`, `2 · Combate`, `3 · Ferido`. A aba Token mostra uma faixa de quadros reorganizável e permite adicionar imagens da Biblioteca. Trocar estágio no mapa atualiza imediatamente a imagem da instância e persiste o estágio ativo.

O token pode ser colocado no mapa por botão ou drag-and-drop a partir do cartão da ficha, da aba Token ou de uma imagem na pasta Tokens da Biblioteca. Ao criar pelo nome do arquivo, a extensão conhecida é removida. O jogador só pode colocar e mover tokens vinculados às próprias fichas; o Mestre controla todos.

Ao terminar de mover ou redimensionar, posição e dimensões são salvas pelo WebSocket. O estado persiste ao reiniciar o aplicativo e ao reabrir a cena. Um indicador discreto informa `Salvando…` e depois `Salvo` somente quando útil.

## Tokens e iniciativa

O painel Tokens representa a cena aberta. A lista pode ser reorganizada por drag-and-drop e cada linha contém miniatura, personagem, estágio, iniciativa e ações de localizar/retirar. A ordem e a iniciativa são persistentes por cena. `Definir iniciativa` abre uma edição compacta para os tokens presentes; empates respeitam a ordem manual.

Selecionar um token no mapa ou na lista revela os botões numerados de estágio. O painel não volta a ser um catálogo global: criação e configuração permanecem na Biblioteca e nas fichas.

## Cenas e estágios de mapa

O painel principal mantém somente os cartões de cena, jogadores direcionados e ações de abrir/publicar/mover. Uma engrenagem no cabeçalho abre as configurações da cena atual com movimento, grid, escala, dimensões e mapas.

Cada cena possui uma faixa ordenada de estágios de mapa. O primeiro representa o estado comum; outros podem representar noite, destruição ou mudanças narrativas. Trocar o estágio atualiza o fundo em tempo real e persiste a seleção. Alterar dimensões continua usando a operação de redimensionamento existente.

## Persistência mínima

- `character_sheets`: acrescenta `token_stages_json`.
- `tokens`: acrescenta `active_stage`, `initiative` e `sort_order`; posição e tamanho existentes continuam sendo usados.
- `scenes`: acrescenta `map_stages_json` e `active_map_stage`.

Os campos JSON têm valores padrão seguros e migração compatível com campanhas existentes. Não serão criadas novas tabelas enquanto listas pequenas ordenadas forem suficientes.

## Fluxo e falhas

REST cria e configura fichas/estágios; WebSocket mantém estado de cena, movimento, tamanho, estágio e iniciativa sincronizados. Atualizações otimistas revertem ao último estado confirmado se o servidor rejeitar a alteração. Mensagens informam a ação que falhou e permitem tentar novamente sem perder o restante do formulário.

## Acessibilidade e layout

Cartões e listas usam ações de pelo menos 44 px em telas estreitas, foco visível e alternativas por botão para todo drag-and-drop. O modal ocupa a maior parte da viewport no desktop e vira uma superfície de tela cheia no celular. A assinatura visual é a faixa de estágios, semelhante a quadros de animação, reutilizada para personagem e mapa.

## Verificação

- Testes de serviço cobrem o Mestre como proprietário, duplicação do modelo, migrações, persistência de posição/tamanho, estágios, iniciativa e ordem.
- Testes de frontend cobrem normalização de nomes, ordenação e seleção de estágio.
- Build, checagem de tipos e suíte atual devem continuar passando.
- Validação no navegador cobre criação de ficha, drag-and-drop, reinício/reabertura, troca de estágio, fila de iniciativa, configurações de cena e responsividade.
