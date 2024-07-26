import { Request, Response } from "express";
import { logger, prisma, sendEmailNotification } from "./config";
import { decodeUserId } from "./user";

const user_fingerprint_salt = 1000000007;

export const createComment = async (req: Request, res: Response) => {
  const { content, user_fingerprint, postId } = req.body;

  const authHeader = req.header("Authorization");
  let token = "";

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }
  const { userId, error } = decodeUserId(token);

  try {
    const fingerprint = parseInt(user_fingerprint as string, 10) + user_fingerprint_salt;
    let post;

    await prisma.comment.create({
      data: {
        content,
        user_fingerprint: fingerprint,
        post: {
          connect: { id: postId }
        }
      }
    });
    if (!error && userId.length > 0) {
      post = await prisma.post.findUnique({
        where: { id: postId },
        include: {
          created_by: true,
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
          created_by: true,
          comments: {
            where: {
              user_fingerprint: fingerprint
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

    sendEmailNotification(post.created_by.email, content, post.title);

    const serializedPost = {
      ...post,
      created_by: {
        ...post.created_by,
        user_fingerprint: post.created_by.user_fingerprint.toString()
      },
      comments: post.comments.map((comment) => ({
        ...comment,
        user_fingerprint: comment.user_fingerprint.toString()
      }))
    };

    res.status(201).json(serializedPost);
  } catch (error) {
    const err = error as Error;
    logger.error("Error creating comment", {
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({ error: "Error creating comment" }); 
  }
};
