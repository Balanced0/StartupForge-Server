const express = require("express");
const app = express();
const port = process.env.PORT;
require("dotenv").config();
app.use(express.json());
const cors = require("cors");
app.use(cors());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.MONGO_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db("StartUpForge");
    const startupCollection = db.collection("startups");

    //startup related apis
    app.post("/api/startups", async (req, res) => {
      const startup = req.body;
      const new_startup = {
        ...startup,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await startupCollection.insertOne(new_startup);
      res.send(result);
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
