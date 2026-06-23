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
        applied_at: new Date(),
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
            applied_at: 1,
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
      const user = await db.collection("user").findOne({ email });
      res.send(user || {});
    });

    app.patch("/api/users/:email", async (req, res) => {
      const { email } = req.params;
      const { name, image, skills, bio } = req.body;
      const result = await db.collection("user").updateOne(
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

    // Admin dashboard related APIs
    app.get("/api/admin/stats", async (req, res) => {
      try {
        const totalUsers = await db.collection("user").countDocuments();
        const totalStartups = await db.collection("startups").countDocuments();
        const totalOpportunities = await db.collection("opportunities").countDocuments();
        const totalRevenue = 0;
        res.send({ totalUsers, totalStartups, totalOpportunities, totalRevenue });
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch stats", error: err.message });
      }
    });

    app.get("/api/admin/users", async (req, res) => {
      try {
        const users = await db.collection("user").find({}).toArray();
        res.send(users);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch users", error: err.message });
      }
    });

    app.post("/api/admin/users/:email/block", async (req, res) => {
      try {
        const { email } = req.params;
        const result = await db.collection("user").updateOne(
          { email },
          { $set: { isBlocked: true } }
        );
        res.send({ success: true, result });
      } catch (err) {
        res.status(500).send({ message: "Failed to block user", error: err.message });
      }
    });

    app.post("/api/admin/users/:email/unblock", async (req, res) => {
      try {
        const { email } = req.params;
        const result = await db.collection("user").updateOne(
          { email },
          { $set: { isBlocked: false } }
        );
        res.send({ success: true, result });
      } catch (err) {
        res.status(500).send({ message: "Failed to unblock user", error: err.message });
      }
    });

    app.get("/api/admin/startups", async (req, res) => {
      try {
        const startups = await db.collection("startups").find({}).sort({ createdAt: -1 }).toArray();
        res.send(startups);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch startups", error: err.message });
      }
    });

    app.post("/api/admin/startups/:id/approve", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await db.collection("startups").updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "active", updatedAt: new Date() } }
        );
        res.send({ success: true, result });
      } catch (err) {
        res.status(500).send({ message: "Failed to approve startup", error: err.message });
      }
    });

    app.delete("/api/admin/startups/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await db.collection("startups").deleteOne({
          _id: new ObjectId(id),
        });
        res.send({ success: true, result });
      } catch (err) {
        res.status(500).send({ message: "Failed to remove startup", error: err.message });
      }
    });

    app.get("/api/admin/transactions", async (req, res) => {
      try {
        // dummy
        const mockTransactions = [
          {
            _id: "t1",
            user: "alex.founder@example.com",
            amount: 49.00,
            date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            paymentStatus: "Succeeded"
          },
          {
            _id: "t2",
            user: "sarah.jones@example.com",
            amount: 99.00,
            date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            paymentStatus: "Succeeded"
          },
          {
            _id: "t3",
            user: "michael.smith@example.com",
            amount: 49.00,
            date: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
            paymentStatus: "Pending"
          }
        ];
        res.send(mockTransactions);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch transactions", error: err.message });
      }
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
