"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateToken = exports.createComment = exports.getUserPostsWithCommentCount = exports.getPostById = exports.createPost = exports.googleWebhook = void 0;
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const google_auth_library_1 = require("google-auth-library");
const prisma = new client_1.PrismaClient();
const user_fingerprint_salt = 1000000007;
const clientId = (_a = process.env.GOOGLE_CLIENT_ID) !== null && _a !== void 0 ? _a : "";
const client = new google_auth_library_1.OAuth2Client(clientId);
const googleWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { credential, user_fingerprint } = req.body;
    if (!credential) {
        return res.status(400).json({ error: "No credential provided" });
    }
    try {
        const ticket = yield client.verifyIdToken({
            idToken: credential
        });
        const payload = ticket.getPayload();
        if (payload && payload.email) {
            const { sub: userId, email } = payload;
            let user = yield prisma.user.findFirst({
                where: { email: email }
            });
            if (!user) {
                user = yield prisma.user.create({
                    data: {
                        email: email,
                        user_fingerprint: parseInt(user_fingerprint, 10)
                    }
                });
            }
            res.json({ token: issueJwtToken(user.id) });
        }
        else {
            res.status(401).json({ error: "Invalid token" });
        }
    }
    catch (error) {
        console.error("Error verifying token:", error);
        res.status(500).json({ error: "Failed to verify token" });
    }
});
exports.googleWebhook = googleWebhook;
const createPost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const authHeader = req.header("Authorization");
    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }
    else {
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }
    const { userId, error } = decodeUserId(token);
    if (error) {
        return res.status(401).json({ message: `Unauthorized: Token` });
    }
    const { content, title } = req.body;
    try {
        yield prisma.post.create({
            data: {
                content,
                title,
                created_by: {
                    connect: { id: userId }
                }
            }
        });
        const posts = yield prisma.post.findMany({
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
        const result = posts.map((post) => (Object.assign(Object.assign({}, post), { commentsCount: post._count.comments })));
        res.status(200).json(result);
    }
    catch (error) {
        res.status(500).json({ error: "Error creating post" });
    }
});
exports.createPost = createPost;
const getPostById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { user_fingerprint } = req.query;
    let user = "";
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
            post = yield prisma.post.findFirst({
                where: { id },
                include: {
                    comments: true,
                    created_by: true
                }
            });
        }
        else {
            post = yield prisma.post.findFirst({
                where: { id },
                include: {
                    comments: {
                        where: {
                            user_fingerprint: parseInt(user_fingerprint, 10) + user_fingerprint_salt
                        }
                    },
                    created_by: true
                }
            });
        }
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }
        const sanitizedPost = Object.assign(Object.assign({}, post), { created_at: post.created_at.toISOString(), comments: post.comments.map((comment) => (Object.assign(Object.assign({}, comment), { user_fingerprint: comment.user_fingerprint.toString(), created_at: comment.created_at.toISOString() }))), created_by: Object.assign(Object.assign({}, post.created_by), { created_at: post.created_by.created_at.toISOString(), user_fingerprint: post.created_by.toString() }) });
        res.status(200).json(sanitizedPost);
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ error: "Error fetching post" });
    }
});
exports.getPostById = getPostById;
const getUserPostsWithCommentCount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const authHeader = req.header("Authorization");
    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }
    else {
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }
    const { userId, error } = decodeUserId(token);
    if (error) {
        return res.status(401).json({ message: `Unauthorized: Token` });
    }
    try {
        const posts = yield prisma.post.findMany({
            where: { user_id: userId },
            include: {
                _count: {
                    select: { comments: true }
                }
            }
        });
        const result = posts.map((post) => (Object.assign(Object.assign({}, post), { commentsCount: post._count.comments })));
        res.status(200).json(result);
    }
    catch (error) {
        console.error("Error fetching user posts:", error);
        res.status(500).json({ error: "Error fetching user posts" });
    }
});
exports.getUserPostsWithCommentCount = getUserPostsWithCommentCount;
const createComment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { content, user_fingerprint, postId } = req.body;
    const authHeader = req.header("Authorization");
    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }
    else {
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }
    const { userId, error } = decodeUserId(token);
    try {
        const user = parseInt(user_fingerprint, 10) + user_fingerprint_salt;
        yield prisma.comment.create({
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
            post = yield prisma.post.findUnique({
                where: { id: postId },
                include: {
                    comments: {
                        orderBy: {
                            created_at: "desc"
                        }
                    }
                }
            });
        }
        else {
            post = yield prisma.post.findUnique({
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
        const serializedPost = Object.assign(Object.assign({}, post), { comments: post.comments.map((comment) => (Object.assign(Object.assign({}, comment), { user_fingerprint: comment.user_fingerprint.toString() }))) });
        res.status(201).json(serializedPost);
    }
    catch (error) {
        console.error("Error creating comment:", error);
        res.status(500).json({ error: "Error creating comment" });
    }
});
exports.createComment = createComment;
const validateToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const authHeader = req.header("Authorization");
    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }
    else {
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }
    const { userId, error } = decodeUserId(token);
    if (error) {
        return res.status(401).json({ message: `Unauthorized: Token` });
    }
    return res.status(200).json({ message: `Valid token` });
});
exports.validateToken = validateToken;
const decodeUserId = (jwtToken) => {
    var _a;
    try {
        const jwtkey = (_a = process.env.JWT_KEY) !== null && _a !== void 0 ? _a : "";
        const decoded = jsonwebtoken_1.default.verify(jwtToken, jwtkey);
        const currentTime = Math.floor(Date.now() / 1000);
        if (decoded.exp < currentTime) {
            return { userId: "", error: true };
        }
        if (decoded && typeof decoded.userId === "string") {
            return { userId: decoded.userId, error: false };
        }
        else {
            return { userId: "", error: true };
        }
    }
    catch (error) {
        return { userId: "", error: true };
    }
};
const issueJwtToken = (userId) => {
    var _a;
    const jwtKey = (_a = process.env.JWT_KEY) !== null && _a !== void 0 ? _a : "";
    if (!jwtKey) {
        throw new Error("JWT key is not defined");
    }
    const payload = {
        userId: userId
    };
    const options = {
        expiresIn: "3h"
    };
    const token = jsonwebtoken_1.default.sign(payload, jwtKey, options);
    return token;
};
