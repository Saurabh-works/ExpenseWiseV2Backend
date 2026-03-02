const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true }, // your unique token-type id
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true }, // hashed
  },
  { timestamps: true } // adds createdAt / updatedAt
);

// Force collection name exactly: UserInfo
module.exports = mongoose.model("UserInfo", userSchema, "UserInfo");