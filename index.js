const { Telegraf, session } = require('telegraf');
const svgCaptcha = require('svg-captcha');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize bot with token from environment variables
const bot = new Telegraf(process.env.BOT_TOKEN || '');

// Enable session management to track user state
bot.use(session());

// Welcome message when user starts the bot
bot.start(async (ctx) => {
  // Initialize session data for the user
  ctx.session = {
    attempts: 0,
    captchaText: '',
    verified: false
  };
  
  await ctx.reply(`👋 Welcome, ${ctx.from.first_name}!`);
  await ctx.reply('To verify you are human, I will send you a CAPTCHA to solve.');
  
  // Generate and send CAPTCHA
  sendCaptcha(ctx);
});

// Help command
bot.help((ctx) => {
  ctx.reply('This bot requires you to solve a CAPTCHA to verify you are human. After verification, you can receive the file.');
});

// Function to generate and send CAPTCHA
async function sendCaptcha(ctx) {
  // Generate a CAPTCHA
  const captcha = svgCaptcha.create({
    size: 6, // CAPTCHA length
    noise: 2, // Number of noise lines
    color: true,
    width: 280,
    height: 100,
    fontSize: 70,
  });
  
  // Store the CAPTCHA text in session
  ctx.session.captchaText = captcha.text;
  
  try {
    // Convert SVG to PNG for better Telegram compatibility
    const pngBuffer = await sharp(Buffer.from(captcha.data))
      .png()
      .toBuffer();
    
    // Send the CAPTCHA image
    await ctx.replyWithPhoto({ source: pngBuffer }, {
      caption: 'Please enter the text shown in this image to verify you are human.'
    });
  } catch (error) {
    console.error('Error generating CAPTCHA:', error);
    ctx.reply('Error generating CAPTCHA. Please type /start to try again.');
  }
}

// Handle text messages (CAPTCHA responses)
bot.on('text', async (ctx) => {
  // Skip handling if it's a command
  if (ctx.message.text.startsWith('/')) return;
  
  // If user is already verified, send the file
  if (ctx.session && ctx.session.verified) {
    await sendFile(ctx);
    return;
  }
  
  // If no session or not in CAPTCHA mode, ignore
  if (!ctx.session || !ctx.session.captchaText) {
    ctx.reply('Please type /start to begin the verification process.');
    return;
  }
  
  // Check CAPTCHA answer
  const userInput = ctx.message.text.trim();
  
  // Case insensitive comparison
  if (userInput.toLowerCase() === ctx.session.captchaText.toLowerCase()) {
    // CAPTCHA passed
    ctx.session.verified = true;
    await ctx.reply('✅ Verification successful! You are now verified as human.');
    
    // Send the file
    await sendFile(ctx);
  } else {
    // CAPTCHA failed
    ctx.session.attempts += 1;
    
    if (ctx.session.attempts >= 3) {
      // Too many failed attempts
      ctx.reply('❌ Too many failed attempts. Please type /start to try again with a new CAPTCHA.');
      ctx.session = null;
    } else {
      // Allow retry
      await ctx.reply(`❌ Incorrect. Please try again. You have ${3 - ctx.session.attempts} attempts left.`);
    }
  }
});

// Function to send the file
async function sendFile(ctx) {
  try {
    // Path to the keybox.xml file in the project directory
    const filePath = path.join(__dirname, 'keybox.xml');
    
    // Check if file exists
    if (fs.existsSync(filePath)) {
      await ctx.reply('Here is your requested file:');
      await ctx.replyWithDocument({ source: filePath });
    } else {
      await ctx.reply('Sorry, the file is not available at the moment.');
      console.error('File not found:', filePath);
    }
  } catch (error) {
    console.error('Error sending file:', error);
    await ctx.reply('Sorry, there was an error sending the file.');
  }
}

// Handle errors
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('An error occurred. Please try again later.');
});

// Start the bot
const PORT = process.env.PORT || 3000;

// Start the bot with webhook in production or polling in development
if (process.env.NODE_ENV === 'production') {
  // Get the Heroku-assigned URL
  const APP_URL = process.env.APP_URL || `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
  
  // Start webhook
  bot.launch({
    webhook: {
      domain: APP_URL,
      port: PORT
    }
  }).then(() => {
    console.log(`Bot running on webhook mode at ${APP_URL}`);
  }).catch((err) => {
    console.error('Failed to start bot in webhook mode:', err);
  });
} else {
  // Start polling (for local development)
  bot.launch().then(() => {
    console.log('Bot started in polling mode');
  }).catch((err) => {
    console.error('Failed to start bot in polling mode:', err);
  });
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));