import "dotenv/config";
import express from "express";
import { runAgent } from "./agent/agent.js";
import connectDatabase from "./config/database.js";
import errorHandler from "./middleware/error-handler.js";
import upload from "./middleware/upload.js";
import apiRouter from "./routes/index.js";

const app = express();
app.use(express.json({ limit: "30mb" }));

app.post("/api/agent", upload.single("image"), async (req, res) => {
  try {
    const question = req.body.question;

    if (!question) {
      return res.status(400).json({
        error: "Vui lòng nhập question",
      });
    }

    const image = req.file?.buffer;

    const answer = await runAgent(question, image);

    res.json({ answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Agent xử lý thất bại" });
  }
});

app.use("/api", apiRouter);

app.use(errorHandler);

async function startServer() {
  await connectDatabase();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exitCode = 1;
});
