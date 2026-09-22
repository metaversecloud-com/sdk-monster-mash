import express from "express";
import {
  handleAbandonSection,
  handleAcknowledgeBanners,
  handleCastVote,
  handleClaimSection,
  handleDeleteMonster,
  handleGetGallery,
  handleGetMainApp,
  handleGetMonster,
  handleGetTrophy,
  handleGetVote,
  handleOpenMonsterDrawer,
  handleRefreshContent,
  handleResetLeaderboard,
  handleResumeSection,
  handleReturnToMainApp,
  handleStartMonster,
  handleSubmitSection,
  handleUpdateDraft,
} from "./controllers/index.js";
import { getVersion } from "@utils/getVersion.js";

const router = express.Router();
const SERVER_START_DATE = new Date();

router.get("/", (_req, res) => {
  res.json({ message: "Hello from Monster Mash server!" });
});

router.get("/system/health", (_req, res) => {
  return res.json({
    appVersion: getVersion(),
    status: "OK",
    serverStartDate: SERVER_START_DATE,
    envs: {
      NODE_ENV: process.env.NODE_ENV,
      INSTANCE_DOMAIN: process.env.INSTANCE_DOMAIN,
      INTERACTIVE_KEY: process.env.INTERACTIVE_KEY,
      S3_BUCKET: process.env.S3_BUCKET,
    },
  });
});

router.get("/main-app", handleGetMainApp);
router.post("/main-app/return", handleReturnToMainApp);

// Monster lifecycle
router.post("/monsters/start", handleStartMonster);
router.post("/monsters/:id/claim", handleClaimSection);
router.post("/monsters/:id/section", handleSubmitSection);
router.post("/monsters/:id/draft", handleUpdateDraft);
router.post("/monsters/:id/abandon", handleAbandonSection);
router.post("/monsters/:id/resume", handleResumeSection);
router.delete("/monsters/:id", handleDeleteMonster);

// Gallery + single monster
router.get("/gallery", handleGetGallery);
router.get("/monsters/:id", handleGetMonster);
router.post("/monsters/:id/open", handleOpenMonsterDrawer);

// Vote
router.get("/vote", handleGetVote);
router.post("/vote/cast", handleCastVote);

// Banner queues
router.post("/banners/acknowledge", handleAcknowledgeBanners);

// Trophy
router.get("/trophy", handleGetTrophy);
router.post("/leaderboard/reset", handleResetLeaderboard);

// Content
router.post("/content/refresh", handleRefreshContent);

export default router;
