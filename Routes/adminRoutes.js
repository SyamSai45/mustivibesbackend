import express from "express";
import  * as admin from  "../Controller/adminController.js";

const router = express.Router();

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


export default router;
