import express from "express";
import multer from "multer";
import * as UserController from "../Controller/UserController.js";
import * as RoomController from "../Controller/roomController.js";  // ✅ RENAMED

const router = express.Router();
//const upload = multer({ dest: "tmp/" }); 
import upload from "../config/multerConfig.js";

/* ================= AUTH / OTP ================= */
router.post("/send-otp", UserController.sendOtp);
router.post("/verify-otp", UserController.verifyOtp);
router.post("/resend-otp", UserController.resendOtp);

/* ================= PROFILE ================= */
router.put('/createprofile/:userId', upload.single("profileImage"), UserController.uploadUserProfile);
router.put("/profileimage/:userId", upload.single("profileImage"), UserController.updateUserProfileImage);
router.delete("/profile-image/:userId", UserController.deleteUserProfileImage);
router.get("/profile/:userId", UserController.getUserProfile);
router.put("/updateuser/:userId", UserController.updateUserProfile);
router.put("/update-language/:userId", UserController.updateLanguage);
router.put("/update-location", UserController.updateUserLocation);
router.get('/getlocation/:userId', UserController.getUserLocation);

/* ================= ACCOUNT ================= */
router.delete("/delete-account/:userId", UserController.deleteMyAccount);
router.post("/deleteaccount-mobile", UserController.deleteAccountByMobile);
router.get("/confirm-delete-account/:token", UserController.confirmDeleteAccount);

/* ================= USERS ================= */
router.get("/users/all", UserController.getAllUsers);
router.get("/users/:userId", UserController.getUserById);
router.delete("/users/delete/:userId", UserController.deleteUser);

/* ================= FOLLOW / FRIENDS ================= */
router.post("/follow", UserController.followUser);
router.post("/unfollow", UserController.unfollowUser);
router.get("/followers-following/:userId", UserController.getFollowersAndFollowing);
router.get("/findfriends/:userId", UserController.findFriends);

/* ================= COMMUNICATION ================= */
router.post("/request", UserController.createRequest);
router.get("/all-requests", UserController.getAllRequests);
router.get("/my-requests/:userId", UserController.getMyRequests);
router.put("/handle/:requestId", UserController.handleRequest);
router.post("/block", UserController.blockUser);
router.post("/unblock", UserController.unblockUser);
router.get("/blocked-users/:userId", UserController.getAllBlockedUsers);
router.delete("/:requestId", UserController.deleteRequest);

/* ================= WALLET ================= */
router.get("/wallet/:userId", UserController.getMyWallet);

router.post("/createFeedback", UserController.createFeedback);                 // Create (once)
router.get("/my-Feedback/:userId", UserController.getMyFeedback);               // Get my feedback
router.get("/allFeedback", UserController.getAllFeedbacks);                     // Get all feedbacks
router.put("/updateFeedback/:userId", UserController.updateFeedback);          // Update
router.delete("/deleteFeedback/:userId", UserController.deleteFeedback);       // Delete

/* ================= ROOMS ================= */
router.post("/create", RoomController.createRoom);  // ✅ CHANGED
router.get("/all", RoomController.getAllRooms);     // ✅ CHANGED
router.get("/room/:roomId", RoomController.getRoomById);  // ✅ CHANGED PATH to avoid conflict
router.put("/room/:roomId", RoomController.updateRoom);    // ✅ CHANGED PATH
router.delete("/room/:roomId", RoomController.deleteRoom); // ✅ CHANGED PATH
router.get("/myrooms/:userId", RoomController.getUserRooms);     // ✅ CHANGED
router.delete("/deletemyroom/:userId/:roomId", RoomController.deleteUserRoom); // ✅ CHANGED PATH
router.put("/updatemyroom/:userId/:roomId", RoomController.updateRoomByUser); // ✅ CHANGED PATH


/* ================= NEARBY USERS ================= */
router.get("/nearby-users/:userId", RoomController.getNearbyUsersByUserId);  // ✅ CHANGED

/* ================= REPORT / WARNING ================= */
router.post("/report", RoomController.createReport);  // ✅ CHANGED
router.get("/user-reports/:userId", RoomController.getUserReportSummary);  // ✅ CHANGED
router.get("/getusercoins/:userId", UserController.getUserCoins);               // Get my feedback


router.post("/sendcallingrequest", UserController.sendCallingRequest);

// Accept / Reject / End call
//router.put("/updatecallingstatus/:callId", UserController.updateCallStatus);

// Get all calls for a user
router.get("/allusercallsrecord/:userId", UserController.getUserCalls);


// Zego Webhook endpoints
router.post('/webhook/room-create', UserController.handleRoomCreate);
router.post('/webhook/user-joined', UserController.handleUserJoined);      // Room logged in
router.post('/webhook/user-left', UserController.handleUserLeft);          // Room logged out
router.post('/webhook/room-closed', UserController.handleRoomClosed);      // Room close
router.post('/webhook/stream-created', UserController.handleStreamCreated); // Stream created
router.post('/webhook/stream-closed', UserController.handleStreamClosed);

router.get("/getmyreffralcode/:userId", UserController.getMyReferralCode);               // Get my feedback
router.get("/gettransactionhistory/:userId", UserController.getUserTransactionHistory);
router.get("/myreferred-reward/:userId", UserController.getReferredRewardOnly);
router.post("/sendredeemrequest", UserController.createRedeemRequest);
router.get("/getallredeemrequest", UserController.getAllRedeemRequests);
router.get("/getmyredeemrequest/:userId", UserController.getUserRedeemRequests);
router.put("/updateredeemrequest/:redeemId", UserController.updateRedeemRequestStatus);

router.post("/joinroom", RoomController.joinRoom);  // ✅ CHANGED
router.get("/getnotification/:userId", UserController.getNotifications);
router.delete("/userdltnot/:userId", RoomController.deleteNotifications);



export default router;