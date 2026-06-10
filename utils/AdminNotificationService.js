import AdminNotification from "../Models/AdminNotification.js";

const createAdminNotification = async ({
  title,
  body,
  type,
  relatedUser = null,
  relatedData = {},
  priority = 'medium'
}) => {
  try {
    const notification = await AdminNotification.create({
      title,
      body,
      type,
      relatedUser,
      relatedData,
      priority,
      isRead: false
    });
    console.log(`✅ Admin notification created: ${type} - ${title}`);
    return notification;
  } catch (error) {
    console.error('❌ Error creating admin notification:', error.message);
    return null;
  }
};

export default createAdminNotification;