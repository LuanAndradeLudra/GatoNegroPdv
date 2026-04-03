# Como rodar o Gato Negro PDV

O banco no código é **PostgreSQL** (Prisma). A URL em `.env` deve ser `postgresql://...`, não `file:./dev.db`.

## Desenvolvimento (API + Vite no navegador)

O `.env` aponta o Prisma para **Postgres na porta 5433** (host). Esse Postgres é o serviço **`db`** do `docker-compose.yml`. Se você rodar `docker compose down` (ou parar o Docker), o banco some — o `npm run dev` **não** pode conectar até o Postgres voltar.

O comando **`npm run dev`** já faz `docker compose up -d db`, espera a porta **5433** aceitar conexão e só então sobe API + Vite. Assim, depois de parar o stack completo, basta rodar de novo `npm run dev` (com Docker rodando na máquina).

Se o Postgres já estiver no ar (por exemplo você subiu só com `docker compose up -d db` antes) e quiser pular a etapa do compose no script, use **`npm run dev:app`**.

1. Instale dependências e aplique migrações (na primeira vez ou após pull):

   ```bash
   npm install
   npx prisma migrate deploy
   ```

2. (Opcional) popular dados de teste:

   ```bash
   npx tsx prisma/seed.ts
   ```

3. Inicie API + frontend (sobe o container `db` se estiver parado):

   ```bash
   npm run dev
   ```

- **Frontend:** http://127.0.0.1:5173  
- **API:** http://127.0.0.1:3001  

Se a API falhar com erro de Prisma/conexão, confira se o container `db` está saudável (`docker compose ps`) e se `DATABASE_URL` em `.env` aponta para `127.0.0.1:5433` (veja `.env.example`).

## App + API em Docker (produção local)

```bash
docker compose up --build -d
docker compose exec app npx tsx prisma/seed.ts
```

A app escuta na porta configurada em `APP_PORT` (padrão **3001**).
