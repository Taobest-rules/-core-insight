// Handle course payment
async function initiatePayment(courseId, amount, courseTitle) {
  try {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
      alert('Please login to purchase courses');
      window.location.href = '/login';
      return;
    }

    const response = await fetch('/api/initiate-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        courseId: courseId,
        amount: amount,
        email: user.email || 'user@example.com' // You might want to store email in user session
      })
    });

    const data = await response.json();
    
    if (data.status === 'success') {
      // Redirect to Flutterwave payment page
      window.location.href = data.paymentLink;
    } else {
      alert('Error initiating payment: ' + data.error);
    }
  } catch (error) {
    console.error('Payment error:', error);
    alert('Error initiating payment');
  }
}

// Check for payment callback
async function checkPaymentStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  const transactionId = urlParams.get('transaction_id');
  const status = urlParams.get('status');

  if (transactionId && status === 'successful') {
    try {
      const response = await fetch(`/api/verify-payment/${transactionId}`);
      const data = await response.json();
      
      if (data.status === 'success') {
        alert('Payment successful! You now have access to the course.');
        // Redirect to course page or dashboard
        window.location.href = '/courses';
      } else {
        alert('Payment verification failed: ' + data.message);
      }
    } catch (error) {
      console.error('Verification error:', error);
      alert('Error verifying payment');
    }
  }
}

// Call this on your payment callback page
// checkPaymentStatus();