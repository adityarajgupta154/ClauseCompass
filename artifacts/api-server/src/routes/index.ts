import { Router, type IRouter } from "express";
import documentsRouter from "./documents";
import healthRouter from "./health";
import sessionsRouter from "./sessions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(documentsRouter);
router.use(sessionsRouter);

export default router;
