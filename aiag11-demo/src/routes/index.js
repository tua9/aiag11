import { Router } from "express";
import chatRoutes from "./chat.routes.js";
import orderRoutes from "./order.routes.js";

const router = Router();

router.use("/chat", chatRoutes);
router.use("/orders", orderRoutes);

export default router;
