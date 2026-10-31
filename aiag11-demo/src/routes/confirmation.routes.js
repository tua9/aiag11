import { Router } from "express";
import Order from "../models/order.model.js";
import { createSellerComplaintPdf } from "../services/seller-complaint-pdf.service.js";

const router = Router();

router.post("/", async (req, res) => {
  const serial =
    typeof req.body?.serial === "string" ? req.body.serial.trim() : "";
  const issueDescription =
    typeof req.body?.issueDescription === "string"
      ? req.body.issueDescription.trim()
      : "";

  if (
    !serial ||
    !issueDescription ||
    issueDescription.length > 500 ||
    req.body?.confirmed !== true
  ) {
    return res.status(400).json({
      error:
        "serial, issueDescription (tối đa 500 ký tự) và confirmed=true là bắt buộc.",
    });
  }

  const order = await Order.findOneAndUpdate(
    { serial },
    {
      $set: {
        confirmed: true,
        issueDescription,
        confirmedAt: new Date(),
      },
    },
    { new: true, runValidators: true },
  )
    .select("serial confirmed issueDescription confirmedAt")
    .lean();

  if (!order) {
    return res
      .status(404)
      .json({ error: `Không tìm thấy order serial ${serial}.` });
  }

  const complaintPdf = await createSellerComplaintPdf({
    serial: order.serial,
    issueDescription: order.issueDescription,
  });

  return res.json({
    confirmed: order.confirmed,
    serial: order.serial,
    issueDescription: order.issueDescription,
    confirmedAt: order.confirmedAt,
    complaintPdf,
  });
});

export default router;
