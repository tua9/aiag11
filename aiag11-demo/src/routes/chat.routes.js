import { Router } from "express";
import { runAgent } from "../agent/agent.js";

const router = Router();

router.post("/", async (req, res) => {
  const { message, image } = req.body;
  if (!message) return res.status(400).json({ error: "message is required." });

  const answer = await runAgent(message, image);
  return res.json({ answer });
});

export default router;
