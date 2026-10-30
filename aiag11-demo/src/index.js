import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import connectDatabase from "./config/database.js";
import errorHandler from "./middleware/error-handler.js";
import apiRouter from "./routes/index.js";
import morgan from "morgan";
import cors from "cors";

const app = express();
const complaintPdfDirectory = fileURLToPath(
  new URL("../assets/generated-complaints/", import.meta.url),
);

app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use(morgan("dev"));
app.use(
  "/files/complaints",
  express.static(complaintPdfDirectory, {
    setHeaders(response) {
      response.setHeader("Content-Disposition", "attachment");
    },
  }),
);

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
