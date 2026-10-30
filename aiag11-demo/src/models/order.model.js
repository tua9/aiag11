import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    serial: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: false, trim: true },
    price: { type: Number, required: false, min: 0 },
    address: { type: String, required: false, trim: true },
    customerName: { type: String, required: false, trim: true },
    customerAddress: { type: String, required: false, trim: true },
    phoneNumber: { type: String, required: false, trim: true },
    payMethod: { type: String, required: false, trim: true },
    videoBoxingUrl: { type: String, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

export default Order;
