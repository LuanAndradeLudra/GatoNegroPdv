docker compose up --build -d
docker compose exec app npx tsx prisma/seed.ts