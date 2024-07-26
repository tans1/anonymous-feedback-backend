import { Request, Response } from "express";
import { logger, prisma } from "./config";
import { decodeUserId } from "./user";

const user_fingerprint_salt = 1000000007;

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
    const err = error as Error;
    logger.error("Error creating post", {
      error: err.message,
      stack: err.stack
    });
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
    const err = error as Error;
    logger.error("Error fetching post by Id", {
      error: err.message,
      stack: err.stack
    });

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
    const err = error as Error;
    logger.error("Error fetching user posts", {
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({ error: "Error fetching user posts" });
  }
};
