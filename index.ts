import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import { googleWebhook, validateToken } from "./api/user";
import { createPost, getPostById, getUserPostsWithCommentCount } from "./api/post";
import { createComment } from "./api/comment";
import {prisma} from "./api/config";

dotenv.config();

const app = express();


app.use(bodyParser.json({}));
app.use(cors({
  origin: "https://anonfeedback.vercel.app"
}));

// app.use(cors());

app.get('',async (req: Request, res:Response) => {
  return res.send("Hello world")
})
app.post("/google/webhook", googleWebhook);
app.post("/post/", createPost);
app.get("/user/post/", getUserPostsWithCommentCount);
app.get("/post/:id", getPostById);
app.post("/comment", createComment);
app.get("/validate/token/",validateToken)

const server = app.listen(4000, () => {
  console.log('Server running on port 4000');
});

process.on('SIGTERM', () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
});
