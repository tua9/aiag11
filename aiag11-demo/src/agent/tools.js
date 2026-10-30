import Order from "../models/order.model.js";
import ReturnOrder from "../models/return-order.model.js";
import { createSellerComplaintPdf } from "../services/seller-complaint-pdf.service.js";
import { compareProductVideo } from "../services/product-video-comparison.service.js";

const MAX_RESULTS = 20;

function serialFilter(serial) {
  const value = typeof serial === "string" ? serial.trim() : "";
  return value ? { serial: value } : {};
}

export const tools = {
  get_orders: async ({ serial } = {}) =>
    Order.find(serialFilter(serial))
      .select("serial name price createdAt updatedAt")
      .sort({ createdAt: -1 })
      .limit(MAX_RESULTS)
      .lean(),
  get_return_orders: async ({ serial } = {}) =>
    ReturnOrder.find(serialFilter(serial))
      .select("serial status createdAt updatedAt")
      .sort({ createdAt: -1 })
      .limit(MAX_RESULTS)
      .lean(),
  create_seller_complaint_pdf: async ({ serial } = {}) =>
    createSellerComplaintPdf({ serial }),
  compare_product_video: async ({ orderId, returnOrderId } = {}) =>
    compareProductVideo({ orderId, returnOrderId }),
};
