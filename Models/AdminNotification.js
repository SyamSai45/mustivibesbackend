// Models/AdminNotification.js
import mongoose from 'mongoose';

const adminNotificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: [
      'new_user',
      'user_reported',
      'redeem_request',
      'call_completed',
      'payment_received',
      'room_created',
      'feedback_submitted',
      'system_alert',
      'withdrawal_request',
      'admin_action'
    ],
    required: true
  },
  relatedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  relatedData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for faster queries
adminNotificationSchema.index({ createdAt: -1 });
adminNotificationSchema.index({ isRead: 1 });
adminNotificationSchema.index({ type: 1 });
adminNotificationSchema.index({ priority: 1 });
adminNotificationSchema.index({ isDeleted: 1 });

const AdminNotification = mongoose.model('AdminNotification', adminNotificationSchema);
export default AdminNotification;