require("dotenv").config();

const express = require("express");
const cors = require("cors");
const {
  MongoClient,
  ServerApiVersion,
  ObjectId
} = require("mongodb");

const app = express();
const PORT = 3000;

// ===============================
// Middleware
// ===============================

app.use(cors());
app.use(express.json());

// ===============================
// MongoDB
// ===============================

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is missing from .env");
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
});

let db;
let usageCollection;
let timetableCollection;

// ===============================
// Health Check
// ===============================

app.get("/", (req, res) => {
  res.json({
    message: "FocusFlow backend is running!",
    database: db ? "connected" : "disconnected"
  });
});

// ============================================================
// USAGE API
// ============================================================

// ===============================
// POST /api/usage
// Receive usage data from extension
// ===============================

app.post("/api/usage", async (req, res) => {
  try {
    const {
      domain,
      duration,
      category,
      timestamp
    } = req.body;

    if (!domain) {
      return res.status(400).json({
        error: "domain is required"
      });
    }

    if (duration === undefined || duration === null) {
      return res.status(400).json({
        error: "duration is required"
      });
    }

    const numericDuration = Number(duration);

    if (Number.isNaN(numericDuration) || numericDuration < 0) {
      return res.status(400).json({
        error: "duration must be a valid positive number"
      });
    }

    const usageTimestamp = timestamp
      ? new Date(timestamp)
      : new Date();

    if (Number.isNaN(usageTimestamp.getTime())) {
      return res.status(400).json({
        error: "Invalid timestamp"
      });
    }

    const dateKey = usageTimestamp
      .toISOString()
      .split("T")[0];

    const record = {
      domain: domain.toLowerCase(),
      duration: numericDuration,
      category: category || "Uncategorized",
      timestamp: usageTimestamp,
      dateKey,
      createdAt: new Date()
    };

    const result = await usageCollection.insertOne(record);

    console.log("✅ Usage saved:", {
      id: result.insertedId,
      domain: record.domain,
      duration: record.duration,
      dateKey: record.dateKey
    });

    res.status(201).json({
      message: "Usage data saved",
      data: {
        id: result.insertedId.toString(),
        ...record
      }
    });

  } catch (error) {
    console.error("❌ Failed to save usage:", error);

    res.status(500).json({
      error: "Failed to save usage data"
    });
  }
});

// ===============================
// GET /api/usage
// Get usage data
// ===============================

app.get("/api/usage", async (req, res) => {
  try {
    const { date } = req.query;

    const filter = {};

    if (date) {
      filter.dateKey = date;
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
      dateKey: record.dateKey
    }));

    res.json(formattedRecords);

  } catch (error) {
    console.error("❌ Failed to fetch usage:", error);

    res.status(500).json({
      error: "Failed to fetch usage data"
    });
  }
});

// ===============================
// GET /api/usage/summary
// Aggregated usage by website
// ===============================

app.get("/api/usage/summary", async (req, res) => {
  try {
    const { date } = req.query;

    const matchStage = {};

    if (date) {
      matchStage.dateKey = date;
    }

    const summary = await usageCollection.aggregate([
      {
        $match: matchStage
      },
      {
        $group: {
          _id: "$domain",

          totalDuration: {
            $sum: "$duration"
          },

          category: {
            $first: "$category"
          },

          sessions: {
            $sum: 1
          }
        }
      },
      {
        $project: {
          _id: 0,
          domain: "$_id",
          duration: "$totalDuration",
          category: 1,
          sessions: 1
        }
      },
      {
        $sort: {
          duration: -1
        }
      }
    ]).toArray();

    res.json(summary);

  } catch (error) {
    console.error("❌ Failed to generate summary:", error);

    res.status(500).json({
      error: "Failed to generate usage summary"
    });
  }
});

// ===============================
// DELETE /api/usage
// Reset usage data
// ===============================

app.delete("/api/usage", async (req, res) => {
  try {
    const result = await usageCollection.deleteMany({});

    console.log(
      `🗑️ Deleted ${result.deletedCount} usage records`
    );

    res.json({
      message: "Usage data reset successfully",
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error("❌ Failed to reset usage:", error);

    res.status(500).json({
      error: "Failed to reset usage data"
    });
  }
});

// ============================================================
// TIMETABLE API
// ============================================================

// ===============================
// GET /api/timetable
// Get all timetable items
// ===============================

app.get("/api/timetable", async (req, res) => {
  try {
    const timetable = await timetableCollection
      .find({})
      .sort({
        time: 1,
        createdAt: -1
      })
      .toArray();

    const formattedTimetable = timetable.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      domain: item.domain,
      time: item.time,
      days: item.days,
      enabled: item.enabled,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));

    res.json(formattedTimetable);

  } catch (error) {
    console.error("❌ Failed to fetch timetable:", error);

    res.status(500).json({
      error: "Failed to fetch timetable"
    });
  }
});

// ===============================
// POST /api/timetable
// Create timetable item
// ===============================

app.post("/api/timetable", async (req, res) => {
  try {
    const {
      title,
      domain,
      time,
      days,
      enabled
    } = req.body;

    // -------------------------------
    // Validation
    // -------------------------------

    if (!title || !title.trim()) {
      return res.status(400).json({
        error: "title is required"
      });
    }

    if (!domain || !domain.trim()) {
      return res.status(400).json({
        error: "domain is required"
      });
    }

    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({
        error: "time must be in HH:MM format"
      });
    }

    const [hours, minutes] = time.split(":").map(Number);

    if (
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return res.status(400).json({
        error: "Invalid time"
      });
    }

    if (!Array.isArray(days) || days.length === 0) {
      return res.status(400).json({
        error: "At least one day must be selected"
      });
    }

    const validDays = [
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun"
    ];

    const invalidDays = days.filter(
      (day) => !validDays.includes(day)
    );

    if (invalidDays.length > 0) {
      return res.status(400).json({
        error: "Invalid day supplied",
        invalidDays
      });
    }

    // -------------------------------
    // Create timetable item
    // -------------------------------

    const item = {
      title: title.trim(),

      domain: domain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, ""),

      time,

      days,

      enabled:
        typeof enabled === "boolean"
          ? enabled
          : true,

      createdAt: new Date(),

      updatedAt: new Date()
    };

    const result =
      await timetableCollection.insertOne(item);

    console.log("📅 Timetable created:", {
      id: result.insertedId,
      title: item.title,
      domain: item.domain,
      time: item.time,
      days: item.days
    });

    res.status(201).json({
      message: "Timetable item created",
      data: {
        id: result.insertedId.toString(),
        ...item
      }
    });

  } catch (error) {
    console.error(
      "❌ Failed to create timetable:",
      error
    );

    res.status(500).json({
      error: "Failed to create timetable item"
    });
  }
});

// ===============================
// PUT /api/timetable/:id
// Update timetable item
// ===============================

app.put("/api/timetable/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "Invalid timetable ID"
      });
    }

    const {
      title,
      domain,
      time,
      days,
      enabled
    } = req.body;

    const updateData = {};

    // -------------------------------
    // Validate title
    // -------------------------------

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({
          error: "title cannot be empty"
        });
      }

      updateData.title = title.trim();
    }

    // -------------------------------
    // Validate domain
    // -------------------------------

    if (domain !== undefined) {
      if (!domain.trim()) {
        return res.status(400).json({
          error: "domain cannot be empty"
        });
      }

      updateData.domain = domain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "");
    }

    // -------------------------------
    // Validate time
    // -------------------------------

    if (time !== undefined) {
      if (!/^\d{2}:\d{2}$/.test(time)) {
        return res.status(400).json({
          error: "time must be in HH:MM format"
        });
      }

      const [hours, minutes] =
        time.split(":").map(Number);

      if (
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
      ) {
        return res.status(400).json({
          error: "Invalid time"
        });
      }

      updateData.time = time;
    }

    // -------------------------------
    // Validate days
    // -------------------------------

    if (days !== undefined) {
      const validDays = [
        "Mon",
        "Tue",
        "Wed",
        "Thu",
        "Fri",
        "Sat",
        "Sun"
      ];

      if (!Array.isArray(days) || days.length === 0) {
        return res.status(400).json({
          error: "At least one day must be selected"
        });
      }

      const invalidDays = days.filter(
        (day) => !validDays.includes(day)
      );

      if (invalidDays.length > 0) {
        return res.status(400).json({
          error: "Invalid day supplied",
          invalidDays
        });
      }

      updateData.days = days;
    }

    // -------------------------------
    // Enabled
    // -------------------------------

    if (enabled !== undefined) {
      updateData.enabled = Boolean(enabled);
    }

    updateData.updatedAt = new Date();

    // -------------------------------
    // Update MongoDB
    // -------------------------------

    const result =
      await timetableCollection.updateOne(
        {
          _id: new ObjectId(id)
        },
        {
          $set: updateData
        }
      );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: "Timetable item not found"
      });
    }

    const updated =
      await timetableCollection.findOne({
        _id: new ObjectId(id)
      });

    console.log("✏️ Timetable updated:", id);

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
        updatedAt: updated.updatedAt
      }
    });

  } catch (error) {
    console.error(
      "❌ Failed to update timetable:",
      error
    );

    res.status(500).json({
      error: "Failed to update timetable item"
    });
  }
});

// ===============================
// DELETE /api/timetable/:id
// Delete timetable item
// ===============================

app.delete("/api/timetable/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "Invalid timetable ID"
      });
    }

    const result =
      await timetableCollection.deleteOne({
        _id: new ObjectId(id)
      });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: "Timetable item not found"
      });
    }

    console.log("🗑️ Timetable deleted:", id);

    res.json({
      message: "Timetable item deleted successfully"
    });

  } catch (error) {
    console.error(
      "❌ Failed to delete timetable:",
      error
    );

    res.status(500).json({
      error: "Failed to delete timetable item"
    });
  }
});

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
  try {
    console.log("🔄 Connecting to MongoDB...");

    await client.connect();

    // Verify connection
    await client.db("admin").command({
      ping: 1
    });

    console.log("✅ MongoDB connected successfully!");

    // -------------------------------
    // Database
    // -------------------------------

    db = client.db("focusflow");

    // -------------------------------
    // Collections
    // -------------------------------

    usageCollection =
      db.collection("usage");

    timetableCollection =
      db.collection("timetables");

    // -------------------------------
    // Usage indexes
    // -------------------------------

    await usageCollection.createIndex({
      timestamp: -1
    });

    await usageCollection.createIndex({
      dateKey: 1,
      domain: 1
    });

    // -------------------------------
    // Timetable indexes
    // -------------------------------

    await timetableCollection.createIndex({
      enabled: 1,
      time: 1
    });

    await timetableCollection.createIndex({
      domain: 1
    });

    // -------------------------------
    // Start Express
    // -------------------------------

    app.listen(PORT, () => {
      console.log(
        `🚀 FocusFlow backend running at http://localhost:${PORT}`
      );

      console.log(
        `📊 Usage API: http://localhost:${PORT}/api/usage`
      );

      console.log(
        `📈 Summary API: http://localhost:${PORT}/api/usage/summary`
      );

      console.log(
        `📅 Timetable API: http://localhost:${PORT}/api/timetable`
      );
    });

  } catch (error) {
    console.error(
      "❌ MongoDB connection failed:"
    );

    console.error(error);

    process.exit(1);
  }
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

process.on("SIGINT", async () => {
  console.log(
    "\n🛑 Shutting down FocusFlow backend..."
  );

  await client.close();

  console.log(
    "✅ MongoDB connection closed."
  );

  process.exit(0);
});

process.on("SIGTERM", async () => {
  await client.close();

  process.exit(0);
});

// ============================================================
// START EVERYTHING
// ============================================================

startServer();