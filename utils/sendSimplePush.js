import admin from "./firebase.js"; // path apne project ke hisaab se adjust karna

const sendSimplePush = async ({ fcmToken, title, body, data = {} }) => {
  if (!fcmToken) return;

  const message = {
    token: fcmToken,
    notification: {
      title,
      body,
    },
    data, // optional (string values only)
    android: {
      priority: "high",
    },
    apns: {
      headers: {
        "apns-priority": "10",
      },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("🔔 Push sent:", response);
    return response;
  } catch (error) {
    console.error("❌ Push failed:", error.message);
  }
};

export default sendSimplePush;
