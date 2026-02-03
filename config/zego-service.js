// services/zego-service.js
import crypto from 'crypto';

class ZegoService {
  constructor() {
    this.appId = 1837791744; // Your Zego App ID
    this.serverSecret = 'f45d2d08b7c9085571347535acf61177'; // Your server secret
    
    console.log('Zego Service initialized with App ID:', this.appId);
  }

  /**
   * Generate Zego Token (Version 04)
   */
  generateToken(userId, roomId) {
    try {
      const appId = this.appId;
      const expiredTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      
      // Privilege configuration
      const privilege = {
        1: 1, // login_room: true
        2: 1  // publish_stream: true
      };

      // Create the data to sign
      const dataToSign = [
        appId,
        userId,
        roomId,
        JSON.stringify(privilege),
        expiredTime
      ].join(':');

      // Generate HMAC-SHA256 signature
      const signature = crypto
        .createHmac('sha256', this.serverSecret)
        .update(dataToSign)
        .digest('hex');

      // Create token payload
      const payload = {
        app_id: appId,
        user_id: userId,
        room_id: roomId,
        privilege: privilege,
        expire: expiredTime,
        version: "04"
      };

      // Format: signature.payload_base64
      const token = `${signature}.${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
      
      console.log(`✓ Token generated for ${userId} in room ${roomId}`);
      return token;
      
    } catch (error) {
      console.error('✗ Token generation error:', error);
      // Fallback simple token for testing
      return `fallback_token_${userId}_${Date.now()}`;
    }
  }

  /**
   * Get Zego configuration for client
   */
  getClientConfig(senderId, receiverId, roomId) {
    const config = {
      appId: this.appId,
      roomId: roomId,
      sender: {
        userId: `user_${senderId}`,
        token: this.generateToken(`user_${senderId}`, roomId),
        userName: `User_${senderId}`
      },
      receiver: {
        userId: `user_${receiverId}`,
        token: this.generateToken(`user_${receiverId}`, roomId),
        userName: `User_${receiverId}`
      },
      serverUrls: {
        primary: "wss://webliveroom1837791744-api.coolzcloud.com/ws",
        backup: "wss://webliveroom1837791744-api-bak.coolzcloud.com/ws"
      }
    };
    
    console.log(`✓ Zego config generated for room: ${roomId}`);
    return config;
  }
}

// Create singleton instance
const zegoService = new ZegoService();

export default zegoService;