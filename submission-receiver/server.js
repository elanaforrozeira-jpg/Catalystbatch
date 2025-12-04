// Simple receiver for test submissions
// Install deps: express, cors, nodemailer (optional), dotenv
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.jsonl'); // newline-delimited JSON

async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (e) {
        console.error('mkdir error', e);
    }
}

// helper to append JSON line
async function appendSubmission(obj) {
    await ensureDataDir();
    const line = JSON.stringify(obj) + '\n';
    await fs.appendFile(SUBMISSIONS_FILE, line, 'utf8');
}

// optional email sender using nodemailer
async function sendEmail(subject, text) {
    if (!process.env.SMTP_HOST) return;
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: (process.env.SMTP_SECURE === 'true'), // true for 465
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to: process.env.ADMIN_EMAIL,
        subject: subject,
        text: text
    };

    await transporter.sendMail(mailOptions);
}

app.post('/submit', async (req, res) => {
    try {
        const payload = req.body || {};
        // basic validation
        if (!payload.type || !payload.time) {
            return res.status(400).json({ error: 'invalid payload' });
        }

        // sanitize small fields
        const rec = {
            receivedAt: new Date().toISOString(),
            ip: req.ip,
            payload
        };

        await appendSubmission(rec);

        // optionally email admin on final submit
        if (payload.type === 'submit') {
            const subject = `New test submission from ${payload.name || 'Unknown'}`;
            const text = `Submission at ${rec.receivedAt}\nName: ${payload.name}\nTimeLeft: ${payload.timeLeft}\nAnswers: ${JSON.stringify(payload.answers)}\nClient: ${JSON.stringify(payload.client || {})}`;
            // send email if configured
            try { await sendEmail(subject, text); } catch (e) { console.error('email send failed', e); }
        }

        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Receiver listening on port ${PORT}`));