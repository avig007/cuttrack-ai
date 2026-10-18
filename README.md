# CutTrack AI — standalone version

An Indian calorie and macro tracker that runs on your iPhone's Home Screen. It does not depend on a Claude plan.

```
iPhone (CutTrack app)
   │  your log is kept on the phone first, so it works offline
   ▼
Your Vercel server (free)  ── holds your secrets ──┐
   ├─ /api/drive       →  Google Drive   (stores your data, no AI)
   ├─ /api/ai          →  OpenAI         (reads meals, photos, coach)
   └─ /api/transcribe  →  OpenAI         (voice notes)
                          Groq is an optional backup
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

**Cost:** Vercel Hobby and Google Drive are free. OpenAI is pay-as-you-go; `gpt-6-luna` costs $0.10 per million input tokens, so a month of logging is typically a few rupees.

---

## Before you start

You need:

- a laptop (the setup is far easier there than on a phone)
- a GitHub account
- a Google account (avijeetgupta02@gmail.com)
- about 30 minutes

> **Your OpenAI key goes in Vercel, not GitHub.** A GitHub repository secret is only readable by GitHub Actions; the running app on Vercel can't see it. Paste the key into Vercel in step 4.

---

## Step 1 — Get an OpenAI API key

1. Go to **platform.openai.com → API keys → Create new secret key**, name it `CutTrack`, and copy it (starts with `sk-`).
2. Open **Billing** and add a small amount of credit (the API doesn't use your ChatGPT subscription).

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
   | `OPENAI_API_KEY` | your `sk-…` key |
   | `GOOGLE_CLIENT_ID` | from step 3.6 |
   | `GOOGLE_CLIENT_SECRET` | from step 3.6 |
   | `ALLOWED_EMAIL` | `avijeetgupta02@gmail.com` |
   | `SESSION_SECRET` | a random string of 32 or more characters (see below) |

   For `SESSION_SECRET`, use a password generator, or run `openssl rand -base64 36` on a Mac. Don't reuse a real password.
5. Click **Deploy**. When it finishes, copy your address, for example `https://cuttrack-ai-xyz.vercel.app`.

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

| Feature | OpenAI model (change in Vercel settings) |
|---|---|
| Typed and spoken meals, coach | `gpt-6-luna` (`OPENAI_TEXT_MODEL`) |
| Photos and labels | `gpt-6-luna` (`OPENAI_VISION_MODEL`) |
| Voice | `gpt-4o-mini-transcribe` (`OPENAI_STT_MODEL`) |

**Backup provider:** add `GROQ_API_KEY` in Vercel too. It's used automatically if `OPENAI_API_KEY` is removed, or always if you set `AI_PROVIDER=groq`.

## Troubleshooting

| You see | Fix |
|---|---|
| `redirect_uri_mismatch` from Google | The redirect URI in Google Cloud must exactly match `APP_URL` + `/api/auth/callback`. |
| "Server isn't fully set up" | One of the environment variables is missing. Add it, then redeploy. |
| "AI key … invalid" | Check `OPENAI_API_KEY` in Vercel, then redeploy. |
| "Out of credit" | Add credit at platform.openai.com → Billing. |
| Signed out every week | The Google app is still in Testing. Publish it (step 3.5), then sign in again. |
| "Wrong account" | Sign in with the account set in `ALLOWED_EMAIL`. |
| Photos fail but text works | Set `OPENAI_VISION_MODEL` to a current OpenAI vision model, then redeploy. |
| Label says "Drive ⚠" | Open Profile to see the reason. Entries are never lost; they stay on the phone and upload on the next change. |

## Moving from the claude.ai version

Data logged in the claude.ai version doesn't move over by itself. Re-enter anything you need.

If you keep using the claude.ai version, turn off its Drive backup in Profile. Otherwise it creates a second `CutTrack AI` folder that this app can't see.
