import express from "express";
import multer from "multer";
import * as UserController from "../Controller/UserController.js";import { uploadUserProfileImages } from "../config/multerConfig.js";
import * as Room from "../Controller/roomController.js"
const router = express.Router();
const upload = multer({ dest: "tmp/" }); 

//registration
router.post("/send-otp", UserController.sendOtp);
router.post("/verify-otp", UserController.verifyOtp);
router.post("/resend-otp", UserController.resendOtp);
router.put('/createprofile/:userId', upload.single("profileImage"), UserController.uploadUserProfile);
router.put("/update-language/:userId", UserController.updateLanguage);
router.put("/update-location", UserController.updateUserLocation);
router.get('/getlocation/:userId', UserController.getUserLocation);
router.put("/profileimage/:userId",upload.single("profileImage"), UserController.updateUserProfileImage);
// DELETE ACCOUNT (User)
router.delete("/delete-account/:userId", UserController.deleteMyAccount);

router.post("/deleteaccount-mobile", UserController.deleteAccountByMobile);
router.get("/confirm-delete-account/:token", UserController.confirmDeleteAccount);
// 🔥 GET Profile Image
router.get("/profile/:userId",
  UserController.getUserProfile
);
router.delete(
  "/profile-image/:userId",
  UserController.deleteUserProfileImage
);

//get user details
router.get("/users/all", UserController.getAllUsers);
router.get("/users/:userId", UserController.getUserById);
router.delete("/users/delete/:userId", UserController.deleteUser);


//followers,following
router.post("/follow", UserController.followUser);
router.post("/unfollow", UserController.unfollowUser);
router.get("/followers-following/:userId", UserController.getFollowersAndFollowing);
router.get("/findfriends/:userId", UserController.findFriends);


//room creation
router.post("/create", Room.createRoom);
router.get("/all", Room.getAllRooms);
router.get("/:roomId", Room.getRoomById);
router.put("/:roomId", Room.updateRoom);
router.delete("/:roomId", Room.deleteRoom);

//nearby user
router.get("/nearby-users/:userId", Room.getNearbyUsersByUserId);

//warning and report for block
// USER
router.post("/report", Room.createReport);

// ADMIN
router.put("/admin/handle/:reportId", Room.handleReport);
router.get("/admin/reports", Room.getAllReports);
router.get("/admin/warnings", Room.getAllWarnings);
router.get("/admin/report/:reportId", Room.getReportById);
router.delete("/admin/delete/:reportId", Room.deleteReport);
// ADMIN HARD DELETE USER
router.delete("/admin/delete-user/:userId", Room.adminDeleteUser);



export default router;



                                        