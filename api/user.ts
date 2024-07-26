import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { logger, prisma } from "./config";

const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
const client = new OAuth2Client(clientId);

export const googleWebhook = async (req: Request, res: Response) => {
  const { credential, user_fingerprint } = req.body;
  if (!credential) {
    return res.status(400).json({ error: "No credential provided" });
  }
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential
    });

    const payload = ticket.getPayload();

    if (payload && payload.email) {
      const { sub: userId, email } = payload;
      let user = await prisma.user.findFirst({
        where: { email: email }
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email: email,
            user_fingerprint: parseInt(user_fingerprint, 10)
          }
        });
      }

      res.json({ token: issueJwtToken(user.id) });
    } else {
      res.status(401).json({ error: "Invalid token" });
    }
  } catch (error) {
    const err = error as Error;
    logger.error("Error verifying token", {
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: "Failed to verify token" });
  }
};

export const validateToken = async (req: Request, res: Response) => {
  const authHeader = req.header("Authorization");
  let token = "";

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const { userId, error } = decodeUserId(token);
  if (error) {
    return res.status(401).json({ message: `Unauthorized: Token` });
  }

  return res.status(200).json({ message: `Valid token` });
};

export const decodeUserId = (
  jwtToken: string
): { userId: string; error: boolean } => {
  try {
    const jwtkey = process.env.JWT_KEY ?? "";
    const decoded = jwt.verify(jwtToken, jwtkey) as {
      userId: string;
      exp: number;
    };

    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp < currentTime) {
      return { userId: "", error: true };
    }

    if (decoded && typeof decoded.userId === "string") {
      return { userId: decoded.userId, error: false };
    } else {
      return { userId: "", error: true };
    }
  } catch (error) {
    const err = error as Error;
    logger.error("Error decoding user token", {
      error: err.message,
      stack: err.stack
    });

    return { userId: "", error: true };
  }
};

const issueJwtToken = (userId: string): string => {
  const jwtKey = process.env.JWT_KEY ?? "";
  if (!jwtKey) {
    throw new Error("JWT key is not defined");
  }

  const payload = {
    userId: userId
  };

  const options = {
    expiresIn: "3h"
  };

  const token = jwt.sign(payload, jwtKey, options);
  return token;
};
