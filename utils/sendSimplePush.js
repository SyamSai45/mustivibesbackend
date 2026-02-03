// sendSimplePush.js
import admin from "./firebase.js"; // Adjust path to your Firebase Admin SDK setup

/**
 * Sends a push notification via Firebase Cloud Messaging
 * @param {Object} params
 * @param {string} params.fcmToken - Recipient device FCM token
 * @param {string} params.title - Notification title
 * @param {string} params.body - Notification body
 * @param {Object} [params.data={}] - Optional data payload (must be string values)
 */
const sendSimplePush = async ({ fcmToken, title, body, data = {} }) => {
  if (!fcmToken) {
    console.warn("⚠️ No FCM token provided, skipping push notification.");
    return;
  }

  // Convert all data values to strings (Firebase requirement)
  const stringifiedData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v.toString()])
  );

  const message = {
    token: fcmToken,
    notification: {
      title,
      body,
    },
    data: stringifiedData,
    android: {
      priority: "high",
    },
    apns: {
      headers: {
        "apns-priority": "10",
      },
    },
  };

  // Log the payload for debugging
  console.log("📤 Sending FCM message:", JSON.stringify(message, null, 2));

  try {
    const response = await admin.messaging().send(message);
    console.log("🔔 Push sent successfully:", response);
    return response;
  } catch (error) {
    console.error("❌ Push failed in helper:", error);

    // Throw error so controller can catch and log
    throw error;
  }
};

export default sendSimplePush;
