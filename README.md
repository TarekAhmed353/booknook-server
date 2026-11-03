# BookNook Server

The Express and MongoDB API behind BookNook, a small online library.

**Live API:** https://booknook-server-nu-beige.vercel.app

**Live site:** https://booknook-tarek.vercel.app

**Client repository:** https://github.com/TarekAhmed353/booknook-client

## API routes

| Method | Route | Token needed | What it does |
|---|---|---|---|
| GET | `/books` | No | All books, newest first. Supports `?category=`, `?limit=` and `?email=` |
| GET | `/books/:id` | Yes | One book |
| POST | `/books` | Yes | Add a book. The adder's name and email come from the token |
| PATCH | `/books/:id` | Yes | Update a book. Only the person who added it can do this |
| DELETE | `/books/:id` | Yes | Delete a book and its borrow records. Owner only |
| POST | `/borrows` | Yes | Borrow a book for 7 days |
| GET | `/borrows` | Yes | The logged-in user's borrows |
| DELETE | `/borrows/:id` | Yes | Return a book |

## How it works

- **JWT check:** the client signs a token with BetterAuth's JWT plugin. The server downloads the matching public key from the client's `/api/auth/jwks` address and checks every protected request with `jose`. Missing, fake or expired tokens get a 401.
- **Available copies:** borrowing lowers `availableCopies` by 1 with `$inc`, but only if at least one copy is left. That check and the update happen in a single database operation, so the count can never go below zero. Returning raises it by 1.
- **No double borrow:** a user who already has a book out gets a 409 error if they try to borrow it again.

## Tech stack

- Node.js and Express 5
- MongoDB (native driver)
- jose for JWT verification
- Deployed on Vercel

## Run it locally

1. Clone this repository and install packages:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root:

   ```
   PORT=5000
   CLIENT_URL=http://localhost:3000
   MONGODB_URI=your-mongodb-connection-string
   ```

3. Start the server:

   ```bash
   npm run dev
   ```

4. Open http://localhost:5000. It should say the server is running and the database is connected.