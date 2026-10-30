import { Router } from "express";
import Order from "../models/order.model.js";
import ReturnOrder from "../models/return-order.model.js";
import upload from "../middleware/upload.js";
import { uploadVideo } from "../services/cloudinary.service.js";

const router = Router();

router.get("/", async (req, res) => {
  const orders = await Order.find();
  return res.json(orders);
});

router.post("/", upload.single("file"), async (req, res) => {
  const { serial } = req.body;
  if (await Order.exists({ serial })) {
    return res
      .status(400)
      .json({ error: "An order with this serial already exists." });
  }
  if (!req.file)
    return res.status(400).json({ error: "A video file is required." });

  const videoBoxingUrl = await uploadVideo(req.file.buffer, "orders/boxing");
  const order = await Order.create({ ...req.body, videoBoxingUrl });
  return res.status(201).json(order);
});

router.get("/returns", async (req, res) => {
  const returnOrders = await ReturnOrder.find();
  return res.json(returnOrders);
});

function getVideoBuffer(dataUrl) {
  if (typeof dataUrl !== "string") return null;

  const match = dataUrl.match(
    /^data:video\/[\w.+-]+;base64,([A-Za-z0-9+/=\r\n]+)$/,
  );
  if (!match) return null;

  const buffer = Buffer.from(match[1], "base64");
  return buffer.length > 0 && buffer.length <= 20 * 1024 * 1024 ? buffer : null;
}

router.post("/returns", upload.single("file"), async (req, res) => {
  const videoBuffer = req.file?.buffer || getVideoBuffer(req.body?.returnVideo);
  if (!videoBuffer) {
    return res.status(400).json({
      error: "A return video file or base64 video under 20 MB is required.",
    });
  }

  const returnVideoUrl = await uploadVideo(videoBuffer, "orders/returns");
  const returnOrder = await ReturnOrder.create({
    serial: req.body?.serial,
    returnVideoUrl,
  });
  return res.status(201).json(returnOrder);
});

export default router;
