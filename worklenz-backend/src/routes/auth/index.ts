import express from "express";
import passport from "passport";

import AuthController from "../../controllers/auth-controller";

import signUpValidator from "../../middlewares/validators/sign-up-validator";
import resetEmailValidator from "../../middlewares/validators/reset-email-validator";
import updatePasswordValidator from "../../middlewares/validators/update-password-validator";
import passwordValidator from "../../middlewares/validators/password-validator";
import safeControllerFunction from "../../shared/safe-controller-function";

const authRouter = express.Router();

// Local authentication
const options = (key: string): passport.AuthenticateOptions => ({
  failureRedirect: `/secure/verify?strategy=${key}`,
  successRedirect: `/secure/verify?strategy=${key}`
});

authRouter.post("/login", passport.authenticate("local-login", options("login")));
authRouter.post("/signup", signUpValidator, passwordValidator, passport.authenticate("local-signup", options("signup")));
authRouter.post("/signup/check", signUpValidator, passwordValidator, safeControllerFunction(AuthController.status_check));
authRouter.get("/verify", AuthController.verify);
authRouter.get("/check-password", safeControllerFunction(AuthController.checkPasswordStrength));

authRouter.post("/reset-password", resetEmailValidator, safeControllerFunction(AuthController.reset_password));
authRouter.post("/update-password", updatePasswordValidator, passwordValidator, safeControllerFunction(AuthController.verify_reset_email));

authRouter.post("/verify-captcha", safeControllerFunction(AuthController.verifyCaptcha));

// Google authentication - only register routes if GOOGLE_LOGIN_ENABLED is true
if (process.env.GOOGLE_LOGIN_ENABLED === 'true') {
  authRouter.get("/google", (req, res) => {
    return passport.authenticate("google", {
      scope: ["email", "profile"],
      state: JSON.stringify({
        teamMember: req.query.teamMember || null,
        team: req.query.team || null,
        teamName: req.query.teamName || null,
        project: req.query.project || null
      })
    })(req, res);
  });

  authRouter.get("/google/verify", (req, res) => {
    let error = "";
    if ((req.session as any).error) {
      error = `?error=${encodeURIComponent((req.session as any).error as string)}`;
      delete (req.session as any).error;
    }

    const failureRedirect = process.env.LOGIN_FAILURE_REDIRECT + error;
    return passport.authenticate("google", {
      failureRedirect,
      successRedirect: process.env.LOGIN_SUCCESS_REDIRECT
    })(req, res);
  });
} else {
  // Return 404 for Google auth routes when disabled
  authRouter.get("/google", (req, res) => {
    res.status(404).json({ error: "Google authentication is disabled" });
  });
  
  authRouter.get("/google/verify", (req, res) => {
    res.status(404).json({ error: "Google authentication is disabled" });
  });
}

// Passport logout
authRouter.get("/logout", AuthController.logout);

export default authRouter;
