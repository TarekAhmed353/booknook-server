import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const db = client.db("booknook");
const borrowsCollection = db.collection("borrows");

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized: no token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = { id: payload.sub, email: payload.email, name: payload.name };
    next();
  } catch {
    return res.status(401).send({ message: "Unauthorized: invalid or expired token" });
  }
};

app.get("/", async (req, res) => {
  try {
    await db.command({ ping: 1 });
    res.send({ message: "BookNook server is running", database: "connected" });
  } catch (error) {
    res.status(500).send({ message: "BookNook server is running", database: "not connected", error: error.message });
  }
});

app.get("/borrows", verifyToken, async (req, res) => {
  const borrows = await borrowsCollection
    .find({ userEmail: req.user.email })
    .sort({ borrowDate: -1 })
    .toArray();
  res.send(borrows);
});

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`BookNook server running on http://localhost:${port}`);
  });
}

export default app;