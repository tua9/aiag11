import mongoose from "mongoose";

const returnOrderSchema = new mongoose.Schema(
  {
    serial: { type: String, trim: true },
    returnVideoUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const ReturnOrder =
  mongoose.models.ReturnOrder ||
  mongoose.model("ReturnOrder", returnOrderSchema);

export default ReturnOrder;
