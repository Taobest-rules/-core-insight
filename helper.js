// Generate unique order code
function generateOrderCode() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `ORD-${timestamp}-${random}`.toUpperCase();
}

// Format price
function formatPrice(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

// Send email notification (pseudo-code - implement with your email service)
async function sendOrderEmail(userEmail, subject, message) {
  // Implement using nodemailer, SendGrid, etc.
  console.log(`[Email] To: ${userEmail}, Subject: ${subject}`);
  // Actual email sending code here
}

// Send SMS notification (pseudo-code)
async function sendOrderSMS(phoneNumber, message) {
  // Implement using Twilio, etc.
  console.log(`[SMS] To: ${phoneNumber}, Message: ${message}`);
}

module.exports = {
  generateOrderCode,
  formatPrice,
  sendOrderEmail,
  sendOrderSMS
};