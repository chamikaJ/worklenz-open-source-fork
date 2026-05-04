import express from "express";
import ClientsController from "../../controllers/clients-controller";
import safeControllerFunction from "../../shared/safe-controller-function";
import { featureFlags } from "../../config/feature-flags";

const public_router = express.Router();

public_router.post("/new-subscriber", safeControllerFunction(ClientsController.addSubscriber));
public_router.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

// Slack OAuth callback (public - no authentication required)
if (featureFlags.enableSlackIntegration) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const SlackController = require("../../controllers/slack-controller").default;
        public_router.get("/slack/oauth/callback", safeControllerFunction(SlackController.oauthCallback));
    } catch (error) {
        console.warn("[public-router] optional slack controller not loaded");
    }
}

export default public_router;
