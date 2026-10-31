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

A sessão fica somente na memória da página: recarregar exige novo login. Ao expirar, entre novamente. As fontes Google são opcionais, com alternativas locais. Sem configuração, o site mostra uma demonstração sem salvar alterações.

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
