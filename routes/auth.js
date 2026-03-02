const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { body, validationResult } = require("express-validator");

const UserInfo = require("../models/auth");

const router = express.Router();

/** Helper: generate JWT */
function signToken(user) {
  return jwt.sign(
    { userId: user.userId, _id: user._id.toString(), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/** Helper: verify JWT (kept inside routes, no middleware folder) */
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

/** ===================== SIGNUP ===================== */
router.post(
  "/signup",
  [
    body("name")
      .trim()
      .notEmpty()
      .withMessage("Name is required")
      .isLength({ min: 2, max: 60 })
      .withMessage("Name must be 2-60 characters"),
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Invalid email")
      .normalizeEmail(),
    body("password")
      .notEmpty()
      .withMessage("Password is required")
      .isLength({ min: 8, max: 72 })
      .withMessage("Password must be 8-72 characters")
      .matches(/[A-Z]/)
      .withMessage("Password must include 1 uppercase letter")
      .matches(/[a-z]/)
      .withMessage("Password must include 1 lowercase letter")
      .matches(/[0-9]/)
      .withMessage("Password must include 1 number"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          ok: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { name, email, password } = req.body;

      const exists = await UserInfo.findOne({ email });
      if (exists) {
        return res.status(409).json({ ok: false, message: "Email already exists" });
      }

      const hashed = await bcrypt.hash(password, 12);

      const user = await UserInfo.create({
        userId: uuidv4(),
        name,
        email,
        password: hashed,
      });

      const token = signToken(user);

      return res.status(201).json({
        ok: true,
        message: "Signup successful",
        data: {
          token,
          userId: user.userId,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: "Server error" });
    }
  }
);

/** ===================== LOGIN ===================== */
router.post(
  "/login",
  [
    body("email").trim().notEmpty().withMessage("Email is required").isEmail().withMessage("Invalid email").normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          ok: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { email, password } = req.body;

      const user = await UserInfo.findOne({ email });
      if (!user) {
        return res.status(401).json({ ok: false, message: "Invalid email or password" });
      }

      const ok = await bcrypt.compare(password, user.password);
      if (!ok) {
        return res.status(401).json({ ok: false, message: "Invalid email or password" });
      }

      const token = signToken(user);

      return res.json({
        ok: true,
        message: "Login successful",
        data: {
          token,
          userId: user.userId,
          name: user.name,
          email: user.email,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: "Server error" });
    }
  }
);

/** ===================== ME (protected) ===================== */
router.get("/me", async (req, res) => {
  try {
    const decoded = requireAuth(req); // { userId, _id, email }

    const user = await UserInfo.findOne({ userId: decoded.userId }).select("-password");
    if (!user) return res.status(404).json({ ok: false, message: "User not found" });

    return res.json({ ok: true, data: user });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ ok: false, message: err.message || "Server error" });
  }
});

module.exports = router;