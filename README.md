# Dad Joke Club 😂

All-in-one joke management tool. Create, evaluate, and build your Hall of Fame with your team.

## Features

- **🤖 Generator** - Claude AI generates 3 jokes by keyword
- **📚 Collection** - Register jokes, give hearts (localStorage)
- **🎬 Shorts** - Search & get YouTube shorts recommendations
- **🎯 Analyze** - AI scores jokes and gives tips (video or text)
- **🎪 Practice** - Simulate team reactions
- **🏆 Hall of Fame** - Dad of the Month, Brave Dad, Dad Spirit Award

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run dev server

```bash
npm run dev
```

Open `http://localhost:5173`

### 3. API Key

Click **⚙️ API Key** and enter your [Anthropic](https://console.anthropic.com/) API key. Stored in browser only.

### 4. Build

```bash
npm run build
```

Output in `dist/`

## Tech Stack

- React 18 + Vite 6
- Claude API (Sonnet 4.5 / Haiku 4.5)
