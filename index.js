import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const port = process.env.PORT || 5000;

const allowedOrigins = [process.env.CLIENT_URL, "http://localhost:3000"].filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
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
const BORROW_DAYS = 7;

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

const readBookInput = (body) => {
  const { title, author, category, image, description, totalCopies } = body;
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
    return null;
  }

  return {
    title: title.trim(),
    author: author.trim(),
    category,
    image,
    description: description.trim(),
    totalCopies: copies,
  };
};

const findOwnBook = async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    res.status(404).send({ message: "Book not found" });
    return null;
  }

  const book = await booksCollection.findOne({ _id: new ObjectId(id) });

  if (!book) {
    res.status(404).send({ message: "Book not found" });
    return null;
  }

  if (book.addedBy.email !== req.user.email) {
    res.status(403).send({ message: "You can only change books that you added." });
    return null;
  }

  return book;
};

app.get("/", async (req, res) => {
  try {
    await db.command({ ping: 1 });
    res.send({ message: "BookNook server is running", database: "connected" });
  } catch (error) {
    res.status(500).send({ message: "BookNook server is running", database: "not connected", error: error.message });
  }
});

app.get("/books", async (req, res) => {
  const { category, email, limit } = req.query;
  const filter = {};

  if (category && categories.includes(category)) {
    filter.category = category;
  }
  if (email) {
    filter["addedBy.email"] = email;
  }

  let cursor = booksCollection.find(filter).sort({ createdAt: -1 });

  const max = Number(limit);
  if (Number.isInteger(max) && max > 0) {
    cursor = cursor.limit(max);
  }

  const books = await cursor.toArray();
  res.send(books);
});

app.get("/books/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: "Book not found" });
  }

  const book = await booksCollection.findOne({ _id: new ObjectId(id) });

  if (!book) {
    return res.status(404).send({ message: "Book not found" });
  }

  res.send(book);
});

app.post("/books", verifyToken, async (req, res) => {
  const input = readBookInput(req.body);

  if (!input) {
    return res.status(400).send({ message: "Please fill in every field with valid values." });
  }

  const book = {
    ...input,
    availableCopies: input.totalCopies,
    addedBy: { name: req.user.name, email: req.user.email },
    createdAt: new Date(),
  };

  const result = await booksCollection.insertOne(book);
  res.status(201).send({ ...book, _id: result.insertedId });
});

app.patch("/books/:id", verifyToken, async (req, res) => {
  const book = await findOwnBook(req, res);
  if (!book) return;

  const input = readBookInput(req.body);

  if (!input) {
    return res.status(400).send({ message: "Please fill in every field with valid values." });
  }

  const borrowedCount = book.totalCopies - book.availableCopies;

  if (input.totalCopies < borrowedCount) {
    const words = borrowedCount === 1 ? "copy is" : "copies are";
    return res.status(400).send({
      message: `${borrowedCount} ${words} borrowed right now, so Total Copies cannot be lower than ${borrowedCount}.`,
    });
  }

  const updatedBook = await booksCollection.findOneAndUpdate(
    { _id: book._id },
    {
      $set: {
        ...input,
        availableCopies: input.totalCopies - borrowedCount,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  await borrowsCollection.updateMany(
    { bookId: req.params.id },
    { $set: { bookTitle: input.title, bookImage: input.image } }
  );

  res.send(updatedBook);
});

app.delete("/books/:id", verifyToken, async (req, res) => {
  const book = await findOwnBook(req, res);
  if (!book) return;

  await booksCollection.deleteOne({ _id: book._id });
  await borrowsCollection.deleteMany({ bookId: req.params.id });

  res.send({ message: "Book deleted", _id: req.params.id });
});

app.post("/borrows", verifyToken, async (req, res) => {
  const { bookId } = req.body;

  if (!ObjectId.isValid(bookId)) {
    return res.status(400).send({ message: "This book could not be found." });
  }

  const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });

  if (!book) {
    return res.status(404).send({ message: "This book could not be found." });
  }

  const alreadyBorrowed = await borrowsCollection.findOne({
    bookId,
    userEmail: req.user.email,
  });

  if (alreadyBorrowed) {
    return res
      .status(409)
      .send({ message: "You have already borrowed this book. Return it before borrowing again." });
  }

  const updatedBook = await booksCollection.findOneAndUpdate(
    { _id: book._id, availableCopies: { $gt: 0 } },
    { $inc: { availableCopies: -1 } },
    { returnDocument: "after" }
  );

  if (!updatedBook) {
    return res.status(409).send({ message: "Sorry, no copies of this book are available right now." });
  }

  const borrowDate = new Date();
  const returnDate = new Date(borrowDate.getTime() + BORROW_DAYS * 24 * 60 * 60 * 1000);

  const borrow = {
    bookId,
    bookTitle: book.title,
    bookImage: book.image,
    userEmail: req.user.email,
    userName: req.user.name,
    borrowDate,
    returnDate,
  };

  const result = await borrowsCollection.insertOne(borrow);
  res.status(201).send({ ...borrow, _id: result.insertedId, availableCopies: updatedBook.availableCopies });
});

app.get("/borrows", verifyToken, async (req, res) => {
  const borrows = await borrowsCollection
    .find({ userEmail: req.user.email })
    .sort({ borrowDate: -1 })
    .toArray();
  res.send(borrows);
});

app.delete("/borrows/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: "This borrow record was not found." });
  }

  const borrow = await borrowsCollection.findOneAndDelete({
    _id: new ObjectId(id),
    userEmail: req.user.email,
  });

  if (!borrow) {
    return res.status(404).send({ message: "This borrow record was not found." });
  }

  if (ObjectId.isValid(borrow.bookId)) {
    await booksCollection.updateOne(
      { _id: new ObjectId(borrow.bookId) },
      { $inc: { availableCopies: 1 } }
    );
  }

  res.send({ message: "Book returned", _id: id });
});

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`BookNook server running on http://localhost:${port}`);
  });
}

export default app;