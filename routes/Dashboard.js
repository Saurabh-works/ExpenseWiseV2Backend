const express = require("express");
const jwt = require("jsonwebtoken");

const Income = require("../models/income");
const Expense = require("../models/expense");

const router = express.Router();

/** JWT verify */
function requireAuth(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    const err = new Error("No token provided");
    err.status = 401;
    throw err;
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    const err = new Error("Invalid/expired token");
    err.status = 401;
    throw err;
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getMonthRange(year, month) {
  const y = Number(year);
  const m = Number(month);

  if (!Number.isInteger(y) || y < 1970 || y > 3000) {
    const err = new Error("Invalid year");
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    const err = new Error("Invalid month");
    err.status = 400;
    throw err;
  }

  const start = `${y}-${pad2(m)}-01`;
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const endExclusive = `${nextYear}-${pad2(nextMonth)}-01`;

  return { start, endExclusive };
}

const expenseCategories = [
  "Housing",
  "Food",
  "Transportation",
  "Bills",
  "Healthcare",
  "Personal Care",
  "Entertainment",
  "Shopping",
  "Other",
];

/**
 * GET /api/dashboard/recent?limit=5
 * Returns last N records combining income + expense (sorted by date + createdAt)
 */
router.get("/recent", async (req, res) => {
  try {
    const decoded = requireAuth(req);
    const limit = Math.min(20, Math.max(1, Number(req.query.limit || 5)));

    const [inc, exp] = await Promise.all([
      Income.find({ userId: decoded.userId })
        .sort({ date: -1, createdAt: -1 })
        .limit(limit)
        .lean(),
      Expense.find({ userId: decoded.userId })
        .sort({ date: -1, createdAt: -1 })
        .limit(limit)
        .lean(),
    ]);

    const merged = [
      ...inc.map((x) => ({ ...x, entryType: "income" })),
      ...exp.map((x) => ({ ...x, entryType: "expense" })),
    ];

    merged.sort((a, b) => {
      // date is YYYY-MM-DD so string compare works, then createdAt tie-break
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      const at = new Date(a.createdAt).getTime();
      const bt = new Date(b.createdAt).getTime();
      return bt - at;
    });

    return res.json({ ok: true, data: merged.slice(0, limit) });
  } catch (err) {
    const status = err.status || 500;
    console.error(err);
    return res.status(status).json({ ok: false, message: err.message || "Server error" });
  }
});

/**
 * GET /api/dashboard/expense-by-month?year=2026
 * Returns 12 values: total expense amount for each month
 */
router.get("/expense-by-month", async (req, res) => {
  try {
    const decoded = requireAuth(req);
    const year = Number(req.query.year);

    if (!Number.isInteger(year) || year < 1970 || year > 3000) {
      return res.status(400).json({ ok: false, message: "Invalid year" });
    }

    // Aggregate by month from date string "YYYY-MM-DD"
    // month = substr(date, 5, 2)
    const rows = await Expense.aggregate([
      { $match: { userId: decoded.userId, date: { $gte: `${year}-01-01`, $lt: `${year + 1}-01-01` } } },
      {
        $project: {
          amount: 1,
          month: { $substrCP: ["$date", 5, 2] },
        },
      },
      { $group: { _id: "$month", total: { $sum: "$amount" } } },
    ]);

    const map = new Map(rows.map((r) => [r._id, r.total]));
    const data = Array.from({ length: 12 }, (_, i) => {
      const key = pad2(i + 1);
      return map.get(key) || 0;
    });

    return res.json({ ok: true, data });
  } catch (err) {
    const status = err.status || 500;
    console.error(err);
    return res.status(status).json({ ok: false, message: err.message || "Server error" });
  }
});

/**
 * GET /api/dashboard/expense-by-category?year=2026&month=3
 * Returns totals per category for that month
 */
router.get("/expense-by-category", async (req, res) => {
  try {
    const decoded = requireAuth(req);
    const { year, month } = req.query;

    const { start, endExclusive } = getMonthRange(year, month);

    const rows = await Expense.aggregate([
      { $match: { userId: decoded.userId, date: { $gte: start, $lt: endExclusive } } },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
    ]);

    const totalsByCat = {};
    expenseCategories.forEach((c) => (totalsByCat[c] = 0));
    rows.forEach((r) => {
      const key = r._id;
      if (typeof totalsByCat[key] === "number") totalsByCat[key] = r.total;
      else totalsByCat[key] = r.total; // if some unexpected category exists, include it
    });

    return res.json({ ok: true, data: totalsByCat });
  } catch (err) {
    const status = err.status || 500;
    console.error(err);
    return res.status(status).json({ ok: false, message: err.message || "Server error" });
  }
});

/**
 * GET /api/dashboard/totals?year=2026
 * Returns total income amount + total expense amount for that year
 * Also includes record counts.
 */
router.get("/totals", async (req, res) => {
  try {
    const decoded = requireAuth(req);
    const year = Number(req.query.year);

    if (!Number.isInteger(year) || year < 1970 || year > 3000) {
      return res.status(400).json({ ok: false, message: "Invalid year" });
    }

    const start = `${year}-01-01`;
    const endExclusive = `${year + 1}-01-01`;

    const match = { userId: decoded.userId, date: { $gte: start, $lt: endExclusive } };

    const [incomeAgg, expenseAgg, incomeCount, expenseCount] = await Promise.all([
      Income.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Expense.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Income.countDocuments(match),
      Expense.countDocuments(match),
    ]);

    const totalIncome = incomeAgg?.[0]?.total || 0;
    const totalExpense = expenseAgg?.[0]?.total || 0;

    return res.json({
      ok: true,
      data: {
        year,
        totalIncome,
        totalExpense,
        incomeCount,
        expenseCount,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    console.error(err);
    return res.status(status).json({ ok: false, message: err.message || "Server error" });
  }
});

module.exports = router;