const mongoose = require("mongoose");

const incomeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },

    date: { type: String, required: true }, // YYYY-MM-DD
    day: { type: String, required: true },  // Monday etc
    category: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

incomeSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model("Income", incomeSchema, "Income");