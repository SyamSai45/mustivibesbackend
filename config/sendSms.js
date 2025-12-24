import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const sendSms = async (to, message) => {
  try {
    const sms = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to.startsWith("+") ? to : `+91${to}`
    });

    console.log("✅ SMS SENT:", sms.sid);
    return sms;
  } catch (error) {
    console.error("❌ TWILIO ERROR:", error.message);
    throw error;
  }
};
