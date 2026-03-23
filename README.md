## 1) Configure PostgreSQL

1. Install/run PostgreSQL.
2. Update `DATABASE_URL` in your root `.env` file (created by Prisma init), e.g.
   ```bash
   DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/mydb?schema=public"
   ```
   - Replace **USER** / **PASSWORD** with a real PostgreSQL role (often `postgres` on a local install).
   - Replace **mydb** with a database that exists (create it first in pgAdmin or `createdb mydb`).
   - **Do not** leave the default `johndoe:randompassword` — that causes Prisma **`P1000` Authentication failed**.

## 2) Migrate + Seed 1,000,000 Rows

1. Create the table schema:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```
2. Seed 1,000,000 transactions (inserted in batches of 5,000):
   ```bash
   npm run prisma:seed
   ```

## 3) Run the App

1. Start the Next.js dev server:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:3000`.
3. Use the filters + pagination table, then click **Download CSV** (streamed via Node.js Streams to avoid `res.json()` crashes).
