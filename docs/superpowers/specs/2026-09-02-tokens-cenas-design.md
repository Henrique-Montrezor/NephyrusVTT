# Tokens persistentes e direção de cenas

## Objetivo

Permitir que o Mestre crie tokens personalizados persistentes, vincule cada token a uma ficha e a um jogador, e organize mapas como cenas independentes. O Mestre poderá mover todo o grupo ou participantes específicos entre cenas. Jogadores poderão colocar, mover e redimensionar apenas os tokens sob seu controle.

## Escopo

Esta entrega inclui:

- catálogo persistente de tokens da campanha;
- imagem personalizada proveniente da biblioteca da campanha;
- vínculo opcional com uma ficha e um jogador;
- token fora da mesa ou colocado em exatamente uma cena;
- drag and drop de tokens próprios para a cena atual;
- persistência de posição e dimensões;
- cenas separadas com mapas próprios;
- preparação privada de cenas pelo Mestre;
- cena padrão da campanha;
- atribuição individual de participantes a cenas;
- indicação de participantes presentes em cada cena.

Esta entrega não retoma o editor de modelo de ficha ou o sistema customizado de regras.

## Modelo de domínio

### Token

`Token` passa a pertencer diretamente à campanha. Seus vínculos serão:

- `campaign_id`: obrigatório;
- `scene_id`: opcional, pois um token pode estar disponível fora da mesa;
- `owner_id`: participante que pode controlar o token, opcional;
- `sheet_id`: ficha associada, opcional;
- `image_url`: asset de token pertencente à mesma campanha, opcional;
- posição, dimensões, camada, visibilidade, bloqueio, luz e condições existentes.

Um token pode estar em no máximo uma cena. Colocá-lo em outra cena atualiza o próprio registro em vez de criar uma cópia.

Ao selecionar uma ficha durante a criação ou edição, o servidor usa o dono da ficha como responsável pelo token. O Mestre pode manter tokens sem ficha ou sem responsável. Um jogador nunca pode assumir propriedade de um token por conta própria.

### Participante e cena atual

`CampaignMember` recebe `current_scene_id`, opcional. A cena efetiva de um jogador é:

1. sua `current_scene_id`, quando definida;
2. a cena padrão da campanha, quando não existe atribuição individual.

A cena padrão continua representada por `Scene.is_active` para preservar compatibilidade.

Ao levar todo o grupo para uma cena:

- essa cena torna-se a única cena padrão;
- atribuições individuais dos jogadores são removidas;
- todas as sessões conectadas recebem imediatamente o novo estado.

Ao mover jogadores selecionados:

- apenas os participantes escolhidos recebem `current_scene_id`;
- todas as sessões desses participantes recebem imediatamente o novo estado;
- os demais continuam nas cenas atuais.

O Mestre pode abrir qualquer cena para preparação sem mudar sua própria atribuição ou a dos jogadores. O `scene_id` da conexão do Mestre representa somente a cena que ele está visualizando.

## Migração de dados

A migração SQLite deverá preservar tokens existentes:

1. adicionar `campaign_id` a partir da campanha da cena atual;
2. tornar `scene_id` anulável;
3. adicionar `sheet_id` anulável;
4. manter posição, dimensões, imagens e demais propriedades;
5. adicionar `current_scene_id` anulável aos participantes.

Como SQLite não remove a restrição `NOT NULL` diretamente, a migração de `tokens` deverá reconstruir a tabela em transação, copiar os dados e recriar índices. A migração será idempotente e coberta por teste com banco legado.

## Serviços e protocolo

### Catálogo de tokens

O backend fornecerá uma lista de tokens da campanha contendo estado de colocação, cena, responsável e ficha. Jogadores recebem somente tokens cujo `owner_id` corresponde à identidade autenticada. O Mestre recebe todos.

Operações:

- criar token, somente Mestre;
- editar imagem, nome, ficha e responsável, somente Mestre;
- colocar ou transferir token, Mestre ou dono;
- mover e redimensionar, Mestre ou dono;
- retirar da mesa, somente Mestre;
- excluir token, somente Mestre.

O evento de colocação recebe `token_id`, `scene_id`, `x` e `y`. Para jogadores, o servidor valida que:

- o token pertence ao jogador;
- a cena solicitada é sua cena efetiva;
- token, ficha, asset e cena pertencem à mesma campanha.

Depois de uma transferência, clientes que observavam a cena anterior recebem `token:remove`; clientes da nova cena recebem `token:add`; o catálogo recebe a versão atualizada.

### Direção de cenas

O resumo de cada cena incluirá participantes efetivamente presentes. O protocolo terá operações separadas para:

- tornar uma cena padrão e levar o grupo;
- atribuir uma lista de participantes a uma cena;
- abrir uma cena somente para preparação do Mestre.

O servidor deriva a audiência de cada mensagem da campanha, cena e identidade autenticada. Um jogador não pode solicitar ou receber o estado de outra cena.

## Interface

### Régua de cenas

O painel do Mestre usará uma lista vertical compacta com:

- miniatura real do mapa;
- nome da cena;
- estado `Padrão` ou `Preparação`;
- participantes presentes;
- ações `Preparar`, `Levar grupo` e `Mover jogadores`.

Abrir `Mover jogadores` mostra seleção múltipla dos participantes ativos e offline. A confirmação informa exatamente quantos jogadores serão movidos.

Jogadores verão apenas o nome da cena atual e suas preferências locais.

### Estante de tokens

O painel terá três filtros:

- `Nesta cena`;
- `Disponíveis`;
- `Todos`, somente Mestre.

Cada item mostra miniatura, nome, ficha, responsável e cena atual. O Mestre abre um editor contextual para selecionar imagem da biblioteca, ficha e responsável. Jogadores veem somente seus tokens.

Tokens disponíveis serão elementos arrastáveis. O canvas aceitará o drop, converterá a coordenada da tela para o mundo da cena e enviará a colocação ao servidor. O mesmo token desaparecerá da cena anterior.

Movimento e redimensionamento continuam otimistas no cliente, mas a versão persistida pelo servidor é a autoridade. Uma recusa restaura o estado recebido anteriormente e apresenta mensagem contextual.

### Direção visual

A interface preserva a identidade atual do Nephyrus:

- fundos escuros e claros já existentes;
- acento terracota atual;
- mesma tipografia e escala de cantos;
- Phosphor como família de ícones;
- miniaturas reais como principal hierarquia visual.

O elemento característico será a régua de cenas, semelhante a uma mesa de direção: mapa, estado e ocupantes ficam legíveis em uma única varredura. Em telas pequenas, controles terão área mínima de 44 px, os filtros ocuparão uma linha rolável e formulários serão apresentados em modal de largura total.

## Estados e erros

- Sem mapas: orientar o Mestre a enviar uma imagem ou escolher uma da biblioteca.
- Sem tokens: oferecer `Criar token` ao Mestre e explicar ao jogador que tokens são atribuídos pelo Mestre.
- Token sem imagem: usar monograma derivado do nome, sem asset externo.
- Token já em outra cena: informar que ele será transferido antes da confirmação ou no início do drag.
- Cena excluída: participantes atribuídos retornam à cena padrão; tokens ficam disponíveis fora da mesa.
- Asset, ficha, jogador ou cena de outra campanha: rejeitar sem revelar existência.
- Jogador sem permissão: restaurar estado local e apresentar aviso contextual.
- Desconexão durante movimento: o estado do servidor prevalece na reconexão.

## Segurança

- Todas as consultas filtram por `campaign_id` derivado da sessão.
- O cliente nunca define autoridade; `owner_id`, ficha e cena são validados no servidor.
- Apenas o Mestre cria, exclui, retira ou reatribui tokens.
- O dono pode colocar, mover e redimensionar o token somente em sua cena efetiva.
- Apenas o Mestre altera a cena padrão ou atribui participantes.
- Imagens locais precisam corresponder a assets da campanha e ao tipo `token` ou `map` esperado.
- Ações administrativas são adicionadas ao histórico já existente.

## Testes e critérios de aceite

### Backend

- migração preserva tokens de um banco legado;
- token pode existir sem cena;
- imagem, ficha, responsável e cena precisam pertencer à campanha;
- jogador lista somente seus tokens;
- jogador coloca, move e redimensiona token próprio;
- jogador não controla token alheio;
- transferência remove da cena anterior e adiciona na nova;
- grupo inteiro recebe a nova cena padrão;
- atribuição individual afeta somente participantes selecionados;
- exclusão de cena libera tokens e devolve jogadores à cena padrão;
- mensagens WebSocket não atravessam campanhas ou cenas.

### Frontend

- Mestre cria e edita token com imagem, ficha e responsável;
- jogador arrasta token próprio disponível para o mapa;
- redimensionamento sobrevive a recarregamento;
- régua de cenas mostra estado e participantes corretos;
- preparar cena não move jogadores;
- mover grupo e mover selecionados atualizam as sessões conectadas;
- estados vazio, carregando, erro e desconectado são legíveis;
- fluxos funcionam em desktop e viewport móvel sem controles menores que 44 px.

## Fora de escopo

- múltiplos donos simultâneos para um mesmo token;
- cópias do mesmo token em várias cenas;
- portais automáticos entre mapas;
- movimentação automática de tokens junto com jogadores;
- retomada do sistema de regras ou editor de ficha padrão.
