// import admin from "./firebase.js";

// export const sendPushNotification = async ({
//   fcmToken,
//   title,
//   body,
//   data = {},
// }) => {
//   if (!fcmToken) {
//     console.log("❌ No FCM token provided");
//     return;
//   }

//   const message = {
//     token: fcmToken,

//     // ---------------- NOTIFICATION ----------------
//     // notification: {
//     //   title: title,
//     //   body: body,
//     // },

//     // ---------------- DATA ----------------
//     data: {
//       ...data,
//       click_action: "FLUTTER_NOTIFICATION_CLICK",
//     },

//     // ---------------- ANDROID (HIGH PRIORITY) ----------------
//     android: {
//       priority: "high",
//       notification: {
//         sound: "default",
//         channelId: "high_priority_channel", // MUST match Android channel
//         visibility: "public",
//         notificationPriority: "PRIORITY_HIGH",
//       },
//     },

//     // ---------------- iOS (APNS HIGH PRIORITY) ----------------
//     apns: {
//       headers: {
//         "apns-priority": "10",
//         "apns-push-type": "alert",
//       },
//       payload: {
//         aps: {
//           alert: {
//             title: title,
//             body: body,
//           },
//           sound: "default",
//           badge: 1,
//         },
//       },
//     },
//   };

//   try {
//     const response = await admin.messaging().send(message);
//     console.log("✅ FCM sent successfully:", response);
//     return response;
//   } catch (error) {
//     console.error("❌ FCM error:", error);
//     throw error;
//   }
// };



import admin from "./firebase.js"; // Ensure firebase is initialized correctly

/**
 * :bell: Send Incoming Call Signal (DATA-ONLY FCM)
 * This does NOT create a normal notification.
 * Flutter app controls the UI (IncomingCallScreen).
 */
export const sendPushNotification = async ({
  fcmToken,
  callId,
  callerId,
  receiverId,
  callerName,
  callType, // "audio" | "video"
  channelId // Added channelId parameter
}) => {
  if (!fcmToken || fcmToken.trim() === "") {
    console.log(":x: No valid FCM token provided");
    return null;  // Return null if no token is provided
  }

  // Ensure that all necessary parameters are provided
  if (!callId || !callerId || !receiverId || !callerName || !callType) {
    console.log(":x: Missing required parameters");
    return null;
  }

  // Convert all values to strings to avoid FirebaseMessagingError: data must only contain string values
  const message = {
    token: fcmToken,
    data: {
      type: "incoming_call",  // Type of the push notification (signal for incoming call)
      callId: callId.toString(),  // Ensure callId is passed as a string
      callerId: callerId.toString(),  // Ensure callerId is passed as a string
      receiverId: receiverId.toString(),  // Ensure receiverId is passed as a string
      callerName: callerName.toString(),  // Ensure callerName is passed as a string
      callType: callType.toString(),  // Ensure callType is passed as a string
      click_action: "FLUTTER_NOTIFICATION_CLICK",  // Action when the user clicks
    },
    notification: {
      title: `${callerName} is calling you`,  // Receiver sees this as the title
      body: callType === "audio" ? "You have an incoming audio call" : "You have an incoming video call", // This is the body
    },
    android: {
      priority: "high",  // High priority to wake the app
      notification: {
        channel_id: channelId,  // Specify the channel ID for the notification
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",  // Ensure the push is high priority for iOS
        "apns-push-type": "background",  // Background push for incoming calls
      },
      payload: {
        aps: {
          "content-available": 1,  // iOS background fetch (silent notification)
        },
      },
    },
  };

  try {
    // Send the push notification through Firebase Admin SDK
    const response = await admin.messaging().send(message);

    // Log the FCM response so we can track what the receiver gets
    console.log(":white_check_mark: Incoming call signal sent:", response);

    // Log the actual message to be shown to the receiver
    console.log("Receiver Message:", {
      title: `${callerName} is calling you`,
      body: callType === "audio" ? "You have an incoming audio call" : "You have an incoming video call",
    });

    return response;  // Return the response to be logged or processed

  } catch (error) {
    console.error(":x: FCM incoming call error:", error);
    return { error: error.message };  // Return error message for debugging
  }
};
