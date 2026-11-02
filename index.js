import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion } from "mongodb";

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

app.get("/", async (req, res) => {
  try {
    await db.command({ ping: 1 });
    res.send({ message: "BookNook server is running", database: "connected" });
  } catch (error) {
    res.status(500).send({ message: "BookNook server is running", database: "not connected", error: error.message });
  }
});

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`BookNook server running on http://localhost:${port}`);
  });
}

export default app;