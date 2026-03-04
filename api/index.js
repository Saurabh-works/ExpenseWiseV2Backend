const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("../routes/auth");

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

// 🔹 IMPORTANT: connect once (Vercel-friendly)
let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  await mongoose.connect(process.env.MONGO_URI);
  isConnected = true;
  console.log("✅ MongoDB connected");
}

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("DB error:", err.message);
    res.status(500).json({ ok: false, message: "Database error" });
  }
});

// routes
app.use("/api/auth", authRoutes);
app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/income", require("../routes/IncomeAndExpense"));
app.use("/api/expense", require("../routes/IncomeAndExpense"));
app.get("/", (req, res) => res.json({ ok: true, message: "Backend running" }));



// ❌ NO app.listen()
module.exports = app;