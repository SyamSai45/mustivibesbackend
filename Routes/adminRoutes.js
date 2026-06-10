import express from "express";
import  * as admin from  "../Controller/adminController.js";

const router = express.Router();

// Update user
router.put("/users/update/:userId", admin.updateUser);

router.post("/packages", admin.createCoinPackage);
router.get("/packages", admin.getAllCoinPackages);
router.get("/packages/:packageId", admin.getCoinPackageById);
router.put("/packages/:packageId", admin.updateCoinPackage);
router.delete("/packages/:packageId", admin.deleteCoinPackage);


// ADMIN
router.put("/admin/handle/:reportId", admin.handleReport);
router.get("/admin/reports", admin.getAllReports);
router.get("/admin/warnings", admin.getAllWarnings);
router.get("/admin/report/:reportId", admin.getReportById);
router.delete("/admin/delete/:reportId", admin.deleteReport);
// ADMIN HARD DELETE USER
router.delete("/admin/delete-user/:userId", admin.adminDeleteUser);

router.post("/referral", admin.setReferralCoins);          // create / set
router.get("/referral", admin.getAllReferralCoins);        // get all
router.get("/referral/:id", admin.getReferralCoinsById);   // get by id
router.put("/referral/:id", admin.updateReferralCoinsById);// update by id
router.delete("/referral/:id", admin.deleteReferralCoins); // delete
router.post("/createcointorupee", admin.createCoinToRupee);
router.get("/getcointorupee", admin.getCoinToRupee);
router.put('/update-cointorupee/:ratioId', admin.editCoinToRupee);
router.delete('/delete-cointorupee/:ratioId', admin.deleteCoinToRupee);
router.get('/coindeductionrules', admin.getAllCoinDeductionRules);
router.post('/coindeductionrule', admin.createCoinDeductionRule);
router.put('/update-coindeductionrule/:ruleId', admin.editCoinDeductionRule);
router.delete('/delete-coindeductionrule/:ruleId', admin.deleteCoinDeductionRule);

// Notification Routes
router.get('/notifications',             admin.getAdminNotifications);
router.get('/notifications/:notificationId',   admin.getAdminNotificationById);
router.put('/notifications/:notificationId/read',   admin.markNotificationAsRead);
router.put('/notifications/:notificationId/unread', admin.markNotificationAsUnread);
router.delete('/notifications/:notificationId',     admin.deleteAdminNotification);
// Admin
router.post("/create-warning",  admin.createWarningContent);

// Get
router.get("/getall-warnings",  admin.getAllWarningContent);
router.get("/get-warning/:id",  admin.getSingleWarningContent);

// Update
router.put("/update-warning/:id",  admin.updateWarningContent);

// Delete
router.delete("/delete-warning/:id",  admin.deleteWarningContent);

router.get("/dashboard", admin.getAdminDashboard);
export default router;
