# Café do LSN

Rodízio de café do LSN, com visual noturno inspirado na atmosfera de Coffee Talk e arte original em uma grade de pixels, em SVG sem suavização. Cada cota representa 250 g.

## Abrir localmente

Na pasta do projeto, execute `python -m http.server 8080` e abra http://localhost:8080. Não abra o HTML diretamente: o navegador precisa servir os módulos JavaScript por HTTP.

## Supabase e acesso dos cafeteiros

O `config.js` contém somente a URL e a chave pública do Supabase. Nunca coloque uma chave secreta ou `service_role` no frontend.

1. Em um banco novo, execute `supabase/schema.sql` no SQL Editor do Supabase como administrador. Em um banco existente, faça backup e revise as funções `coffee_*` antes: o script substitui essas funções e usa novas tabelas privadas; não migra registros de outro esquema automaticamente.
2. Habilite login por e-mail/senha no Supabase Authentication e configure a Site URL e as URLs de redirecionamento para o endereço do site. Configure a confirmação de e-mail e o envio de mensagens conforme o ambiente.
3. Na aba **Área dos cafeteiros → Criar conta**, cadastre a primeira conta e confirme o e-mail, se solicitado.
4. Promova essa conta pelo SQL Editor, substituindo o endereço abaixo. O frontend não permite conceder privilégios administrativos:

```sql
insert into coffee_private.admins(user_id)
select id from auth.users where email = 'administrador@exemplo.com'
on conflict do nothing;
```

5. Entre como administrador, adicione os participantes e salve a fila. A instalação inicia sem pessoas ou compras fictícias.
6. Cada cafeteiro cria sua conta e salva o apelido/ícone. O administrador vincula o perfil a uma vaga. O membro pode então enviar compras para aprovação e acompanhar suas solicitações.

A fila e o histórico são públicos; perfis e solicitações exigem autenticação. As tabelas privadas têm RLS habilitada e não concedem acesso direto ao navegador. Cada operação valida a permissão no servidor. Compras e avanço da fila são atômicos; versões previnem sobrescritas concorrentes e IDs previnem registros duplicados em retentativas. Ao aprovar uma compra, a fila avança pela quantidade de cotas, inclusive em compras fora da vez, preservando a regra original do site.

A sessão fica no armazenamento da aba (`sessionStorage`), com prazo de expiração: recarregar a mesma aba mantém o login enquanto válido. Ao expirar ou sair, entre novamente. As fontes Google são opcionais, com alternativas locais. Sem configuração, o site mostra uma demonstração sem salvar alterações.

## Validação

`node --check app.js` verifica a sintaxe. Com Playwright e Chromium instalados (`npm install --no-save playwright` e `npx playwright install chromium`), `node --test tests/ui.test.mjs` verifica navegação, login, cadastro e isolamento visual de sessão com uma API simulada. A aplicação do SQL e os testes de autorização no banco real precisam de acesso administrativo ao Supabase; o script não é aplicado automaticamente.

Os cenários e avatares em pixel art ficam em `assets/`. Para regenerá-los: `python scripts/pixel_art.py`. Os identificadores dos ícones no banco permanecem compatíveis com os perfis existentes.

## Laboratório e mural

O cenário atual é `assets/lab-pixel.svg`; o café original continua em `assets/cafe-pixel.svg`. O gerador produz também os dez retratos regionais em uma grade de 32 × 32 pixels. Os IDs antigos dos perfis foram preservados; a apresentação e os nomes agora usam a fauna regional.

O mural está na seção `#mural` de `index.html`, com frase, autoria e data de demonstração. Para trocar a pérola, edite o `blockquote`, `.quote-credit` e o `time` (texto e atributo `datetime`). Esta primeira edição é estática e não grava frases no banco.

Referências para a seleção de animais: [Inventário da Fauna do Ceará](https://www.ce.gov.br/sema/fauna-do-ceara/), [levantamento da Semace](https://www.semace.ce.gov.br/wp-content/uploads/sites/46/2020/02/2017_RIMA-PROJETO-DO-TERMINAL-PORTUARIO-DE-USO-PRIVADO-TUP.pdf) e [Carcará no campus da UFC](https://sma.ufc.br/pt/carcara/).

## Cenário científico animado

A ilustração principal usa `assets/science-lab-animated.svg`, com vapor, chuva, preparo do café, simulação no notebook e indicadores discretos. A animação roda automaticamente, sem botão de pausa. A preferência `prefers-reduced-motion` seleciona `assets/science-lab.svg`, a versão estática também usada no fundo e no jornal.

Para regenerar o cenário: `python scripts/pixel_art.py` e depois `python scripts/science_art.py`. A arte é original e feita em SVG numa grade de pixels. O teste de navegador também verifica reprodução automática, movimento reduzido e a posição da xícara fora da fotografia do jornal.

A Gazeta agora tem duas páginas fictícias: a xícara no canto inferior direito avança e volta, com suporte a teclado. As frases, autores e datas estão no array `pearlPages` de `app.js`; o HTML contém a primeira página como conteúdo inicial. O ícone do cabeçalho reutiliza os mesmos traços da xícara da logo (`assets/logo-cup.svg`). O quadro mostra três equações de Maxwell, entropia de Shannon em bits e campo elétrico saindo de uma carga positiva com uma superfície gaussiana tracejada.

## Nome, foto e comentários — atualização 002

Se o banco já foi instalado, execute **somente `supabase/002_profiles_comments.sql`** inteiro no SQL Editor. Para instalação nova, execute `schema.sql` e depois `002_profiles_comments.sql`. A migração preserva contas, compras, permissões administrativas e fila existentes. Depois publique `index.html`, `app.js` e `style.css` atualizados.

O cadastro envia o nome como metadado; um trigger cria o perfil automaticamente. Contas antigas podem preencher o nome no perfil. Após o vínculo pelo administrador, o nome e a foto aparecem na fila pública. A imagem escolhida (JPG, PNG ou WebP, até 5 MB) é recortada no centro e convertida em JPEG 320 × 320 no navegador. O JPEG otimizado fica na tabela privada de perfis, com limite de 150 mil caracteres, sem bucket adicional. Salvar o perfil aplica a foto; “Usar só o bicho” remove a foto ao salvar.

Cafeteiros aprovados solicitam entre 1 e 100 cotas de 250 g. A compra e a mudança de fila continuam dependendo da confirmação administrativa. As solicitações aparecem no painel do administrador.

Cada página da Gazeta tem um ID estável (`gazeta-001`, `gazeta-002`). Comentários são públicos, mas somente contas autenticadas com perfil podem publicar (até 500 caracteres). O autor e os administradores podem excluir. Cada leitura mostra os 100 comentários mais recentes, em ordem cronológica; o botão Atualizar busca novas mensagens. Os textos são renderizados com `textContent`, sem HTML. As políticas e RPCs verificam identidade no servidor. O teste de navegador usa API simulada para conferir cadastro com nome, upload de foto, três cotas (750 g), isolamento dos comentários por página e exclusão. A migração precisa ser aplicada e validada no Supabase real.

## Correção 003 — salvar participantes

Se salvar a fila retornar `column reference "p" is ambiguous`, execute `supabase/003_fix_manage_ambiguity.sql` no SQL Editor. A correção substitui apenas `coffee_manage`, renomeia a variável local para `v_participant` e qualifica os valores JSON dos aliases SQL. Não altera dados, assinatura, permissões ou validações da fila. O `schema.sql` também inclui a correção para instalações novas.

## Correção 004 — proteção de UPDATE

Se aparecer `UPDATE requires a WHERE clause`, execute `supabase/004_fix_state_updates.sql` inteiro no SQL Editor. A correção inclui a 003 e adiciona `WHERE id = true` às atualizações do estado em `coffee_manage`, `coffee_member_approve` e `record_buy`. Preserva dados, assinaturas e permissões existentes. Não é necessário desativar a proteção do banco.

## Gazeta administrável — atualização 005

Execute `supabase/005_gazette_editor.sql` depois da atualização 002 (mantenha também as correções 003/004 já aplicadas). O script cria a tabela privada de publicações, conserva os IDs `gazeta-001` e `gazeta-002` para preservar os comentários existentes e libera páginas novas. As RPCs de publicação exigem administrador no servidor; a leitura é pública. Nenhuma função da fila é substituída.

No painel do administrador, **Publicar na Gazeta** permite título, frase, autor, data, texto complementar, imagem e legenda. A prévia é local e atualiza durante a digitação; só o botão Publicar grava e torna a página pública. JPG/PNG/WebP de até 5 MB são convertidos em JPEG com no máximo 1000 pixels no maior lado e 1,2 milhão de caracteres no banco. A imagem publicada mantém as cores originais. Esta versão cria publicações; não edita as já publicadas. Uma publicação usa ID estável e retentativas não geram duplicatas.

Comentários usam o ID da publicação, nunca o índice da página. Erros aparecem junto do formulário e o texto é preservado para nova tentativa. Contas antigas sem perfil recebem um perfil básico ao comentar, usando nome dos metadados quando disponível; podem ajustar o nome depois. O botão Entrar para comentar abre a área de acesso. A sessão agora sobrevive ao recarregamento da mesma aba até expirar.

Validação: o teste de navegador usa API simulada para conferir erro e retentativa de comentário, texto preservado, publicação com imagem, prévia sem gravação, comentários após inserir uma nova página, responsividade do editor e sessão após recarregar. O SQL ainda deve ser aplicado e validado no Supabase real.

## Página da Gazeta e sessão persistente — atualização 006

Execute `supabase/006_gazette_comments.sql` após a 005. Publique também `gazeta.html` junto dos arquivos atualizados. A página inicial mostra um convite; as matérias e comentários ficam na página própria da Gazeta, com links `gazeta.html?post=ID`, filtros por mês e semanas iniciadas na segunda-feira. Os IDs das publicações e comentários continuam iguais.

O envio agora usa `coffee_comment_publish`, que retorna o comentário realmente gravado na mesma transação. O frontend mostra esse registro confirmado imediatamente, preserva-o caso a leitura seguinte falhe e mantém o aviso de erro em vez de sobrescrevê-lo com sucesso. A leitura usa LEFT JOIN para não esconder comentários de perfis antigos. A conversa atualiza a cada 20 segundos enquanto a página está visível, além do botão Atualizar.

A sessão atual usa access token e refresh token persistidos em `localStorage`, com renovação antes do vencimento e uma nova tentativa em caso de 401. Falhas temporárias de rede não apagam o login; um refresh token revogado ou inválido exige nova entrada. Ao sair, o armazenamento é removido. Faça login novamente uma vez após atualizar para registrar o refresh token que as versões anteriores não guardavam. [Sessões do Supabase](https://supabase.com/docs/guides/auth/sessions).

Os testes com API simulada cobrem envio confirmado seguido de falha na leitura, comentários por publicação, arquivo por período, renovação de token vencido ao recarregar, navegação entre páginas e manutenção do login em outra aba. A migração precisa ser executada e validada no banco real.

## Funções não encontradas na API — sincronização 007

Se salvar foto, publicar ou comentar retornar “Could not find the function ... in the schema cache”, abra o mesmo projeto Supabase de `config.js` e execute `supabase/007_sync_backend.sql` inteiro como postgres no SQL Editor. Ele reúne as atualizações 002, 004, 005 e 006 em uma única transação, com validação da instalação inicial, sem reinstalar `schema.sql`. Os dados existentes são preservados. Se qualquer etapa falhar, a transação não é confirmada; corrija o erro antes de continuar.

Depois execute `supabase/verify_backend.sql`: as três linhas devem mostrar `instalada = true` e `acesso_autenticado = true`. O script solicita a atualização do cache da API. Se as funções estiverem instaladas mas o site ainda não encontrá-las, confira se o domínio de `config.js` aponta para esse mesmo projeto e se `public` está entre os esquemas expostos da Data API. [Atualizar cache PostgREST](https://supabase.com/kb/troubleshooting/refresh-postgrest-schema).

## Ajustes de leitura e frase do dia

O editor identifica explicitamente o campo “Frase do dia”, separado da matéria completa, e mostra o destaque na prévia. Os títulos do site usam IBM Plex Mono (alternativa local: Consolas/monospace), e o nome da Gazeta usa Playfair Display (alternativa local: Georgia). Texto e números de formulários continuam em fonte de leitura. Esta alteração não exige SQL.

O cabeçalho da Gazeta agora usa Grenze Gotisch, mantendo a aparência gótica de jornal antigo com traços mais abertos; Playfair Display/Georgia ficam como alternativas. O corpo da matéria permanece serifado e legível.

## Insígnia de autor e autoria das matérias — atualização 008

Depois da sincronização 007 (ou das atualizações 002 a 006), execute `supabase/008_authors.sql` no SQL Editor. Ela cria a lista privada de autores e registra `created_by` em novas matérias. O cliente não escolhe o dono: a função usa `auth.uid()` no servidor. Matérias antigas continuam sem dono atribuído, evitando conceder direitos a uma pessoa sem evidência de autoria.

No painel administrativo, **Autores da Gazeta** lista os perfis e permite conceder ou retirar a insígnia. Quem recebe a insígnia encontra o editor e **Minhas matérias** na área dos cafeteiros; não recebe controles administrativos. A insígnia aparece no próprio perfil, na fila para membros vinculados e na identificação de quem publicou uma matéria. O nome atribuído à frase é independente da conta que publicou.

Autores podem publicar e excluir apenas matérias criadas pela própria conta. A exclusão retira a matéria do público (`published = false`) e preserva os comentários no banco. O administrador mantém permissão de moderação no servidor. A retirada da insígnia impede imediatamente novas publicações e exclusões, mesmo se a interface de uma aba antiga ainda estiver aberta. A nova função `coffee_author_set` valida o administrador, e `coffee_post_delete` valida a permissão e a conta dona da publicação. As tabelas privadas não concedem acesso direto ao navegador.

Os testes de navegador usam API simulada e cobrem concessão, publicação com outro nome atribuído à frase, exclusão própria, tentativa de exclusão de matéria alheia e revogação. As regras SQL precisam ser aplicadas e verificadas no Supabase real.

O início usa Jersey 10 nos títulos grandes, mantendo pixels definidos com leitura mais clara. A Gazeta mantém Grenze Gotisch com ornamentos discretos e traços mais fortes; formulários e matérias continuam em fontes de leitura.

## Formatação de matérias — atualização 009

Execute `supabase/009_article_formatting.sql` depois da 008 e publique também o novo módulo `formatting.js`. No editor, selecione o trecho e use Negrito, Itálico, Sublinhar ou Link. Os botões de lista criam itens com marcadores ou números. Alinhamento (esquerda, centro, direita, justificado) e tamanho (14, 16, 18, 20, 22 ou 24 px) aplicam-se ao corpo inteiro da matéria e aparecem na prévia.

A formatação de trechos fica em marcações simples (`**negrito**`, `*itálico*`, `__sublinhado__`, `[texto](https://endereco)`, linhas `- item` ou `1. item`). O módulo transforma apenas essas marcações em nós DOM; HTML digitado é texto literal, e links só aceitam HTTP/HTTPS. Links abrem em outra aba com `noopener noreferrer`. Comentários permanecem em texto simples.

O novo endpoint `coffee_post_publish_formatted` reaproveita as permissões e a autoria da 008, valida alinhamento/tamanho e grava tudo na mesma transação. As matérias anteriores recebem alinhamento à esquerda e tamanho 18 px. O teste de navegador cobre os botões, estilo computado da prévia e da publicação, HTML literal e links rejeitados. SQL ainda precisa ser aplicado no Supabase real.

## Insígnias originais — atualização 010

Execute `supabase/010_public_badges.sql` após a 008/009 e publique os arquivos atualizados e `assets/badge-admin.svg`, `assets/badge-author.svg`. As insígnias da opção 01 são originais: escudo com xícara dourado (ADMIN) e pena com página verde (AUTOR). Os componentes mantêm texto legível, desenho em pixels, contraste e descrição ao passar o mouse.

O próprio perfil, os perfis do painel administrativo, a fila pública, os comentários e a identificação de quem publicou a matéria mostram as funções. Uma conta com os dois papéis exibe ambas. Os papéis vêm de `coffee_private.admins` e `coffee_private.authors`, consultados no servidor; a migração só adiciona indicadores booleanos, sem conceder privilégios e sem expor e-mail ou ID de conta nas respostas públicas. As permissões de publicação/exclusão permanecem as da 008.

Testes com API simulada verificam ADMIN no perfil, comentário e matéria; AUTOR no perfil; e a manutenção dos fluxos de concessão, revogação e exclusão própria. A atualização SQL precisa ser aplicada e validada no Supabase real.

## Senha e contato de suporte

O cadastro exige mínimo de 8 caracteres. No painel Supabase, confira também Authentication → Sign In / Providers → Email → Minimum password length: ajuste para 8 caso o servidor ainda exija 12. A mudança visual não altera a configuração do Supabase.

Para publicar seu telefone no rodapé, preencha `supportPhone` em `config.js` (inclua DDD). O rodapé mostra o número como texto, somente ao abrir “Mostrar contato”. Enquanto estiver vazio, mostra um aviso de contato em breve, sem telefone fictício clicável. O telefone será público nas duas páginas. Não é necessário executar SQL.

## Autorização separada de comentários — atualização 011

Execute `supabase/011_member_approval.sql` após a 010. Ela cria `coffee_private.comment_permissions`, uma autorização independente da participação no rodízio e da insígnia de autor. Nenhum comentário antigo é removido. Todos os perfis não administrativos precisam de autorização explícita, inclusive quem já está na fila. O administrador continua podendo comentar.

Na área administrativa, **Quem pode comentar na Gazeta** lista os perfis. Clique em **Autorizar comentários** ou **Bloquear comentários**. Não é necessário vincular uma vaga. Aprovar a vaga do café ou conceder a insígnia de autor não altera essa autorização. O membro pode usar Atualizar na conversa ou recarregar para conferir o aval. Um bloqueio já é aplicado pelo banco a novas tentativas de envio, mesmo com uma aba antiga aberta.

A função privada `can_comment` verifica a autorização no servidor. `coffee_comment_add` valida essa regra; `coffee_comment_publish` chama a mesma função, portanto os dois endpoints ficam protegidos. Só o administrador pode chamar `coffee_comment_permission_set`. A tabela privada tem RLS e não concede acesso direto ao navegador. O formulário fica oculto para contas sem autorização e mostra um aviso.

Testes com API simulada cobrem bloqueio nos dois endpoints, inclusive para autores sem vaga, concessão e retirada pelo painel, e comentário autorizado sem participação na fila. O SQL precisa ser aplicado e validado no Supabase real.

## Respostas encadeadas — atualização 012

Execute `supabase/012_comment_threads.sql` depois da 011. Comentários existentes são raízes (`parent_id` nulo). Cada comentário e resposta oferece Responder para contas autorizadas; o formulário mostra o destinatário e permite cancelar. Respostas recebem o ID do comentário-pai, sempre na mesma matéria. Novos comentários na matéria não herdam uma resposta selecionada em outra página. Em celulares, o recuo visual é limitado, mas o vínculo e as respostas continuam funcionando em qualquer nível.

A função `coffee_comment_reply` exige a autorização da 011, valida o comentário original na mesma publicação, impede autorresposta circular, reaproveitamento de IDs para trocar parentesco e resposta a comentários removidos. Ela retorna o registro realmente salvo. O cliente não ganha acesso direto às tabelas. A leitura carrega as 100 conversas principais mais recentes e todas as respostas dessas conversas. A leitura pública e as insígnias são mantidas.

Excluir um comentário remove seu texto e mantém um marcador, preservando as respostas de outras pessoas. Autor e administrador mantêm a permissão de excluir somente nos casos já previstos. Comentários antigos e páginas são preservados.

O teste de navegador com API simulada cobre resposta, resposta à resposta, cancelamento, exclusão sem remover descendentes, bloqueio de contas não autorizadas e layout em celular. A migração ainda precisa ser aplicada e validada no Supabase real.

O suporte foi reduzido a uma nota discreta, sem caixa destacada. O telefone fica dentro de um detalhe recolhido e não tem link de ligação. O rodapé orienta a enviar mensagem em vez de ligar.

O contato do rodapé agora usa `supportEmail` em `config.js`, com link de e-mail dentro do detalhe recolhido. O número de telefone foi removido da configuração. O suporte fica ao lado de “Café do LSN / Vai um cafézin?”, inclusive no celular.

## Recuperação de senha por e-mail

O link “Esqueceu a senha?” aparece no login das duas páginas e abre `recuperar.html`. O usuário recebe um link pelo Supabase, define uma senha de no mínimo 8 caracteres e confirma a senha. Após a troca, entra novamente. O token de recuperação fica apenas na sessão da aba, com validade, e sai do endereço imediatamente. Ele não substitui a sessão normal da conta. Nenhuma migração SQL é necessária.

Configuração no painel Supabase:

1. Em **Authentication → URL Configuration**, mantenha o Site URL do site e adicione `https://ig80r.github.io/rodizio-cafe/recuperar.html` aos **Redirect URLs**. Em desenvolvimento, adicione também o endereço completo usado para `recuperar.html` (por exemplo, `http://localhost:8000/recuperar.html`).
2. Em **Authentication → Email Templates → Reset password**, você pode usar o assunto “A senha sumiu. O café é inocente.” e colar o conteúdo de `supabase/email-recovery.html`. Preserve `{{ .ConfirmationURL }}` no link. Esse modelo é opcional; o padrão também funciona.
3. Para envio aos membros, confira o **Custom SMTP** do projeto. O serviço padrão do Supabase restringe o envio a endereços autorizados da equipe e não atende a uma lista pública de usuários. Veja https://supabase.com/docs/guides/auth/auth-smtp.
4. Publique os arquivos novos e atualizados. Teste com uma conta real: pedir recuperação, abrir o e-mail, alterar a senha e entrar com a nova senha. Entrega de e-mail depende das configurações e dos limites do provedor.

Os testes de navegador em `tests/recovery.test.mjs` usam API simulada: envio com redirecionamento correto, resposta que não revela se existe uma conta, confirmação de senha, mínimo de 8 caracteres, persistência apenas na aba, limpeza do token, link vencido e redirecionamento de recuperação a partir da página inicial. Esses testes não verificam a entrega real do e-mail.
