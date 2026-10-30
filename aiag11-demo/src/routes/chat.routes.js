import { Router } from "express";
import { runAgent } from "../agent/agent.js";
import upload from "../middleware/upload.js";

const router = Router();

router.post("/", upload.single("image"), async (req, res) => {
  const { message, image } = req.body;
  if (!message) return res.status(400).json({ error: "message is required." });

  try {
    const image = req.file?.buffer;

    const answer = await runAgent(message, image);

    res.json({ answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Agent xử lý thất bại" });
  }
});

export default router;
