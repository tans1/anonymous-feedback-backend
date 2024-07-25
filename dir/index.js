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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const cors_1 = __importDefault(require("cors"));
const api_1 = require("./api/api");
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
dotenv_1.default.config();
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
app.use(body_parser_1.default.json({}));
app.use((0, cors_1.default)());
app.post("/google/webhook", api_1.googleWebhook);
app.post("/post/", api_1.createPost);
app.get("/user/post/", api_1.getUserPostsWithCommentCount);
app.get("/post/:id", api_1.getPostById);
app.post("/comment", api_1.createComment);
app.get("/validate/token/", api_1.validateToken);
const server = app.listen(4000, () => {
    console.log('Server running on port 4000');
});
process.on('SIGTERM', () => {
    server.close(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.$disconnect();
        process.exit(0);
    }));
});
process.on('SIGINT', () => {
    server.close(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.$disconnect();
        process.exit(0);
    }));
});
