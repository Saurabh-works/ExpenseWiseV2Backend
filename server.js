const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/income", require("./routes/IncomeAndExpense"));
app.use("/api/expense", require("./routes/IncomeAndExpense"));

app.get("/", (req, res) => res.json({ ok: true, message: "Backend running" }));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(process.env.PORT || 5000, () =>
      console.log(`✅ Server running on ${process.env.PORT || 5000}`)
    );
  })
  .catch((err) => {
    console.error("❌ MongoDB connect error:", err.message);
    process.exit(1);
  });