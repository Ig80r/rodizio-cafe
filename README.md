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
