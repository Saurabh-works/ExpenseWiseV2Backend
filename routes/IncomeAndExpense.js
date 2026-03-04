const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");

const UserInfo = require("../models/auth");
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

/** Get day name from YYYY-MM-DD */
function getDayName(dateStr) {
  const dt = new Date(`${dateStr}T00:00:00.000Z`);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[dt.getUTCDay()];
}

/**
 * Decide model from mount path:
 * /api/income -> Income
 * /api/expense -> Expense
 */
function getModel(req) {
  const base = req.baseUrl || ""; // "/api/income" or "/api/expense"
  if (base.includes("/income")) return Income;
  if (base.includes("/expense")) return Expense;

  const err = new Error("Invalid base route. Use /api/income or /api/expense");
  err.status = 400;
  throw err;
}

/**
 * POST /api/income/entry OR /api/expense/entry
 */
router.post(
  "/entry",
  [
    body("date").isISO8601().withMessage("date must be YYYY-MM-DD"),
    body("category").trim().notEmpty().withMessage("category is required"),
    body("description").optional().trim(),
    body("amount").isNumeric().withMessage("amount must be a number"),
  ],
  async (req, res) => {
    try {
      const decoded = requireAuth(req);
      const Model = getModel(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          ok: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const user = await UserInfo.findOne({ userId: decoded.userId }).select("userId name email");
      if (!user) return res.status(404).json({ ok: false, message: "User not found" });

      const { date, category, description = "", amount } = req.body;

      const doc = await Model.create({
        userId: user.userId,
        name: user.name,
        email: user.email,
        date,
        day: getDayName(date),
        category,
        description,
        amount: Number(amount),
      });

      return res.status(201).json({ ok: true, message: "Created", data: doc });
    } catch (err) {
      const status = err.status || 500;
      console.error(err);
      return res.status(status).json({ ok: false, message: err.message || "Server error" });
    }
  }
);

/**
 * GET /api/income/entries OR /api/expense/entries
 */
router.get("/entries", async (req, res) => {
  try {
    const decoded = requireAuth(req);
    const Model = getModel(req);

    const items = await Model.find({ userId: decoded.userId }).sort({ date: -1, createdAt: -1 });

    return res.json({ ok: true, data: items });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ ok: false, message: err.message || "Server error" });
  }
});

/**
 * GET /api/income/summary OR /api/expense/summary
 * Returns total of that collection for logged-in user
 */
router.get("/summary", async (req, res) => {
  try {
    const decoded = requireAuth(req);
    const Model = getModel(req);

    const rows = await Model.aggregate([
      { $match: { userId: decoded.userId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const total = rows?.[0]?.total || 0;
    return res.json({ ok: true, data: { total } });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ ok: false, message: err.message || "Server error" });
  }
});

/**
 * DELETE /api/income/entry/:id OR /api/expense/entry/:id
 */
router.delete("/entry/:id", async (req, res) => {
  try {
    const decoded = requireAuth(req);
    const Model = getModel(req);

    const deleted = await Model.findOneAndDelete({ _id: req.params.id, userId: decoded.userId });
    if (!deleted) return res.status(404).json({ ok: false, message: "Entry not found" });

    return res.json({ ok: true, message: "Deleted" });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ ok: false, message: err.message || "Server error" });
  }
});

module.exports = router;



// uncomment below code if you want to upload file by postman

// const multer = require("multer");
// const csv = require("csvtojson");

// // memory upload (no need to save file on disk)
// const upload = multer({ storage: multer.memoryStorage() });

// // ✅ CONSTANT USER (as you said)
// const FIXED_USER = {
//   userId: "744cf703-7459-45de-b14a-1f7fb17bdf6f",
//   name: "Saurabh Shinde",
//   email: "saurabhshindework@gmail.com",
// };

// // normalize date -> "YYYY-MM-DD"
// function normalizeDate(d) {
//   if (!d) return "";
//   // already YYYY-MM-DD
//   if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;

//   const dt = new Date(d);
//   if (Number.isNaN(dt.getTime())) return "";

//   const yyyy = dt.getUTCFullYear();
//   const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
//   const dd = String(dt.getUTCDate()).padStart(2, "0");
//   return `${yyyy}-${mm}-${dd}`;
// }

// // CSV IMPORT: POST /api/income/import-csv or /api/expense/import-csv
// router.post("/import-csv", upload.single("file"), async (req, res) => {
//   try {
//     const Model = getModel(req); // Income or Expense based on mount path

//     if (!req.file) {
//       return res.status(400).json({ ok: false, message: "CSV file is required (field name: file)" });
//     }

//     // parse CSV content
//     const csvText = req.file.buffer.toString("utf8");
//     const rows = await csv().fromString(csvText);

//     if (!rows.length) {
//       return res.status(400).json({ ok: false, message: "CSV is empty" });
//     }

//     // CSV columns expected:
//     // date, category, description, amount
//     // day optional (we can compute)
//     //
//     // NOTE: If your CSV has different headers, edit mapping below.
//     const docs = rows.map((r) => {
//       const date = normalizeDate(r.date || r.Date);
//       const category = (r.category || r.Category || "Other").toString().trim();
//       const description = (r.description || r.Description || "").toString().trim();
//       const amount = Number(r.amount ?? r.Amount);

//       const day = (r.day || r.Day || "").toString().trim() || getDayName(date);

//       return {
//         userId: FIXED_USER.userId,
//         name: FIXED_USER.name,
//         email: FIXED_USER.email,
//         date,
//         day,
//         category,
//         description,
//         amount,
//       };
//     });

//     // validate
//     const validDocs = docs.filter(
//       (d) =>
//         d.date &&
//         d.day &&
//         d.category &&
//         Number.isFinite(d.amount) &&
//         d.amount >= 0
//     );

//     // insert in chunks
//     const CHUNK = 500;
//     let inserted = 0;

//     for (let i = 0; i < validDocs.length; i += CHUNK) {
//       const part = validDocs.slice(i, i + CHUNK);
//       await Model.insertMany(part, { ordered: false });
//       inserted += part.length;
//     }

//     return res.json({
//       ok: true,
//       message: "CSV import completed",
//       data: {
//         collection: Model.modelName,
//         receivedRows: rows.length,
//         importedRows: inserted,
//         skippedRows: rows.length - inserted,
//       },
//     });
//   } catch (err) {
//     console.error(err);
//     return res.status(500).json({ ok: false, message: err.message || "Server error" });
//   }
// });