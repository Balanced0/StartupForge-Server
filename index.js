require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT;
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
    const opportunityCollection = db.collection("opportunities");

    //startup related apis
    app.get("/api/startups", async (req, res) => {
      const { founder_email } = req.query;
      const query = founder_email ? { founder_email } : {};
      const startups = await startupCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
      res.send(startups);
    });

    app.get("/api/startups/:id", async (req, res) => {
      const id = req.params.id;
      const startup = await startupCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(startup);
    });

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

    app.patch("/api/startups/:id", async (req, res) => {
      const id = req.params.id;
      const updates = req.body;
      const result = await startupCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { ...updates, updatedAt: new Date() } },
      );
      res.send(result);
    });

    app.delete("/api/startups/:id", async (req, res) => {
      const id = req.params.id;
      const result = await startupCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    //Opportunity related apis
    app.post("/api/opportunities", async (req, res) => {
      const opportunity = req.body;
      const doc = {
        ...opportunity,
        status: "open",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await opportunityCollection.insertOne(doc);
      res.send(result);
    });

    app.get("/api/opportunities", async (req, res) => {
      const { startup_id } = req.query;
      const query = startup_id ? { startup_id } : {};
      const opportunities = await opportunityCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
      res.send(opportunities);
    });

    app.get("/api/opportunities/:id", async (req, res) => {
      const id = req.params.id;
      const opportunity = await opportunityCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(opportunity);
    });

    app.patch("/api/opportunities/:id", async (req, res) => {
      const id = req.params.id;
      const updates = req.body;
      const result = await opportunityCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { ...updates, updatedAt: new Date() } },
      );
      res.send(result);
    });

    app.delete("/api/opportunities/:id", async (req, res) => {
      const id = req.params.id;
      const result = await opportunityCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // Application related APIs
    app.post("/api/applications", async (req, res) => {
      const application = req.body;
      const existing = await db.collection("applications").findOne({
        opportunity_id: application.opportunity_id,
        applicant_email: application.applicant_email,
      });
      if (existing) {
        return res.status(400).send({ message: "You have already applied to this opportunity." });
      }
      const doc = {
        ...application,
        status: "Pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await db.collection("applications").insertOne(doc);
      res.send(result);
    });

    app.get("/api/applications", async (req, res) => {
      const { applicant_email } = req.query;
      const query = applicant_email ? { applicant_email } : {};
      
      const applications = await db.collection("applications").aggregate([
        { $match: query },
        {
          $addFields: {
            opportunity_id_obj: {
              $cond: {
                if: { $eq: [{ $strLenCP: { $ifNull: ["$opportunity_id", ""] } }, 24] },
                then: { $toObjectId: "$opportunity_id" },
                else: null
              }
            }
          }
        },
        {
          $lookup: {
            from: "opportunities",
            localField: "opportunity_id_obj",
            foreignField: "_id",
            as: "opportunity"
          }
        },
        { $unwind: { path: "$opportunity", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            startup_id_obj: {
              $cond: {
                if: {
                  $and: [
                    { $gt: ["$opportunity", null] },
                    { $eq: [{ $strLenCP: { $ifNull: ["$opportunity.startup_id", ""] } }, 24] }
                  ]
                },
                then: { $toObjectId: "$opportunity.startup_id" },
                else: null
              }
            }
          }
        },
        {
          $lookup: {
            from: "startups",
            localField: "startup_id_obj",
            foreignField: "_id",
            as: "startup"
          }
        },
        { $unwind: { path: "$startup", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            opportunity_id: 1,
            applicant_email: 1,
            portfolio_link: 1,
            motivation_message: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            opportunity_name: { $ifNull: ["$opportunity.role_title", "Unknown Role"] },
            startup_name: { $ifNull: ["$startup.startup_name", "Unknown Startup"] }
          }
        },
        { $sort: { createdAt: -1 } }
      ]).toArray();
      
      res.send(applications);
    });

    // User Profile related APIs
    app.get("/api/users/:email", async (req, res) => {
      const { email } = req.params;
      const user = await db.collection("users").findOne({ email });
      res.send(user || {});
    });

    app.patch("/api/users/:email", async (req, res) => {
      const { email } = req.params;
      const { name, image, skills, bio } = req.body;
      const result = await db.collection("users").updateOne(
        { email },
        {
          $set: {
            name,
            image,
            skills: Array.isArray(skills)
              ? skills
              : (skills || "").split(",").map((s) => s.trim()).filter(Boolean),
            bio,
            updatedAt: new Date()
          }
        }
      );
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
