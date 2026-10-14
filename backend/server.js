require("dotenv").config();

const express = require("express");
const cors = require("cors");
const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
} = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());

// ==============================
// MongoDB Configuration
// ==============================

if (!MONGODB_URI) {
  console.error("MONGODB_URI is missing from environment variables.");
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;
let usageCollection;
let timetableCollection;
let server;

// ==============================
// Health Checks
// ==============================

app.get("/", (req, res) => {
  res.json({
    message: "FocusFlow backend is running!",
    database: db ? "connected" : "disconnected",
  });
});

app.get("/health", (req, res) => {
  res.status(db ? 200 : 503).json({
    status: db ? "ok" : "starting",
    database: db ? "connected" : "disconnected",
  });
});

// ==============================
// Usage API
// ==============================

// POST /api/usage
app.post("/api/usage", async (req, res) => {
  try {
    const { domain, duration, category, timestamp } = req.body;

    if (typeof domain !== "string" || !domain.trim()) {
      return res.status(400).json({
        error: "domain is required",
      });
    }

    if (duration === undefined || duration === null) {
      return res.status(400).json({
        error: "duration is required",
      });
    }

    const numericDuration = Number(duration);

    if (!Number.isFinite(numericDuration) || numericDuration < 0) {
      return res.status(400).json({
        error: "duration must be a valid non-negative number",
      });
    }

    const usageTimestamp = timestamp
      ? new Date(timestamp)
      : new Date();

    if (Number.isNaN(usageTimestamp.getTime())) {
      return res.status(400).json({
        error: "Invalid timestamp",
      });
    }

    const record = {
      domain: domain.trim().toLowerCase(),
      duration: numericDuration,
      category: category || "Uncategorized",
      timestamp: usageTimestamp,
      dateKey: usageTimestamp.toISOString().split("T")[0],
      createdAt: new Date(),
    };

    const result = await usageCollection.insertOne(record);

    res.status(201).json({
      message: "Usage data saved",
      data: {
        id: result.insertedId.toString(),
        ...record,
      },
    });
  } catch (error) {
    console.error("Failed to save usage:", error.message);

    res.status(500).json({
      error: "Failed to save usage data",
    });
  }
});

// GET /api/usage
app.get("/api/usage", async (req, res) => {
  try {
    const filter = {};

    if (req.query.date) {
      filter.dateKey = req.query.date;
    }

    const records = await usageCollection
      .find(filter)
      .sort({ timestamp: -1 })
      .toArray();

    const formattedRecords = records.map((record) => ({
      id: record._id.toString(),
      domain: record.domain,
      duration: record.duration,
      category: record.category,
      timestamp: record.timestamp,
      dateKey: record.dateKey,
    }));

    res.json(formattedRecords);
  } catch (error) {
    console.error("Failed to fetch usage:", error.message);

    res.status(500).json({
      error: "Failed to fetch usage data",
    });
  }
});

// GET /api/usage/summary
app.get("/api/usage/summary", async (req, res) => {
  try {
    const matchStage = {};

    if (req.query.date) {
      matchStage.dateKey = req.query.date;
    }

    const summary = await usageCollection
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$domain",
            totalDuration: { $sum: "$duration" },
            category: { $first: "$category" },
            sessions: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            domain: "$_id",
            duration: "$totalDuration",
            category: 1,
            sessions: 1,
          },
        },
        { $sort: { duration: -1 } },
      ])
      .toArray();

    res.json(summary);
  } catch (error) {
    console.error("Failed to generate summary:", error.message);

    res.status(500).json({
      error: "Failed to generate usage summary",
    });
  }
});

// DELETE /api/usage
app.delete("/api/usage", async (req, res) => {
  try {
    const result = await usageCollection.deleteMany({});

    console.log(`Deleted ${result.deletedCount} usage records`);

    res.json({
      message: "Usage data reset successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Failed to reset usage:", error.message);

    res.status(500).json({
      error: "Failed to reset usage data",
    });
  }
});

// ==============================
// Timetable Helpers
// ==============================

const validDays = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

function normalizeDomain(domain) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function validateTimetable(data, partial = false) {
  const { title, domain, time, days } = data;

  if (!partial || title !== undefined) {
    if (typeof title !== "string" || !title.trim()) {
      return "title is required";
    }
  }

  if (!partial || domain !== undefined) {
    if (typeof domain !== "string" || !domain.trim()) {
      return "domain is required";
    }
  }

  if (!partial || time !== undefined) {
    if (
      typeof time !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    ) {
      return "time must be in HH:MM format";
    }
  }

  if (!partial || days !== undefined) {
    if (
      !Array.isArray(days) ||
      days.length === 0 ||
      days.some((day) => !validDays.includes(day))
    ) {
      return "Select at least one valid day";
    }
  }

  return null;
}

// ==============================
// Timetable API
// ==============================

// GET /api/timetable
app.get("/api/timetable", async (req, res) => {
  try {
    const timetable = await timetableCollection
      .find({})
      .sort({ time: 1, createdAt: -1 })
      .toArray();

    res.json(
      timetable.map((item) => ({
        id: item._id.toString(),
        title: item.title,
        domain: item.domain,
        time: item.time,
        days: item.days,
        enabled: item.enabled,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }))
    );
  } catch (error) {
    console.error("Failed to fetch timetable:", error.message);

    res.status(500).json({
      error: "Failed to fetch timetable",
    });
  }
});

// POST /api/timetable
app.post("/api/timetable", async (req, res) => {
  try {
    const validationError = validateTimetable(req.body);

    if (validationError) {
      return res.status(400).json({
        error: validationError,
      });
    }

    const { title, domain, time, days, enabled } = req.body;

    const item = {
      title: title.trim(),
      domain: normalizeDomain(domain),
      time,
      days,
      enabled: typeof enabled === "boolean" ? enabled : true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await timetableCollection.insertOne(item);

    res.status(201).json({
      message: "Timetable item created",
      data: {
        id: result.insertedId.toString(),
        ...item,
      },
    });
  } catch (error) {
    console.error("Failed to create timetable:", error.message);

    res.status(500).json({
      error: "Failed to create timetable item",
    });
  }
});

// PUT /api/timetable/:id
app.put("/api/timetable/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "Invalid timetable ID",
      });
    }

    const { title, domain, time, days, enabled } = req.body;

    const validationError = validateTimetable(
      { title, domain, time, days },
      true
    );

    if (validationError) {
      return res.status(400).json({
        error: validationError,
      });
    }

    const updateData = {};

    if (title !== undefined) {
      updateData.title = title.trim();
    }

    if (domain !== undefined) {
      updateData.domain = normalizeDomain(domain);
    }

    if (time !== undefined) {
      updateData.time = time;
    }

    if (days !== undefined) {
      updateData.days = days;
    }

    if (enabled !== undefined) {
      if (typeof enabled !== "boolean") {
        return res.status(400).json({
          error: "enabled must be a boolean",
        });
      }

      updateData.enabled = enabled;
    }

    updateData.updatedAt = new Date();

    const result = await timetableCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: "Timetable item not found",
      });
    }

    const updated = await timetableCollection.findOne({
      _id: new ObjectId(id),
    });

    res.json({
      message: "Timetable item updated",
      data: {
        id: updated._id.toString(),
        title: updated.title,
        domain: updated.domain,
        time: updated.time,
        days: updated.days,
        enabled: updated.enabled,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error("Failed to update timetable:", error.message);

    res.status(500).json({
      error: "Failed to update timetable item",
    });
  }
});

// DELETE /api/timetable/:id
app.delete("/api/timetable/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "Invalid timetable ID",
      });
    }

    const result = await timetableCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: "Timetable item not found",
      });
    }

    res.json({
      message: "Timetable item deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete timetable:", error.message);

    res.status(500).json({
      error: "Failed to delete timetable item",
    });
  }
});

// ==============================
// Start Server
// ==============================

async function startServer() {
  try {
    console.log("Connecting to MongoDB...");

    await client.connect();
    await client.db("admin").command({ ping: 1 });

    db = client.db("focusflow");
    usageCollection = db.collection("usage");
    timetableCollection = db.collection("timetables");

    await usageCollection.createIndex({ timestamp: -1 });
    await usageCollection.createIndex({ dateKey: 1, domain: 1 });
    await timetableCollection.createIndex({ enabled: 1, time: 1 });
    await timetableCollection.createIndex({ domain: 1 });

    console.log("MongoDB connected successfully.");

    server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`FocusFlow backend listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Backend startup failed:", error.message);

    await client.close().catch(() => {});
    process.exit(1);
  }
}

// ==============================
// Graceful Shutdown
// ==============================

async function shutdown() {
  console.log("Shutting down FocusFlow backend...");

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await client.close().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();