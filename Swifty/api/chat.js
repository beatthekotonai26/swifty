// Simple echo server

// Simple rate limiting
const rateLimit = {
  requests: {},
  limit: 10, // 10 requests per minute
  window: 60000 // 1 minute
};

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateLimit.requests[ip]) {
    rateLimit.requests[ip] = [];
  }
  
  // Remove old requests
  rateLimit.requests[ip] = rateLimit.requests[ip].filter(
    time => now - time < rateLimit.window
  );
  
  if (rateLimit.requests[ip].length >= rateLimit.limit) {
    return true;
  }
  
  rateLimit.requests[ip].push(now);
  return false;
}

// Serverless function handler
module.exports = async (req, res) => {
  console.log('Request received:', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: typeof req.body === 'object' ? JSON.stringify(req.body) : req.body
  });

  // Log raw request details for debugging
  console.log('Raw request method:', req.method);
  console.log('Raw request URL:', req.url);
  console.log('Raw request headers:', JSON.stringify(req.headers));
  
  // Enable CORS - extremely permissive headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
    return;
  }

  // Handle GET request to root URL - serve index.html if available
  if (req.method === 'GET' && (req.url === '/' || req.url === '')) {
    try {
      const fs = require('fs');
      const path = require('path');
      const indexPath = path.join(__dirname, '../index.html');
      
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath, 'utf8');
        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(content);
        return;
      } else {
        res.status(200).json({ 
          message: 'API is working. Please use POST for echo requests.',
          method: req.method
        });
        return;
      }
    } catch (error) {
      console.error('Error serving index.html:', error);
      res.status(200).json({ 
        message: 'API is working. Please use POST for echo requests.',
        method: req.method
      });
      return;
    }
  }

  // Handle GET request to /api/chat
  if (req.method === 'GET' && req.url === '/api/chat') {
    res.status(200).json({ 
      message: 'This endpoint accepts POST requests only. Please send a POST request with your message.',
      method: req.method
    });
    return;
  }

  // Handle POST request to /api/chat
  if (req.method === 'POST' && req.url === '/api/chat') {
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (isRateLimited(clientIp)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    try {
      // Parse the request body
      let body = req.body;
      let messages = [];
      
      console.log('Request body type:', typeof body);
      console.log('Request body content:', body);
      console.log('Content-Type:', req.headers['content-type']);
      
      // Handle different content types
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          console.error('Failed to parse JSON string:', e);
        }
      }
      
      // Try to extract messages from the body
      if (body && body.messages) {
        messages = body.messages;
      } else if (body && body.data) {
        try {
          const dataObj = typeof body.data === 'string' ? JSON.parse(body.data) : body.data;
          if (dataObj.messages) {
            messages = dataObj.messages;
          }
        } catch (e) {
          console.error('Failed to parse data field:', e);
        }
      }
      
      console.log('Extracted messages:', messages);
      
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Invalid request: messages not found or not an array' });
        return;
      }
      
      // Simple echo service - just return the last user message
      const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
      const echoMessage = lastUserMessage ? 
        `Echo: ${lastUserMessage.content}` : 
        'No user message found to echo';
      
      res.status(200).json({ message: echoMessage });
      
    } catch (error) {
      console.error('Server Error:', error);
      res.status(500).json({ 
        error: 'Failed to process request',
        details: error.message 
      });
    }
    return;
  }

  // Handle all other requests
  res.status(404).json({ error: 'Not found' });
}; 