const express = require("express");
const jwt = require("jsonwebtoken");
const ExcelJS = require("exceljs");

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

function getModelByType(type) {
  const t = String(type || "").toLowerCase();
  if (t === "income") return Income;
  if (t === "expense") return Expense;

  const err = new Error("Invalid type. Use income or expense");
  err.status = 400;
  throw err;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * date is stored as "YYYY-MM-DD" string
 * so $gte/$lt string compare works correctly for month range
 */
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

/**
 * GET /api/report?year=2026&month=3&type=expense&page=1&limit=10
 */
router.get("/", async (req, res) => {
  try {
    const decoded = requireAuth(req);

    const { year, month, type } = req.query;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));

    const Model = getModelByType(type);
    const { start, endExclusive } = getMonthRange(year, month);

    // IMPORTANT: filtering by logged-in user's userId from token
    const match = {
      userId: decoded.userId, // if your token uses different key, change here
      date: { $gte: start, $lt: endExclusive },
    };

    const skip = (page - 1) * limit;

    const [items, totalRecords, totalAgg] = await Promise.all([
      Model.find(match).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
      Model.countDocuments(match),
      Model.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const totalAmount = totalAgg?.[0]?.total || 0;

    return res.json({
      ok: true,
      data: {
        items,
        page,
        limit,
        totalRecords,
        totalAmount,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    console.error(err);
    return res.status(status).json({ ok: false, message: err.message || "Server error" });
  }
});

/**
 * GET /api/report/download?year=2026&month=3&type=expense
 */
router.get("/download", async (req, res) => {
  try {
    const decoded = requireAuth(req);

    const { year, month, type } = req.query;
    const Model = getModelByType(type);
    const { start, endExclusive } = getMonthRange(year, month);

    const match = {
      userId: decoded.userId, // if your token uses different key, change here
      date: { $gte: start, $lt: endExclusive },
    };

    const rows = await Model.find(match).sort({ date: -1, createdAt: -1 });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Report");

    ws.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Day", key: "day", width: 14 },
      { header: "Category", key: "category", width: 18 },
      { header: "Description", key: "description", width: 34 },
      { header: "Amount", key: "amount", width: 12 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: "middle" };

    let total = 0;
    rows.forEach((r) => {
      total += Number(r.amount || 0);
      ws.addRow({
        date: r.date,
        day: r.day,
        category: r.category,
        description: r.description || "",
        amount: Number(r.amount || 0),
      });
    });

    const totalRow = ws.addRow({
      date: "",
      day: "",
      category: "",
      description: "TOTAL",
      amount: total,
    });
    totalRow.font = { bold: true };

    ws.getColumn("amount").numFmt = "0.00";

    const filename = `Report_${String(type).toLowerCase()}_${year}-${pad2(month)}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    const status = err.status || 500;
    console.error(err);
    return res.status(status).json({ ok: false, message: err.message || "Server error" });
  }
});

module.exports = router;