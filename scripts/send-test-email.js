const payload = {
  from: 'notification@myq.com',
  to: 'myq@mrcoffee.org',
  raw: 'From: notification@myq.com\r\nSubject: myQ Notification: Garage Door Right just opened\r\n\r\nThis is a simulated myQ notification test email.',
};

async function send() {
  console.log(
    'Sending simulated email event to local Wrangler dev server (http://localhost:8787)...',
  );
  try {
    const res = await fetch('http://localhost:8787/cdn-cgi/handler/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('Response status:', res.status);
    const text = await res.text();
    console.log('Response body:', text || '(empty)');
    if (res.ok) {
      console.log(
        '\nSuccess! Check your wrangler dev server logs to see the email processing output.',
      );
    } else {
      console.error("Failed. Make sure you are running 'npm run dev' in another terminal.");
    }
  } catch (err) {
    console.error('Error connecting to local wrangler dev server:', err.message);
    console.error("Make sure 'npm run dev' is running in another terminal window.");
  }
}

send();
