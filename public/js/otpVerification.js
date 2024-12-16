function resendOtp(type = 'signup') {
    const endpoint = type === 'signup' ? '/resend-otp' : '/resend-forgot-otp';
    
    // Disable resend button temporarily
    const resendButton = document.getElementById('resendOtpBtn');
    if (resendButton) {
        resendButton.disabled = true;
        resendButton.textContent = 'Sending...';
    }

    fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'same-origin'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Show success message
            showMessage(data.message, 'success');
            
            // Start countdown timer
            startResendTimer();
        } else {
            showMessage(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Resend OTP error:', error);
        showMessage('Failed to resend OTP. Please try again.', 'error');
    })
    .finally(() => {
        // Re-enable resend button after 30 seconds
        setTimeout(() => {
            if (resendButton) {
                resendButton.disabled = false;
                resendButton.textContent = 'Resend OTP';
            }
        }, 30000);
    });
}

function startResendTimer() {
    let timeLeft = 30;
    const timerDisplay = document.getElementById('timerDisplay');
    
    if (timerDisplay) {
        const timer = setInterval(() => {
            if (timeLeft <= 0) {
                clearInterval(timer);
                timerDisplay.textContent = '';
                return;
            }
            timerDisplay.textContent = `Resend available in ${timeLeft} seconds`;
            timeLeft--;
        }, 1000);
    }
}

function showMessage(message, type) {
    const messageDiv = document.getElementById('messageDiv');
    if (messageDiv) {
        messageDiv.textContent = message;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';
        
        // Hide message after 5 seconds
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }
} 