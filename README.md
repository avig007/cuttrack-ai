# CutTrack AI — standalone version

An Indian calorie and macro tracker that runs on your iPhone's Home Screen. It does not depend on a Claude plan.

```
iPhone (CutTrack app)
   │  your log is kept on the phone first, so it works offline
   ▼
Your Vercel server (free)  ── holds your secrets ──┐
   ├─ /api/drive       →  Google Drive   (stores your data, no AI)
   ├─ /api/ai          →  OpenAI → Gemini → Groq   (reads meals, photos, coach)
   └─ /api/transcribe  →  OpenAI → Gemini → Groq   (voice notes)
                          if one runs out of credit or fails, the next takes over
```

**What lands in your Drive**

```
My Drive/
└── CutTrack AI/
    ├── cuttrack-data.json        ← everything, used to restore on a new phone
    └── 2026/
        └── 10 - October/
            └── 2026-10-18.txt    ← that day's entries with time, amount, macros and totals
```

CutTrack can only see files it created. It cannot read anything else in your Drive.

**Cost:** Vercel Hobby and Google Drive are free. OpenAI is pay-as-you-go; `gpt-6-luna` costs $0.10 per million input tokens, so a month of logging typically costs a few rupees. Gemini and Groq take over only when OpenAI can't answer.

---

## Before you start

You need:

- a laptop (the setup is far easier there than on a phone)
- a GitHub account
- a Google account (avijeetgupta02@gmail.com)
- about 30 minutes

> **AI keys live in GitHub secrets.** The running app on Vercel can't read GitHub secrets directly, so the included **Sync AI keys to Vercel** action copies them across. It needs one extra secret, `VERCEL_TOKEN` (step 4b).

---

## Step 1 — AI keys (already done)

`OPENAI_API_KEY` and `GEMINI_API_KEY` are in the repository's GitHub secrets. Add `GROQ_API_KEY` there whenever you have it, then run the sync action (step 4b).

OpenAI bills API use separately from ChatGPT: add credit at **platform.openai.com → Billing**.

## Step 2 — Put the code on GitHub

1. Unzip `cuttrack-app.zip` on your laptop.
2. On github.com, click **New repository**, name it `cuttrack-ai`, choose **Private**, then **Create repository**.
3. On the empty repo page, click **uploading an existing file**.
4. Drag **everything inside** the unzipped `cuttrack-app` folder into the page. That means the `api` and `icons` folders plus `index.html`, `sw.js`, `manifest.webmanifest`, `package.json`, `vercel.json` and `README.md`.
5. Click **Commit changes**.

Check that the repo shows an `api` folder at the top level, not a `cuttrack-app` folder containing it.

## Step 3 — Set up Google sign-in (Google Cloud)

1. Go to **console.cloud.google.com**. Accept the terms, then create a project named `CutTrack`. Make sure it's selected at the top.
2. **Turn on the Drive API.** Search "Google Drive API" in the top bar, open it, and click **Enable**.
3. **Set up the sign-in screen.** Open **Google Auth Platform**; in older layouts it's **APIs & Services → OAuth consent screen**.
   - Click **Get started**.
   - **App name:** `CutTrack AI`. **Support email:** your Gmail address.
   - **Audience:** choose **External**.
   - **Contact email:** your Gmail address. Agree to the terms, then click **Create**.
4. **Choose what the app may access.** Open **Data Access** → **Add or remove scopes**. Tick:
   - `.../auth/drive.file`
   - `openid`
   - `.../auth/userinfo.email`

   Click **Update**, then **Save**.
5. **Publish the app.** Open **Audience** → **Publish app** → **Confirm**. This matters: if the app stays in "Testing", Google signs you out every 7 days. The scopes above are non-sensitive, so no Google review is needed.
6. **Create the sign-in credentials.** Open **Clients**; in older layouts it's **Credentials → Create credentials → OAuth client ID**.
   - **Application type:** Web application. **Name:** `CutTrack`.
   - Leave **Authorized redirect URIs** empty for now; you'll add it in step 5.
   - Click **Create**.
   - Copy the **Client ID** and **Client secret** into your note.

## Step 4 — Deploy on Vercel

1. Go to **vercel.com** and sign up with GitHub.
2. Click **Add New… → Project**, then **Import** your `cuttrack-ai` repo.
3. For **Framework Preset**, choose **Other**. Leave build settings empty.
4. Open **Environment Variables** and add each of these:

   | Name | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | from step 3.6 |
   | `GOOGLE_CLIENT_SECRET` | from step 3.6 |
   | `ALLOWED_EMAIL` | `avijeetgupta02@gmail.com` |
   | `SESSION_SECRET` | a random string of 32 or more characters (see below) |

   For `SESSION_SECRET`, use a password generator, or run `openssl rand -base64 36` on a Mac. Don't reuse a real password.
5. Click **Deploy**. When it finishes, copy your address, for example `https://cuttrack-ai-xyz.vercel.app`.

## Step 4b — Let GitHub pass the AI keys to Vercel

1. Go to **vercel.com/account/tokens** → **Create Token**. Name it `cuttrack-github`, scope it to your account, choose an expiry, and copy it.
2. On GitHub: **cuttrack-ai → Settings → Secrets and variables → Actions → New repository secret**. Name `VERCEL_TOKEN`, paste the token, then click **Add secret**.
3. Open the **Actions** tab → **Sync AI keys to Vercel** → **Run workflow** → **Run workflow**.
4. When it shows a green tick, the keys are in Vercel and the app has redeployed.

Run it again whenever you add or change an AI key, for example when you add `GROQ_API_KEY`.

## Step 5 — Connect the two

1. **In Vercel:** go to **Settings → Environment Variables** and add `APP_URL` with your address. No slash at the end.
2. Then go to **Deployments**, open the **⋯** menu on the latest deployment, and choose **Redeploy**.
3. **In Google Cloud:** go to **Clients → CutTrack**, then **Authorized redirect URIs** → **Add URI**. Enter:
   ```
   https://YOUR-ADDRESS.vercel.app/api/auth/callback
   ```
   Then click **Save**. Google can take a few minutes to apply it.

## Step 6 — Install on your iPhone

1. Open **Safari** and go to your Vercel address.
2. Tap **Share** (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. **Open CutTrack from the Home Screen icon.** The installed app keeps its own sign-in, separate from Safari, so you must sign in from inside it.
4. Tap **Sign in with Google**, choose your account, and allow Drive access.
   - If Google shows **"Google hasn't verified this app"**, tap **Advanced → Go to CutTrack AI**. It's your own app.
5. Log a food. Within a few seconds the top-right label should read **Saved to Drive**, and the `CutTrack AI` folder appears in your Drive.
6. The first time you tap **Speak**, allow the microphone. If you said no by mistake, go to **Settings → Apps → Safari → Microphone**.

---

## What works without AI

These features use no AI at all:

- typing common foods
- searching foods
- Quick add
- custom foods and recipes
- targets, history and weight
- the Google Drive backup

AI is used only for:

- reading foods the built-in parser doesn't know
- photos and nutrition labels
- voice notes
- the coach

Each request tries OpenAI first, then Gemini, then Groq. A service that runs out of credit or rejects its key is skipped for 30 minutes, then tried again.

| Feature | OpenAI | Gemini | Groq |
|---|---|---|---|
| Typed and spoken meals, coach | `gpt-6-luna` | `gemini-3.5-flash-lite` | `llama-3.3-70b-versatile` |
| Photos and labels | `gpt-6-luna` | `gemini-3.5-flash-lite` | `qwen/qwen3.8-27b` |
| Voice | `gpt-4o-mini-transcribe` | `gemini-3.5-flash-lite` | `whisper-large-v3-turbo` |

To change a model, add a Vercel variable such as `OPENAI_TEXT_MODEL` or `GEMINI_VISION_MODEL` (the full list is in `.env.example`), then redeploy. To change the order, set `AI_ORDER`, for example `gemini,openai,groq`.

## Troubleshooting

| You see | Fix |
|---|---|
| `redirect_uri_mismatch` from Google | The redirect URI in Google Cloud must exactly match `APP_URL` + `/api/auth/callback`. |
| "Server isn't fully set up" | One of the environment variables is missing. Add it, then redeploy. |
| "No working AI key" | Check the AI secrets in GitHub, then run **Sync AI keys to Vercel**. |
| "Every AI service is out of credit" | Top up OpenAI or Gemini, or add a Groq key and run the sync action. |
| Sync action fails | Check `VERCEL_TOKEN` is set and hasn't expired. The Vercel project must be named `cuttrack-ai`. |
| Signed out every week | The Google app is still in Testing. Publish it (step 3.5), then sign in again. |
| "Wrong account" | Sign in with the account set in `ALLOWED_EMAIL`. |
| Photos fail but text works | A vision model may have been retired. Set `OPENAI_VISION_MODEL` or `GEMINI_VISION_MODEL` in Vercel, then redeploy. |
| Label says "Drive ⚠" | Open Profile to see the reason. Entries are never lost; they stay on the phone and upload on the next change. |

## Moving from the claude.ai version

Data logged in the claude.ai version doesn't move over by itself. Re-enter anything you need.

If you keep using the claude.ai version, turn off its Drive backup in Profile. Otherwise it creates a second `CutTrack AI` folder that this app can't see.
