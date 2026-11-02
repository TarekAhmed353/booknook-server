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
const booksCollection = db.collection("books");
const borrowsCollection = db.collection("borrows");

const categories = ["Fiction", "Science", "History", "Kids", "Others"];

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

app.post("/books", verifyToken, async (req, res) => {
  const { title, author, category, image, description, totalCopies } = req.body;
  const copies = Number(totalCopies);

  if (
    !title?.trim() ||
    !author?.trim() ||
    !image ||
    !description?.trim() ||
    !categories.includes(category) ||
    !Number.isInteger(copies) ||
    copies < 1
  ) {
    return res.status(400).send({ message: "Please fill in every field with valid values." });
  }

  const book = {
    title: title.trim(),
    author: author.trim(),
    category,
    image,
    description: description.trim(),
    totalCopies: copies,
    availableCopies: copies,
    addedBy: { name: req.user.name, email: req.user.email },
    createdAt: new Date(),
  };

  const result = await booksCollection.insertOne(book);
  res.status(201).send({ ...book, _id: result.insertedId });
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