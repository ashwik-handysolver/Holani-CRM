# CallSense – Call Intelligence

Upload customer call recordings (Hindi, Hinglish, English, regional) and get, for each call:
a full transcript with English translation, a short summary, caller details, products and quantities,
order value, complaint details, priority/lead quality, and follow-up tasks.

Built for a fan manufacturer handling 100–140 calls a day.

## Run locally

1. `npm install`
2. Create `.env` with your Sarvam AI key (dashboard.sarvam.ai):
   ```
   SARVAM_API_KEY="your-sarvam-key"
   # optional: SARVAM_MAX_TOKENS=16384 (raise if your Sarvam plan allows; Starter is 4096)
   ```
   Restart the server after changing `.env`.
3. `npm run dev` and open http://localhost:3000

Production: `npm run build` then `npm start`.

## Where data is stored

Analysed calls are saved in the browser's IndexedDB on the computer that uploaded them.
Audio files are not stored, only the transcript and analysis.
For several users or devices, move storage to a shared database.
