import { Request, Response } from "express";
import { Post, PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";

const prisma = new PrismaClient();
const user_fingerprint_salt = 1000000007;
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
    console.error("Error verifying token:", error);
    res.status(500).json({ error: "Failed to verify token" });
  }
};

export const createPost = async (req: Request, res: Response) => {
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

  const { content, title } = req.body;
  try {
    await prisma.post.create({
      data: {
        content,
        title,
        created_by: {
          connect: { id: userId }
        }
      }
    });

    const posts = await prisma.post.findMany({
      where: { user_id: userId },
      include: {
        _count: {
          select: { comments: true }
        }
      },
      orderBy: {
        created_at: "desc"
      }
    });

    const result = posts.map((post) => ({
      ...post,
      commentsCount: post._count.comments
    }));

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Error creating post" });
  }
};

export const getPostById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { user_fingerprint } = req.query;

  let user: string = "";
  let token = "";
  const authHeader = req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }
  const { userId, error } = decodeUserId(token);
  if (!error) {
    user = userId;
  }
  try {
    let post;
    if (user) {
      post = await prisma.post.findFirst({
        where: { id },
        include: {
          comments: true,
          created_by: true
        }
      });
    } else {
      post = await prisma.post.findFirst({
        where: { id },
        include: {
          comments: {
            where: {
              user_fingerprint:
                parseInt(user_fingerprint as string, 10) + user_fingerprint_salt
            }
          },
          created_by: true
        }
      });
    }
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const sanitizedPost = {
      ...post,
      created_at: post.created_at.toISOString(),
      comments: post.comments.map((comment) => ({
        ...comment,
        user_fingerprint: comment.user_fingerprint.toString(),
        created_at: comment.created_at.toISOString()
      })),
      created_by: {
        ...post.created_by,
        created_at: post.created_by.created_at.toISOString(),
        user_fingerprint: post.created_by.toString()
      }
    };
    res.status(200).json(sanitizedPost);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Error fetching post" });
  }
};

export const getUserPostsWithCommentCount = async (
  req: Request,
  res: Response
) => {
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

  try {
    const posts = await prisma.post.findMany({
      where: { user_id: userId },
      include: {
        _count: {
          select: { comments: true }
        }
      }
    });

    const result = posts.map((post) => ({
      ...post,
      commentsCount: post._count.comments
    }));

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching user posts:", error);
    res.status(500).json({ error: "Error fetching user posts" });
  }
};

export const createComment = async (req: Request, res: Response) => {
  const { content, user_fingerprint, postId } = req.body;

  const authHeader = req.header("Authorization");
  let token = "";

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } 
  // else {
  //   return res.status(401).json({ message: "Unauthorized: No token provided" });
  // }

  const { userId, error } = decodeUserId(token);

  try {
    const user =
      parseInt(user_fingerprint as string, 10) + user_fingerprint_salt;

    await prisma.comment.create({
      data: {
        content,
        user_fingerprint: user,
        post: {
          connect: { id: postId }
        }
      }
    });

    let post;
    if (!error && userId.length > 0) {
      post = await prisma.post.findUnique({
        where: { id: postId },
        include: {
          comments: {
            orderBy: {
              created_at: "desc"
            }
          }
        }
      });
    } else {
      post = await prisma.post.findUnique({
        where: { id: postId },
        include: {
          comments: {
            where: {
              user_fingerprint: user
            },
            orderBy: {
              created_at: "desc"
            }
          }
        }
      });
    }

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const serializedPost = {
      ...post,
      comments: post.comments.map((comment) => ({
        ...comment,
        user_fingerprint: comment.user_fingerprint.toString()
      }))
    };

    res.status(201).json(serializedPost);
  } catch (error) {
    console.error("Error creating comment:", error);
    res.status(500).json({ error: "Error creating comment" });
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

const decodeUserId = (jwtToken: string): { userId: string; error: boolean } => {
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
