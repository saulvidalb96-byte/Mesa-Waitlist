# Mesa Waitlist

A restaurant waitlist app for the host stand, built to serve many businesses from one site.
Canela Brunch & Cocktails is the first business on it.

**What it does**
- Host board: add parties, live wait timers, "past quote" alerts, seat / no-show / cancel, today's average wait
- Works on iPad and phone. Add it to the home screen and it opens like an app
- Live updates across every device signed in to the same business
- Text guests: "table ready" and "you're on the list" messages, with editable wording
  - Before Twilio: opens Messages or copies the text to send from your phone
  - After Twilio: one-tap **Send text** from the app, from your business number
- Guest page: each guest gets a link showing their live spot in line, with a button to leave the list
- QR code check-in (optional): guests scan a code at the door and add themselves
- Multiple businesses: anyone can sign up and create their own business with its own name, color, staff and messages. Data is fully separated between businesses.

**Built with:** React + Vite (the app), Supabase (database, logins, live updates), Netlify (hosting + 2 server functions), Twilio (texting, optional).

---

## Setup (one time, about 30 minutes)

### 1. Supabase: the database (free)
1. Go to **supabase.com** → sign up → **New project**. Name it `mesa-waitlist`, pick a strong database password, region **West US (Oregon)**.
2. When it's ready, open **SQL Editor** → **New query**, paste the whole contents of `supabase/schema.sql`, and tap **Run**. You should see "Success".
3. Go to **Project Settings → API** and copy three values:
   - **Project URL**
   - **anon public** key
   - **service_role** key (secret: never put it in the app or share it)
4. **Authentication → URL Configuration**: set **Site URL** to your Netlify address (step 3). Add it under Redirect URLs too.

### 2. GitHub: where the code lives (free)
The code goes in a GitHub repository. Netlify rebuilds the site automatically every time the code changes.

### 3. Netlify: hosting
1. Netlify → **Add new site → Import an existing project → GitHub** → pick the repository.
2. The build settings fill themselves in from `netlify.toml`. Leave them as they are.
3. Before deploying, open **Site configuration → Environment variables** and add:

| Key | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL from step 1 |
| `VITE_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |

4. Deploy. Optional: set a custom domain, for example `waitlist.canelabrunch.com` under **Domain management**.

### 4. First login
1. Open the site → **Create an account** with your email → confirm the email → sign in.
2. Create the business: **Canela Brunch & Cocktails**, web name `canela`.
3. In ⚙︎ Settings, add a host-stand login under **Staff** (for example `hoststand@canelabrunch.com` with a password the team knows), then sign in with it on the iPad.

### 5. Twilio: texting from the app (optional, add any time)
1. Sign up at **twilio.com**, upgrade the account (add a card), and buy a local **360** number (about $1.15/month).
2. Complete **A2P 10DLC registration** (Messaging → Regulatory Compliance). US carriers require it for business texting.
   - Brand: Canela's legal business name and EIN
   - Campaign use case: **Customer Care**, sample message: the "table ready" text
   - Opt-in description: *"Guests give their mobile number to the host or enter it on our check-in page to receive texts about their table."*
   - Approval usually takes a few days to two weeks.
3. Create a **Messaging Service**, add your number to it, and copy its SID (`MG…`).
4. Add these to Netlify environment variables, then redeploy:

| Key | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | `AC…` from the Twilio console |
| `TWILIO_AUTH_TOKEN` | auth token from the Twilio console |
| `TWILIO_MESSAGING_SERVICE_SID` | `MG…` |

The **Send text** button appears automatically once these are set. Guests who reply STOP are blocked by Twilio automatically.

**Costs at Canela's size:** Supabase free, Netlify free, Twilio about $1–2/month for the number plus about $0.01 per text, plus a one-time registration fee.

---

## Offering it to other businesses
- Each business signs up on the same site and creates its own business. Its parties, staff and settings are invisible to everyone else (enforced by database rules, not just the app).
- Each business can get its own texting number: add a row in Supabase **Table editor → business_private** with their `sms_from` number (a number in your Twilio account). Otherwise texts go through the shared number.
- To stop strangers from signing up before you're ready to sell, turn off **Authentication → Providers → Email → Allow new users to sign up**. Staff logins created from Settings still work.
- Not built yet: billing (Stripe), a marketing page, and reservations.

Rename the product by changing `APP_NAME` in `src/App.tsx` plus the names in `index.html` and `public/manifest.webmanifest`.

## Developing
```bash
npm install
cp .env.example .env.local   # fill in the Supabase values
npm run dev                  # app only; use `netlify dev` to also run the functions
npm run build                # typecheck + production build
```
