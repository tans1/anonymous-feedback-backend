import { PrismaClient } from "@prisma/client";
import winston from "winston";
import nodemailer from "nodemailer";

export const logger = winston.createLogger({
  level: "error",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
      return `${timestamp} ${level}: ${message} ${JSON.stringify(metadata)}`;
    })
  ),
  transports: [new winston.transports.Console()]
});

export const prisma = new PrismaClient();
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SENDER_EMAIL ?? "",
    pass: process.env.SENDER_PASS ?? ""
  }
});

export const sendEmailNotification = async (
  receiverEmail: string,
  mailContent: string,
  postTitle: string
) => {
  try {
    const truncatedContent =
      mailContent.length > 100
        ? mailContent.substring(0, 100) + "..."
        : mailContent;

    const mailOptions = {
      from: process.env.SENDER_EMAIL,
      to: receiverEmail,
      subject: "🌟 New Feedback on Your Anonymous Post 🌟",
      text: `Hello,
    
    You have received a new comment on your post. Here is a snippet of the comment:
    
    "${truncatedContent}"
    


    You can view the full post and comment here: ${`${process.env.FRONTEND_URL}/admin`}
    Thank you for using our service!
    
    Best regards,
    Your Company Name
    `,
      html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #4CAF50;">🌟 New Feedback on Your Anonymous Post 🌟</h2>
        <p>Hello,</p>
        <p>You have received a new comment on your ${postTitle}. Here is a snippet of the comment:</p>
        <blockquote style="font-style: italic; color: #555;">"${truncatedContent}"</blockquote>

        <p>You can view the full post and comment here: <a href="${process.env.FRONTEND_URL}/admin" style="color: #4CAF50;">View Post</a></p>
    
        <p>Thank you for using our service!</p>
        <p>Best regards,</p>
      </div>
      `
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    const err = error as Error;
    logger.error("Error sending email", {
      error: err.message,
      stack: err.stack
    });
  }
};
