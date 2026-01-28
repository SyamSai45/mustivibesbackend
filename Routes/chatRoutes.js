import express from "express";
import * as ChatController from "../Controller/chatController.js";
import { uploadChatMedia } from "../config/multer.js";
import {
  createCoinOrder,
  verifyCoinPayment,
  getAllCoinPayments,
  getUserCoinPayments,
  deleteCoinPayment
} from "../Controller/coinPaymentController.js";
const router = express.Router();

/* ================================
   SEND MESSAGE (One-on-One)
================================ */
router.post(
  "/send-message",
  uploadChatMedia,
  ChatController.sendMessage
);

/* ================================
   GET CONVERSATION
================================ */
router.get(
  "/conversation/:userId/:otherUserId",
  ChatController.getConversation
);

/* ================================
   GET MY CHATS
================================ */
router.get(
  "/my-chats/:userId",
  ChatController.getMyChats
);



router.get("/randomusers/:userId", ChatController.getRandomUsers);


/* ================================
   GET PENDING CHAT REQUESTS
================================ */
router.get(
  "/pending-requests/:userId",
  ChatController.getPendingChatRequests
);

/* ================================
   APPROVE CHAT REQUEST
================================ */
router.post(
  "/approve-chat",
  ChatController.approveChatRequest
);

/* ================================
   REJECT CHAT REQUEST
================================ */
router.post(
  "/reject-chat",
  ChatController.rejectChatRequest
);

/* ================================
   EDIT MESSAGE
================================ */
router.put(
  "/message/edit/:messageId",
  ChatController.editMessage
);

/* ================================
   DELETE MESSAGE
================================ */
router.delete(
  "/message/:messageId",
  ChatController.deleteMessage
);

/* ================================
   UPDATE MESSAGE STATUS
================================ */
router.patch(
  "/message/status/:messageId",
  ChatController.updateMessageStatus
);


router.post("/create-order", createCoinOrder);
router.post("/verify-payment", verifyCoinPayment);
router.get("/get/payments", getAllCoinPayments);
router.get("/payments/:userId", getUserCoinPayments);
router.delete("/payments/:paymentId", deleteCoinPayment);


export default router;