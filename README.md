# Microlearn 📚

A full-featured **microlearning iPhone app** that teaches **Economics, Philosophy, Literature, Computer Science, History, Psychology, and Mathematics** in bite-sized, swipeable lessons — inspired by the best of modern microlearning apps like Duolingo, Brilliant, and Imprint.

Built with **Expo + React Native + TypeScript**. All progress is stored **locally on your device** (AsyncStorage) — no account, no backend, no internet required after install.

---

## ✨ Features

- **Seven subjects**, each with a **3-tier skill tree** (Beginner → Intermediate → Advanced). Complete a unit to unlock the next:
  - 📈 **Economics** · 💡 **Philosophy** · 📖 **Literature** · 💻 **Computer Science**
  - 🏛️ **History** · 🧠 **Psychology** · 🔢 **Mathematics** *(new)*
- **Rich exercise types** in the lesson player:
  - Concept, quote, quiz, true/false
  - **Fill-in-the-blank**, **matching**, **ordering**, **flashcards**, **code snippets**
  - Haptic feedback + instant explanations on graded cards
- **⚡ Lightning Round** — 60-second speed quiz across all subjects; bonus XP per correct answer.
- **🎧 Hands-free Listen mode** — auto-narrates an entire lesson with text-to-speech (headphones button in the lesson player).
- **Learn tab track filter** — view All tracks or filter to Beginner / Intermediate / Advanced per subject.
- **🏆 Daily Challenge ("Daily Mix")** — a fresh, date-seeded set of 7 mixed questions pulled from across every subject, once a day. Finish it for bonus XP; it rolls over each day and tracks your completion history. Answers also feed your spaced-repetition queue.
- **🔎 Search & Discover** — search every lesson (built-in *and* AI-generated) by title, topic, or card text; filter by subject; jump straight in.
- **🔖 Bookmarks / Saved cards** — tap the bookmark on any card (concept, quote, or quiz) to save it to a personal collection you can revisit anytime.
- **🔁 Spaced repetition** — every quiz you answer is tracked with an SM-2-style scheduler and resurfaced in a **Review** session right when you're about to forget it. The Today screen shows how many cards are due, and the Profile shows how many you've mastered.
- **🧠 AI Tutor chat** — tap the ✦ on any lesson card (or the Today header) to chat with a grounded tutor. It knows the card you're on and explains, gives examples, or quizzes you — concise and conversational.
- **Gamification that keeps you coming back:**
  - 🔥 Daily streaks with a **14-day streak calendar** and milestone targets
  - ❄️ **Streak freezes** — auto-spent to save your streak if you miss a single day (earned every 7-day milestone)
  - ⏰ **Daily reminder notifications** at a time you choose
  - ⭐ XP and a daily goal ring (lessons *and* reviews count)
  - 🧗 Sequential lesson unlocking (a learning "path")
  - 🏆 Levels and 9 unlockable achievements
- **🤖 AI lesson generation (optional)** — generate a brand-new lesson on *any* topic using an open-source model hosted in the cloud. Generated lessons are cached on-device and work offline afterward.
- **📄 Turn anything into a lesson** — paste an article, your notes, or **a URL** and the AI distills it into a proper lesson with concept cards and quizzes.
- **🎯 Personalized & adaptive** — a first-launch placement flow learns your interests and level; the app surfaces your favorite subjects first and **recommends a difficulty** per subject based on your progress.
- **🔊 Listen mode** — tap the speaker on any card for on-device text-to-speech narration (great for hands-free study).
- **Polished dark UI** with per-subject gradients, progress rings, and smooth transitions.
- **Today / Learn / Create / Profile** tab navigation, plus modal Review & Tutor screens.

---

## 🚀 Run it on your iPhone (iPhone 14 Pro Max)

The fastest way to run this on your phone is with **Expo Go**.

### 1. Install dependencies
```bash
npm install
```

### 2. Install **Expo Go** on your iPhone
Get it from the App Store: search for **"Expo Go"**.

### 3. Start the dev server
```bash
npx expo start
```
A QR code will appear in your terminal.

### 4. Open the app on your phone
- Make sure your iPhone and your computer are on the **same Wi-Fi network**.
- Open the **Camera** app on your iPhone and point it at the QR code.
- Tap the banner to open the project in **Expo Go**.

> On a flaky network? Run `npx expo start --tunnel` to connect over the internet instead of LAN.

That's it — the app loads on your phone and your progress saves automatically.

> **Expo SDK:** This project is pinned to **Expo SDK 54** to match the public Expo Go app. If a future Expo Go only supports a newer SDK, the project can be re-pinned to match.

---

## 🧪 Other ways to run

- **iOS Simulator** (requires Xcode): `npm run ios`
- **Web preview** (great for a quick look): `npm run web`
- **Type-check**: `npm run typecheck`

---

## 🗂️ Project structure

```
app/                      # expo-router screens (file-based routing)
  _layout.tsx             # Root layout: providers + navigation stack
  (tabs)/                 # Tab navigator
    index.tsx             # Today  — daily goal, streak, continue learning
    learn.tsx             # Learn  — subject picker + lesson path
    create.tsx            # Create — AI lesson generator + saved AI lessons
    profile.tsx           # Profile — stats, levels, achievements
  subject/[id].tsx        # Subject detail (units & lessons)
  lesson/[id].tsx         # Interactive lesson player + completion screen
  review.tsx              # Spaced-repetition review session (modal)
  challenge.tsx           # Daily Challenge session (modal)
  search.tsx              # Search & Discover (modal)
  saved.tsx               # Saved / bookmarked cards
  tutor.tsx               # AI Tutor chat (modal)
  onboarding.tsx          # First-launch placement (interests + level)
  settings.tsx            # AI provider / key configuration
src/
  ai/                     # AI client + provider presets
    client.ts             # OpenAI-compatible request + JSON validation + tutor chat
    providers.ts          # Groq / OpenRouter / Together presets
  components/             # Reusable UI (CardView, StreakCalendar, ReminderSettings, …)
  context/                # Progress, Library (AI), Review (SRS), Challenge,
                          #   Bookmarks, Preferences (onboarding/interests/level)
  data/                   # Course content + achievements + daily-challenge builder
    economics.ts
    philosophy.ts
    literature.ts
    computerScience.ts
  hooks/                  # useSpeech (text-to-speech)
  notifications/          # Daily reminder scheduling (expo-notifications)
  srs/                    # Spaced-repetition scheduler (SM-2-style)
  theme/                  # Colors, spacing, typography
  types/                  # Content type definitions
  utils/                  # Dates, seeded RNG, adaptive difficulty, URL readability
```

---

## 🧠 How progress works

- Completing a lesson awards XP (more for lessons with more questions). **Review sessions also award XP** and keep your streak alive.
- Your **streak** increases the first time you earn XP each day, and resets if you miss a day — unless you have a **streak freeze**, which is spent automatically to cover a single missed day. You earn a freeze every 7-day milestone (up to 5).
- Every quiz/true-false you answer is added to a **spaced-repetition queue** and rescheduled based on whether you got it right. Due cards appear on Today and in the Review session.
- Lessons unlock **in order** within each subject.
- Progress is persisted via AsyncStorage (`microlearn.progress.v1`); reviews under `microlearn.review.v1`; reminder prefs under `microlearn.reminders.v1`.
- You can wipe all progress anytime from **Profile → Reset all progress**.

---

## 🤖 AI-generated lessons (optional)

Beyond the built-in lessons, you can generate unlimited new ones on any topic. The app calls an **open-source model hosted in the cloud** via any OpenAI-compatible API — your computer is never involved, just your phone and the internet.

### This project is preconfigured (baked-in key)
The API key, base URL, and model are read from a **git-ignored `.env`** file and inlined at build time, so the app works immediately — no key entry needed in the UI. Defaults:

```
EXPO_PUBLIC_GEMINI_API_KEY=...        # your Google AI Studio key (git-ignored)
EXPO_PUBLIC_AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
EXPO_PUBLIC_AI_MODEL=gemma-4-31b-it
```

To change the key/model, edit `.env` (copy `.env.example` if it's missing) and restart with `npx expo start -c`.

> ⚠️ **Security note:** `.env` is git-ignored so the key never enters the repo, but `EXPO_PUBLIC_*` values are embedded in the app bundle and are technically extractable from a built app. That's fine for a personal app that only runs on your own device. For a public/shared app, move the key behind a server proxy instead (the in-app Settings can point the Base URL at your proxy). Also: **rotate any key you've shared in plaintext.**

### Or configure it in-app instead
You can also enter/override credentials at runtime (these take precedence over `.env`):
1. Open the **Create** tab → tap the **gear** (Settings).
2. Pick a provider and tap **"Get a free API key"** to create one:
   - **Google (Gemini / Gemma)** — *recommended for this app* · https://aistudio.google.com/apikey
     - Best free quotas here: **~500 requests/day** on `gemini-flash-lite-latest` and **~1,500/day** on **Gemma 4 (26B/31B)** with no per-minute token cap. Use Flash-Lite for everyday lessons; **Gemma 4 31B** when a topic needs deeper reasoning.
   - **Groq** — extremely fast; great fallback · https://console.groq.com/keys
     - ~1,000/day on the big models. `openai/gpt-oss-120b` and `qwen/qwen3-32b` are strong picks.
   - **OpenRouter** — many open models, some free · https://openrouter.ai/keys
   - **Together AI** — large selection, cheap pay-as-you-go
   - **Custom** — any OpenAI-compatible endpoint (vLLM, Ollama, LM Studio, etc.)
3. Paste the key, optionally pick a model, and tap **Test** then **Save**.

> **Why this design fits the free tiers:** each tap of *Generate* makes **one** request that returns an entire lesson (concept cards + multiple quizzes + explanations), and the result is **cached on-device**. So you spend one request per lesson, not one per swipe/answer — which stretches those daily quotas a long way.

> **Note on Google + JSON:** the app asks for structured JSON. Gemini handles JSON mode natively; for Gemma models that don't accept it, the client automatically retries without JSON mode and parses the lesson defensively — so both work.

### Generating
- Go to the **Create** tab, choose a subject, type a topic (e.g. *"game theory"*, *"stoicism"*, *"recursion"*), pick a difficulty, and tap **Generate lesson**.
- The lesson opens in the same interactive player and is saved to **Your AI lessons** for offline study.

### Where your key lives 🔒
Your API key is stored **only on your device**, in the iOS secure keychain (via `expo-secure-store`). It is never committed to the repo, baked into the app bundle, or sent anywhere except directly to the provider you choose. Remove it anytime by clearing the field in Settings and saving.

> Want a model you fully control? Point the **Base URL** at your own self-hosted endpoint (e.g. a `vLLM`/`Ollama` server on a cloud GPU like Modal or RunPod). The app just needs an OpenAI-compatible `/chat/completions` route.

---

## ✏️ Adding your own content

Each subject is a plain TypeScript object in `src/data/`. To add a lesson, drop a new entry into a unit's `lessons` array. Cards support four types: `concept`, `quote`, `quiz`, and `truefalse`. The app picks everything up automatically — no other wiring needed.

---

Made for personal learning. Have fun getting a little smarter every day. 🎓
