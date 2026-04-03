🧾 📌 TECH SPEC — PDV Desktop (Node + Electron + SQLite)
🏗️ Arquitetura

Stack principal:

Desktop: Electron
Backend local: Node.js (Express ou NestJS)
Banco: SQLite
ORM: Prisma (recomendado)
UI: React (recomendado)
🧠 Conceito do Sistema

Sistema híbrido com dois modos:

PDV (Operacional)
ERP (Gestão)
🎯 Módulos principais
1. 🔐 Autenticação e Controle de Acesso
Tipos de usuário:
ADMIN
GERENTE
VENDEDOR
ESTOQUE
COZINHA
CONFERENTE
Permissões (RBAC):

Cada usuário terá permissões por módulo:

Módulo	Ações
Vendas	abrir, fechar, desconto
Estoque	entrada, saída, ajuste
Financeiro	ver relatórios
Cozinha	ver e atualizar pedidos
2. 🧭 Tela inicial (Hub)

Após login:

Botão: Entrar no PDV
Botão: Entrar no ERP
🧾 PDV (Core do sistema)
3. 💰 Abertura de Caixa

Campos:

Valor inicial
Usuário responsável
Data/hora

Status:

Aberto
Fechado
4. 🧾 Venda
Modos:
🧍 Venda direta (balcão)
Venda rápida
Sem cliente obrigatório
🍽️ Comanda

Tipos:

Comanda com cliente cadastrado
Comanda rápida (nome manual)

Funcionalidades:

Adicionar produtos
Separar itens de cozinha
Aplicar:
Couvert
Taxa de serviço
Desconto
5. 🍳 Integração com Cozinha
Produto terá flag:
is_kitchen_item = true/false
Fluxo:
Pedido feito no PDV
Itens marcados vão para cozinha
Aparecem na tela da cozinha
Status do pedido:
FILA
PREPARANDO
PRONTO
Tela da Cozinha:

Lista em tempo real:

Pedido
Mesa/cliente
Itens
Tempo de espera
6. 💸 Descontos
Desconto padrão funcionário: 20%
Pode ser:
Percentual
Valor fixo

Controle por permissão.

7. 🪑 Couvert e Taxa de Serviço
Couvert opcional por comanda
Taxa de serviço (% configurável)
8. 📦 Controle de Estoque em Venda

Produto terá:

Controla estoque? (sim/não)
Tipo:
Gelado
Quente

Na venda:

Pode baixar automaticamente ou não
📊 ERP (Gestão)
9. 📦 Estoque
Funcionalidades:
Cadastro de produtos
Entrada de mercadoria
Saída manual
Ajuste
Tipos de itens:
Produto final
Insumo (cozinha/bar)
10. 📥 Entrada de Mercadoria

Campos:

Produto
Quantidade
Custo
Fornecedor (opcional)
11. 📤 Saída
Perda
Consumo interno
Ajuste manual
12. 💰 Financeiro
Fluxo de caixa:
Entradas (vendas)
Saídas (despesas)
Relatórios:
Diário
Mensal
Por usuário
Por produto
13. 👥 Cadastro de Funcionários

Campos:

Nome
Login
Senha
Função
Permissões
🧱 Modelagem de Dados (Base)
Tabelas principais
users
id
name
role
password
products
id
name
price
stock
type (gelado/quente)
is_kitchen_item
controls_stock
orders (comandas)
id
client_name
status
opened_at
closed_at
order_items
id
order_id
product_id
quantity
status (kitchen)
cash_register
id
opened_by
opened_at
initial_value
closed_at
stock_movements
id
product_id
type (entrada/saida)
quantity
reason
financial_entries
id
type (entrada/saida)
amount
description
🔄 Fluxos críticos
Venda com cozinha
Criar comanda
Adicionar itens
Itens com is_kitchen_item:
Enviar para fila da cozinha
Cozinha atualiza status
Garçom visualiza pronto
Fecha comanda
Venda direta
Adiciona itens
Aplica desconto/taxa
Finaliza pagamento
Baixa estoque
⚙️ Funcionalidades técnicas importantes
🔁 Tempo real interno
Comunicação via WebSocket local

Sugestão:

Socket.IO
💾 Backup
Backup automático do SQLite