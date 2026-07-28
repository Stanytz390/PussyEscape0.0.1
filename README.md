# PUSSY ESCAPE 🤖

> Premium WhatsApp Bot with Advanced Pairing System

[![Deploy on Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)
[![GitHub stars](https://img.shields.io/github/stars/Stanytz390/PussyEscape0.0.1?style=social)](https://github.com/Stanytz390/PussyEscape0.0.1)

---

## 📌 Quick Access

| Service | Link | Status |
|---------|------|--------|
| **Pair Code** | [https://link.stanymaxhub.online/pair](https://link.stanymaxhub.online/pair) | ✅ Active |
| **QR Code** | [https://link.stanymaxhub.online/pair-page](https://link.stanymaxhub.online/pair-page) | ✅ Active |
| **Main Site** | [https://link.stanymaxhub.online](https://link.stanymaxhub.online) | ✅ Active |

---

## ✨ Features

- 🔐 **Pairing System** - Link your WhatsApp using phone number
- 📱 **QR Code** - Scan to connect instantly
- 🤖 **50+ Plugins** - AI, Downloaders, Group Tools, and more
- ⚡ **Auto-Reconnect** - Always online
- 🎨 **Premium UI** - Stunning black & pink theme
- 📦 **Session Manager** - Save and restore sessions

---

## 🚀 Deploy to Heroku

### One-Click Deploy

[![Deploy on Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

### Manual Deploy

```bash
# 1. Login to Heroku
heroku login

# 2. Create app
heroku create your-app-name

# 3. Set environment variables (optional)
heroku config:set SESSION_ID='your_session_id_here' --app your-app-name
heroku config:set PREFIX='.' --app your-app-name
heroku config:set OWNER_NAME='PUSSY ESCAPE' --app your-app-name

# 4. Deploy
git push heroku main

# 5. Open app
heroku open --app your-app-name
```

Environment Variables

Variable Description Required
SESSION_ID Your WhatsApp session (creds.json) ❌
PREFIX Bot command prefix (default: .) ❌
OWNER_NAME Bot owner name ❌

---

🛠️ Local Setup

```bash
# 1. Clone repository
git clone https://github.com/Stanytz390/PussyEscape0.0.1.git
cd PussyEscape0.0.1

# 2. Install dependencies
npm install

# 3. Start bot
npm start
```

---

📱 How to Pair Your WhatsApp

Method 1: Pair Code

1. Visit https://link.stanymaxhub.online/pair
2. Enter your phone number with country code (e.g., 255712345678)
3. Click "Generate Pair Code"
4. Copy the pairing code
5. Open WhatsApp → Settings → Linked Devices → Link a Device
6. Select "Use pairing code" and enter the code

Method 2: QR Code

1. Visit https://link.stanymaxhub.online/pair-page
2. Scan the QR code with WhatsApp
3. Your device is linked!

---

📋 Available Commands

Category Commands
General .alive, .ping, .uptime, .owner, .menu, .menu2
AI .ai, .ai-search, .aivoice, .gen, .gen2, .img
Downloaders .tiktok, .tt, .ytdl, .ytsearch, .instadl, .tweet, .shazam
Tools .sticker, .ocr, .tts, .poll, .toaudio, .tourl, .compress, .textpro, .viewonce, .save, .self, .deltmp
Group .tagall, .tageveryone, .tagme, .retag, .group, .groupstatus, .groupsettings, .join, .kick, .welcome
Profile .setpp, .profilepic, .ppcouple
Channel .channelid, .channel-cmd
Auto .arise, .autoreact, .niggareply, .mention
Fun .bluearchive
Admin .setprefix

---

📁 Project Structure

```
PussyEscape0.0.1/
├── index.js          # Main bot file
├── package.json      # Dependencies
├── app.json          # Heroku deployment config
├── ids.js            # ID generators
├── routes/           # Pairing & QR routes
│   ├── index.js
│   ├── pair.js
│   └── qr.js
├── plugins/          # All bot commands (50+)
│   ├── menu.js
│   ├── ai.js
│   ├── alive.js
│   └── ... (50+ plugins)
├── public/           # Web pages
│   ├── main.html
│   ├── pair.html
│   └── qr.html
└── session/          # Session storage (auto-created)
    └── creds.json    # Your WhatsApp session
```

---

🤝 Contributors

· STANYTZ - Developer
· ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐 - Bot Name

---

📢 Stay Connected

· WhatsApp Channel: Join Channel
· Support Group: Join Group
· GitHub: Stanytz390

---

⚠️ Important Notes

🚫 Never share your session ID or creds.json with anyone!

✅ Bot automatically reconnects if disconnected

📦 Session is stored securely in session/creds.json

---

📝 License

MIT License - Feel free to use and modify

---

💬 Support

For issues or questions:

· Open an issue
· Join our Support Group

---

⭐ Star this repo if you like it!

```
