import Order from "../models/order.model.js";
import ReturnOrder from "../models/return-order.model.js";
import { createSellerComplaintPdf } from "../services/seller-complaint-pdf.service.js";
import { compareProductVideo } from "../services/product-video-comparison.service.js";

const MAX_RESULTS = 20;

function serialFilter(serial) {
  const value = typeof serial === "string" ? serial.trim() : "";
  return value ? { serial: value } : {};
}

async function acceptPendingReturnOrder({ serial } = {}) {
  const normalizedSerial =
    typeof serial === "string" || typeof serial === "number"
      ? String(serial).trim()
      : "";
  if (!normalizedSerial) {
    return { accepted: false, message: "serial là bắt buộc." };
  }

  const updatedReturnOrder = await ReturnOrder.findOneAndUpdate(
    { serial: normalizedSerial, status: "pending" },
    { $set: { status: "accepted" } },
    { new: true, runValidators: true, sort: { createdAt: -1 } },
  )
    .select("serial status updatedAt")
    .lean();

  if (updatedReturnOrder) {
    return { accepted: true, returnOrder: updatedReturnOrder };
  }

  const returnOrder = await ReturnOrder.findOne({ serial: normalizedSerial })
    .sort({ createdAt: -1 })
    .select("serial status")
    .lean();
  if (!returnOrder) {
    return {
      accepted: false,
      message: `Không tìm thấy ReturnOrder có serial ${normalizedSerial}.`,
    };
  }

  return {
    accepted: false,
    returnOrder,
    message: `ReturnOrder mới nhất của serial ${normalizedSerial} đang ở trạng thái ${returnOrder.status}, không phải pending.`,
  };
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
  accept_return_order: acceptPendingReturnOrder,
  create_seller_complaint_pdf: async ({ serial, issueDescription } = {}) =>
    createSellerComplaintPdf({ serial, issueDescription }),
  compare_product_video: async ({ orderId, returnOrderId } = {}) =>
    compareProductVideo({ orderId, returnOrderId }),
};
