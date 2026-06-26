require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT;
app.use(express.json());
const cors = require("cors");
app.use(cors());
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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

    app.get("/api/startups/featured", async (req, res) => {
      try {
        const startups = await startupCollection
          .find({ status: "active" })
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();

        const enriched = await Promise.all(
          startups.map(async (startup) => {
            const id = startup._id.toString();

            const openings_count = await opportunityCollection.countDocuments({
              startup_id: id,
              status: "open",
            });

            const opps = await opportunityCollection
              .find({ startup_id: id })
              .project({ _id: 1 })
              .toArray();

            const oppIds = opps.map((o) => o._id.toString());

            const members_count =
              oppIds.length > 0
                ? await db.collection("applications").countDocuments({
                    opportunity_id: { $in: oppIds },
                    status: "Accepted",
                  })
                : 0;

            return { ...startup, openings_count, members_count };
          }),
        );

        res.send(enriched);
      } catch (err) {
        res.status(500).send({
          message: "Failed to fetch featured startups",
          error: err.message,
        });
      }
    });

    app.get("/api/startups/browse", async (req, res) => {
      try {
        const { search, industry, funding_stage } = req.query;
        const query = { status: "active" };

        if (search) {
          query.$or = [
            { startup_name: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ];
        }
        if (industry && industry !== "All")
          query.industry = { $regex: industry, $options: "i" };
        if (funding_stage && funding_stage !== "All")
          query.funding_stage = funding_stage;

        const startups = await startupCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        const enriched = await Promise.all(
          startups.map(async (startup) => {
            const id = startup._id.toString();

            const openings_count = await opportunityCollection.countDocuments({
              startup_id: id,
              status: "open",
            });

            const opps = await opportunityCollection
              .find({ startup_id: id })
              .project({ _id: 1 })
              .toArray();

            const oppIds = opps.map((o) => o._id.toString());

            const members_count =
              oppIds.length > 0
                ? await db.collection("applications").countDocuments({
                    opportunity_id: { $in: oppIds },
                    status: "Accepted",
                  })
                : 0;

            return { ...startup, openings_count, members_count };
          }),
        );

        res.send(enriched);
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to fetch startups", error: err.message });
      }
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

    app.get("/api/opportunities/featured", async (req, res) => {
      try {
        const opportunities = await opportunityCollection
          .find({ status: "open" })
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();

        const enriched = await Promise.all(
          opportunities.map(async (opp) => {
            const startup = await startupCollection.findOne({
              _id: new ObjectId(opp.startup_id),
            });
            return {
              ...opp,
              startup_name: startup?.startup_name || "Unknown Startup",
              startup_logo: startup?.logo || null,
            };
          }),
        );

        res.send(enriched);
      } catch (err) {
        res.status(500).send({
          message: "Failed to fetch featured opportunities",
          error: err.message,
        });
      }
    });

    app.get("/api/opportunities/browse", async (req, res) => {
      try {
        const { search, work_type, industry, page = 1, limit = 9 } = req.query;
        const query = { status: "open" };

        if (search) {
          query.$or = [
            { role_title: { $regex: search, $options: "i" } },
            {
              required_skills: {
                $elemMatch: { $regex: search, $options: "i" },
              },
            },
          ];
        }

        if (work_type && work_type !== "All") {
          query.work_type = { $in: work_type.split(",") };
        }

        let startupIds = null;
        if (industry && industry !== "All") {
          const matchingStartups = await startupCollection
            .find({ industry: { $regex: industry, $options: "i" } })
            .project({ _id: 1 })
            .toArray();
          startupIds = matchingStartups.map((s) => s._id.toString());
          query.startup_id = { $in: startupIds };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await opportunityCollection.countDocuments(query);

        const opportunities = await opportunityCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        const enriched = await Promise.all(
          opportunities.map(async (opp) => {
            const startup = await startupCollection.findOne({
              _id: new ObjectId(opp.startup_id),
            });
            return {
              ...opp,
              startup_name: startup?.startup_name || "Unknown Startup",
              startup_logo: startup?.logo || null,
              industry: startup?.industry || null,
            };
          }),
        );

        res.send({
          opportunities: enriched,
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
        });
      } catch (err) {
        res.status(500).send({
          message: "Failed to fetch opportunities",
          error: err.message,
        });
      }
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
        return res
          .status(400)
          .send({ message: "You have already applied to this opportunity." });
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

      const applications = await db
        .collection("applications")
        .aggregate([
          { $match: query },
          {
            $addFields: {
              opportunity_id_obj: {
                $cond: {
                  if: {
                    $eq: [
                      { $strLenCP: { $ifNull: ["$opportunity_id", ""] } },
                      24,
                    ],
                  },
                  then: { $toObjectId: "$opportunity_id" },
                  else: null,
                },
              },
            },
          },
          {
            $lookup: {
              from: "opportunities",
              localField: "opportunity_id_obj",
              foreignField: "_id",
              as: "opportunity",
            },
          },
          {
            $unwind: { path: "$opportunity", preserveNullAndEmptyArrays: true },
          },
          {
            $addFields: {
              startup_id_obj: {
                $cond: {
                  if: {
                    $and: [
                      { $gt: ["$opportunity", null] },
                      {
                        $eq: [
                          {
                            $strLenCP: {
                              $ifNull: ["$opportunity.startup_id", ""],
                            },
                          },
                          24,
                        ],
                      },
                    ],
                  },
                  then: { $toObjectId: "$opportunity.startup_id" },
                  else: null,
                },
              },
            },
          },
          {
            $lookup: {
              from: "startups",
              localField: "startup_id_obj",
              foreignField: "_id",
              as: "startup",
            },
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
              opportunity_name: {
                $ifNull: ["$opportunity.role_title", "Unknown Role"],
              },
              startup_name: {
                $ifNull: ["$startup.startup_name", "Unknown Startup"],
              },
            },
          },
          { $sort: { createdAt: -1 } },
        ])
        .toArray();

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
              : (skills || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
            bio,
            updatedAt: new Date(),
          },
        },
      );
      res.send(result);
    });

    // Admin dashboard related APIs
    app.get("/api/admin/stats", async (req, res) => {
      try {
        const totalUsers = await db.collection("user").countDocuments();
        const totalStartups = await db.collection("startups").countDocuments();
        const totalOpportunities = await db
          .collection("opportunities")
          .countDocuments();
        const totalRevenue = 0;
        res.send({
          totalUsers,
          totalStartups,
          totalOpportunities,
          totalRevenue,
        });
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to fetch stats", error: err.message });
      }
    });

    app.get("/api/admin/users", async (req, res) => {
      try {
        const users = await db.collection("user").find({}).toArray();
        res.send(users);
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to fetch users", error: err.message });
      }
    });

    app.post("/api/admin/users/:email/block", async (req, res) => {
      try {
        const { email } = req.params;
        const result = await db
          .collection("user")
          .updateOne({ email }, { $set: { isBlocked: true } });
        res.send({ success: true, result });
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to block user", error: err.message });
      }
    });

    app.post("/api/admin/users/:email/unblock", async (req, res) => {
      try {
        const { email } = req.params;
        const result = await db
          .collection("user")
          .updateOne({ email }, { $set: { isBlocked: false } });
        res.send({ success: true, result });
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to unblock user", error: err.message });
      }
    });

    app.get("/api/admin/startups", async (req, res) => {
      try {
        const startups = await db
          .collection("startups")
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        res.send(startups);
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to fetch startups", error: err.message });
      }
    });

    app.post("/api/admin/startups/:id/approve", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await db
          .collection("startups")
          .updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: "active", updatedAt: new Date() } },
          );
        res.send({ success: true, result });
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to approve startup", error: err.message });
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
        res
          .status(500)
          .send({ message: "Failed to remove startup", error: err.message });
      }
    });

    app.get("/api/admin/transactions", async (req, res) => {
      try {
        // dummy
        const mockTransactions = [
          {
            _id: "t1",
            user: "alex.founder@example.com",
            amount: 49.0,
            date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            paymentStatus: "Succeeded",
          },
          {
            _id: "t2",
            user: "sarah.jones@example.com",
            amount: 99.0,
            date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            paymentStatus: "Succeeded",
          },
          {
            _id: "t3",
            user: "michael.smith@example.com",
            amount: 49.0,
            date: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
            paymentStatus: "Pending",
          },
        ];
        res.send(mockTransactions);
      } catch (err) {
        res.status(500).send({
          message: "Failed to fetch transactions",
          error: err.message,
        });
      }
    });

    // Stripe payment related APIs
    app.post("/api/payments/create-checkout", async (req, res) => {
      try {
        const { user_email } = req.body;

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer_email: user_email,
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: "StartupForge Premium",
                  description: "Unlimited opportunity postings for founders",
                },
                unit_amount: 4900,
              },
              quantity: 1,
            },
          ],
          success_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/founder/opportunities/new`,
        });

        res.send({ url: session.url });
      } catch (err) {
        res.status(500).send({
          message: "Failed to create checkout session",
          error: err.message,
        });
      }
    });

    app.post("/api/payments/verify", async (req, res) => {
      try {
        const { session_id } = req.body;

        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status !== "paid") {
          return res.status(400).send({ message: "Payment not completed" });
        }

        const user_email = session.customer_email;

        const existing = await db.collection("payments").findOne({
          transaction_id: session.id,
        });

        if (!existing) {
          await db.collection("payments").insertOne({
            user_email,
            amount: session.amount_total / 100,
            transaction_id: session.id,
            payment_status: "succeeded",
            paid_at: new Date(),
            createdAt: new Date(),
          });

          await db
            .collection("user")
            .updateOne(
              { email: user_email },
              { $set: { isPremium: true, updatedAt: new Date() } },
            );
        }

        res.send({ success: true, user_email });
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to verify payment", error: err.message });
      }
    });

    app.get("/api/payments/status/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const user = await db.collection("user").findOne({ email });
        res.send({ isPremium: user?.isPremium || false });
      } catch (err) {
        res.status(500).send({ message: "Failed to check premium status" });
      }
    });

    // Founder overview dashboard API
    app.get("/api/founder/overview", async (req, res) => {
      try {
        const { founder_email } = req.query;
        if (!founder_email) {
          return res.status(400).send({ message: "founder_email is required" });
        }

        const startups = await startupCollection
          .find({ founder_email })
          .toArray();

        const startupIds = startups.map((s) => s._id.toString());

        const opportunities =
          startupIds.length > 0
            ? await opportunityCollection
                .find({ startup_id: { $in: startupIds } })
                .toArray()
            : [];

        const opportunityIds = opportunities.map((o) => o._id.toString());

        const applications =
          opportunityIds.length > 0
            ? await db
                .collection("applications")
                .find({ opportunity_id: { $in: opportunityIds } })
                .sort({ applied_at: -1 })
                .toArray()
            : [];

        const totalStartups = startups.length;
        const totalOpportunities = opportunities.length;
        const totalApplications = applications.length;
        const acceptedApplications = applications.filter(
          (a) => a.status === "Accepted"
        ).length;

        const now = new Date();
        const monthLabels = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          monthLabels.push({
            key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
            label: d.toLocaleString("en-US", { month: "short" }),
          });
        }

        const appsByMonth = monthLabels.map(({ key, label }) => {
          const count = applications.filter((a) => {
            const date = new Date(a.applied_at || a.createdAt);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
            return monthKey === key;
          }).length;
          return { month: label, applications: count };
        });

        const workTypeMap = {};
        opportunities.forEach((o) => {
          const types = Array.isArray(o.work_type)
            ? o.work_type
            : [o.work_type || "Other"];
          types.forEach((t) => {
            workTypeMap[t] = (workTypeMap[t] || 0) + 1;
          });
        });
        const opportunitiesByWorkType = Object.entries(workTypeMap).map(
          ([name, value]) => ({ name, value })
        );

        const statusMap = { Pending: 0, Accepted: 0, Rejected: 0 };
        applications.forEach((a) => {
          const s = a.status || "Pending";
          if (statusMap[s] !== undefined) statusMap[s]++;
          else statusMap["Pending"]++;
        });
        const applicationsByStatus = Object.entries(statusMap).map(
          ([status, count]) => ({ status, count })
        );

        const oppMap = {};
        opportunities.forEach((o) => {
          oppMap[o._id.toString()] = o.role_title || "Unknown Role";
        });

        const recentApplications = applications.slice(0, 5).map((a) => ({
          _id: a._id,
          applicant_email: a.applicant_email,
          opportunity_name: oppMap[a.opportunity_id] || "Unknown Role",
          status: a.status || "Pending",
          applied_at: a.applied_at || a.createdAt,
        }));

        res.send({
          stats: {
            totalStartups,
            totalOpportunities,
            totalApplications,
            acceptedApplications,
          },
          appsByMonth,
          opportunitiesByWorkType,
          applicationsByStatus,
          recentApplications,
        });
      } catch (err) {
        res.status(500).send({
          message: "Failed to fetch founder overview",
          error: err.message,
        });
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
