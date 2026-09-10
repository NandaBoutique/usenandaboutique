# Nanda Boutique

Boutique em HTML, CSS e JavaScript com catálogo responsivo, sacola por tamanho, consulta pelo WhatsApp, contas demonstrativas, edição de conteúdo e avaliações locais.

## Abrir

Abra `index.html` no navegador ou, para uma origem local consistente e recursos de cadastro disponíveis, inicie um servidor na pasta do projeto:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Acesse <http://127.0.0.1:8000>. Use sempre o mesmo endereço, porta e perfil de navegador para recuperar os dados salvos. `file://`, outra porta ou outro perfil podem usar armazenamentos diferentes.

## Entrar, cadastrar e editar

A loja abre diretamente. O botão **Entrar / Cadastrar** no cabeçalho oferece as abas **Entrar**, **Criar Conta** e a opção **Continuar sem cadastro (Anônimo)**. O cadastro solicita nome, e-mail, CPF e senha. As contas são demonstrações salvas neste navegador; não há confirmação de e-mail, recuperação de senha ou validação de identidade.

Para o modo de edição local, use exatamente:

- Usuário: `usenandaboutique`
- Senha: `Nanda100239`

O papel `userRole: 'admin'` fica em `localStorage` e libera o lápis do painel e os lápis junto aos conteúdos e fotos. Eles abrem formulários para alterar história, apresentação, informações, contatos e URLs das imagens. O painel permite adicionar, editar, excluir e marcar produtos esgotados. **Sair do modo administrador** encerra a sessão local.

O produto reúne nome, descrição, categoria, preço, tamanhos separados por vírgula, tamanhos indisponíveis e até oito mídias. As mídias podem ser caminhos de arquivos existentes em `./img/` ou URLs HTTPS. O tipo automático reconhece extensões; selecione foto ou vídeo para endereços HTTPS sem extensão. Esses campos não fazem upload de arquivos.

Os tamanhos conhecidos do catálogo original foram preservados. Peças que não tinham tamanhos cadastrados oferecem **Avisar quando chegar** até a administração preencher as opções. Isso evita atribuir tamanhos ou estoque que ainda não foram confirmados.

## Compra e avaliações

Cada card mostra nome, descrição, preço quando cadastrado e seletor de tamanho. **Adicionar à Sacola** exige uma opção disponível. Variantes da mesma peça ficam separadas na sacola, com quantidades e remoção próprias. Um tamanho indisponível ou uma peça esgotada oferece **Avisar quando chegar**, que prepara uma consulta pelo WhatsApp.

Antes de finalizar, é obrigatório escolher Pix, Crédito, Débito ou Dinheiro. O WhatsApp recebe uma mensagem com as peças, tamanhos, quantidades quando maiores que um e pagamento, solicitando confirmação da disponibilidade. O site prepara o texto; o envio é confirmado pela cliente no WhatsApp e nenhum pagamento é processado aqui. Alterar o contato pelo lápis atualiza os links de atendimento.

A sacola é salva no navegador. Registros antigos sem tamanho são descartados com aviso para permitir uma nova seleção explícita. Produtos removidos, esgotados ou com tamanho indisponível saem da sacola.

Avaliações exigem e-mail, CPF em formato de onze dígitos, nota e comentário. Só estrelas e comentário aparecem publicamente. Há uma avaliação por e-mail, sem distinguir maiúsculas e minúsculas. A autora pode excluí-la usando sua conta local ou a identificação anônima daquele navegador; digitar o e-mail de outra pessoa não transfere a autoria.

## Dados e limites do protótipo

Produtos, conteúdos, contas, avaliações e sacola pertencem ao navegador e à origem usados. Não são compartilhados entre dispositivos ou publicados automaticamente para outras clientes. Limpar os dados do navegador pode apagá-los. Se o armazenamento estiver indisponível, o site avisa que as mudanças valem apenas durante a visita.

O CPF é verificado apenas pelo formato para a futura integração; seu número não é persistido. Contas demonstrativas guardam um hash de senha com salt, nunca a senha digitada. Avaliações guardam o e-mail para impedir duplicação, uma identificação de autoria local e a indicação de que o CPF foi informado. A ausência de e-mail na interface pública não torna o armazenamento do navegador privado para quem usa esse dispositivo.

O login e `userRole` controlam somente a interface deste protótipo. Quem tem acesso ao navegador pode inspecionar e alterar o código ou o armazenamento. Uma versão pública com contas, autorização confiável, CMS compartilhado e validação de clientes precisa de servidor e banco de dados; esta versão prepara a interface e os fluxos locais para essa integração.

## Movimento, mídia e acessibilidade

Galhos de cerejeira balançam nos cantos, pétalas caem continuamente e quatro borboletas carregam 👜, 👚, 💍 e 👖. Ao adicionar uma peça, outra borboleta leva a foto do produto à sacola com o rastro 💍, 👗, 👠, 👜 e 🌸. Os efeitos têm quantidade limitada, não interceptam cliques e respeitam a preferência de movimento reduzido.

Vídeos mantêm `controls`, `playsinline` e ausência de autoplay. A reprodução depende da ação da pessoa e é pausada ao trocar de mídia ou abrir diálogos. Os carrosséis aceitam teclado e toque. Os diálogos oferecem fechamento por Escape, gestão de foco e retorno ao controle de origem.

## Arquivos e verificações

- `index.html`: seções, navegação, formulários e diálogos.
- `style.css`: layout responsivo, tipografia, controles e animações.
- `script.js`: catálogo, dados locais, contas, CMS, avaliações, sacola e efeitos.
- `img/`: fotos, vídeos e decoração da boutique.
- `tests/`: regressões locais e no Chrome/Edge, com instruções em `tests/README.md`.

```powershell
node --check script.js
node tests/local-regression.cjs
node tests/browser-regression.cjs
```

Os testes de navegador usam perfil temporário separado e não enviam mensagens ao WhatsApp. Confira a data e o resultado de cada execução em `tests/artifacts/resultado.json`; capturas anteriores não comprovam a versão atual. Testes automatizados não substituem revisão com tecnologias assistivas e uso em aparelhos reais.
