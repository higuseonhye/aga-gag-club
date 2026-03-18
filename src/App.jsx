import { useState, useEffect } from "react";

const STORAGE_KEY = "dad-joke-club";
const API_KEY_KEY = "dad-joke-api-key";
const AZ_GAG_QUESTION = "https://raw.githubusercontent.com/AZ-GAG/AZ-GAG-dataset/main/question.csv";
const AZ_GAG_ANSWER = "https://raw.githubusercontent.com/AZ-GAG/AZ-GAG-dataset/main/answer.csv";
function extractYoutubeVideoId(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

const CORS_PROXIES = [
  "https://api.allorigins.win/raw?url=",
  "https://corsproxy.io/?",
];

async function fetchYoutubeTranscript(videoId) {
  const url = `https://tubetext.vercel.app/youtube/transcript?video_id=${videoId}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = await res.json().catch(() => ({}));
    if (data?.success && data?.data?.full_text) return data.data.full_text;
  } catch {}
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      const data = JSON.parse(text);
      if (data?.success && data?.data?.full_text) return data.data.full_text;
    } catch {}
  }
  return null;
}

async function fetchYoutubeMetadata(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoints = [
    () => fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000) }),
    () => fetch(CORS_PROXIES[0] + encodeURIComponent(`https://noembed.com/embed?url=${url}`), { signal: AbortSignal.timeout(12000) }),
  ];
  for (const fn of endpoints) {
    try {
      const res = await fn();
      const data = await res.json().catch(() => ({}));
      if (data?.title) {
        return {
          title: data.title || "",
          author: data.author_name || "",
          description: (data.description || "").slice(0, 500),
        };
      }
    } catch {}
  }
  return null;
}

function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    let str = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(str);
    } catch {
      try {
        return JSON.parse(str.replace(/,(\s*[}\]])/g, "$1"));
      } catch {}
    }
  }
  throw new Error("Response parse failed");
}

const DEFAULT_MEMBERS = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Me"];

const SAMPLE_JOKES = [
  { id: 1, text: "Why was the math book sad? It had too many problems 😢", author: "Alice", hearts: 7, predicted: 6 },
  { id: 2, text: "Why did the refrigerator laugh? Because it was cool inside ❄️", author: "Bob", hearts: 12, predicted: 9 },
  { id: 3, text: "What do you call a bear with no teeth? A gummy bear 🐢", author: "Charlie", hearts: 3, predicted: 5 },
];

const KEYWORDS = ["animals", "food", "weather", "work", "school", "sports", "tech", "family"];

function StarRating({ score }) {
  const stars = Math.round(score / 2);
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ fontSize: 14, color: i <= stars ? "#FFD700" : "#333" }}>★</span>
      ))}
    </div>
  );
}

function loadJokes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return data.jokes?.length ? data.jokes : SAMPLE_JOKES;
    }
  } catch {}
  return SAMPLE_JOKES;
}

function saveJokes(jokes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ jokes, savedAt: Date.now() }));
}

export default function App() {
  const [tab, setTab] = useState("generate");
  const [keyword, setKeyword] = useState("");
  const [jokeMode, setJokeMode] = useState("general");
  const [generatedJokes, setGeneratedJokes] = useState([]);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [jokes, setJokes] = useState(loadJokes);
  const [newJoke, setNewJoke] = useState("");
  const [newAuthor, setNewAuthor] = useState("Me");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [analyzeInput, setAnalyzeInput] = useState("");
  const [practiceJoke, setPracticeJoke] = useState("");
  const [practiceResult, setPracticeResult] = useState(null);
  const [practicingLoading, setPracticingLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_KEY) || "");
  const [loadingFetch, setLoadingFetch] = useState(false);

  useEffect(() => {
    saveJokes(jokes);
  }, [jokes]);

  useEffect(() => {
    if (apiKey) localStorage.setItem(API_KEY_KEY, apiKey);
    else localStorage.removeItem(API_KEY_KEY);
  }, [apiKey]);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2500);
  };

  const callClaude = async (prompt, system = "", opts = {}) => {
    const key = apiKey?.trim();
    if (!key) {
      showToast("Please set API key first ⚙️");
      setShowSettings(true);
      return "";
    }
    const model = opts.model || "claude-haiku-4-5";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeout ?? 25000);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 800,
          system: system || "You are a dad joke expert. Create short, funny dad jokes.",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error (${res.status})`);
      }
      const data = await res.json();
      return data.content?.[0]?.text || "";
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === "AbortError") throw new Error("Request timeout (25s)");
      throw e;
    }
  };

  const generateJokes = async () => {
    if (!keyword.trim()) return;
    setLoadingGenerate(true);
    setGeneratedJokes([]);
    const isDadJoke = jokeMode === "ajaegaeg";
    const topByHearts = [...jokes].filter((j) => j.hearts > 0).sort((a, b) => b.hearts - a.hearts).slice(0, 3);
    const feedbackSection =
      topByHearts.length > 0
        ? `\n\n【Team favorites (reference this style)】\n${topByHearts.map((j) => `- "${j.text}"`).join("\n")}`
        : "";
    const systemPrompt = isDadJoke
      ? `You are a dad joke expert. Create jokes that make logical sense with proper wordplay.

【Rules】
1. Question and answer must flow naturally. No forced connections.
2. Use puns/wordplay that actually work in English.
3. Answer must make sense in context.
4. Classic examples: "Why did the scarecrow win? He was outstanding in his field", "What do you call a bear with no teeth? A gummy bear"${feedbackSection}

Output ONLY a JSON array. No other text.`
      : `You are a humor expert. Create jokes that make people actually laugh.${feedbackSection}

【Good joke criteria】
- Use twist, irony, situational comedy, wordplay
- Short and punchy. One or two lines max.
- Relatable work/life topics
- Must make logical sense

【Examples】
- "Payday: I have money! / Day after payday: Money has me..."
- "3-hour meeting: No conclusion. 30-min lunch: Concluded on what to eat"
- Situational twists, unexpected punchlines

Output ONLY a JSON array. No other text.`;
    const userPrompt = isDadJoke
      ? `Create 3 dad jokes using the keyword "${keyword}". Output JSON array only. Example: ["Q? A!", "Q? A!", "Q? A!"]`
      : `Create 3 funny jokes using the keyword "${keyword}". Output JSON array only. Example: ["joke1", "joke2", "joke3"]`;
    try {
      const text = await callClaude(userPrompt, systemPrompt, {
        model: "claude-sonnet-4-5",
        timeout: 35000,
      });
      if (!text) return;
      const clean = text.replace(/```json|```/g, "").trim();
      const arr = JSON.parse(clean);
      setGeneratedJokes(Array.isArray(arr) ? arr : [arr]);
    } catch (e) {
      setGeneratedJokes([`Generation failed 😅 ${e.message || "Try again!"}`]);
    } finally {
      setLoadingGenerate(false);
    }
  };

  const analyzeJoke = async () => {
    const input = analyzeInput.trim();
    if (!input) return;
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      let content = input;
      const videoId = extractYoutubeVideoId(input);
      if (videoId) {
        let transcript = await fetchYoutubeTranscript(videoId);
        if (!transcript) {
          const meta = await fetchYoutubeMetadata(videoId);
          if (meta?.title) {
            content = `[YouTube video info]\nTitle: ${meta.title}\nChannel: ${meta.author}\n${meta.description ? `Description: ${meta.description}` : ""}\n\n※ Analyzing from title/description (no transcript available).`;
          } else {
            showToast("Could not fetch video info. Please enter joke text directly.");
            return;
          }
        } else {
          content = transcript;
        }
      }
      const text = await callClaude(
        `Analyze this joke/humor content. Output JSON only.\n\nContent:\n"""${content.slice(0, 6000)}"""\n\nResponse format (no other text):\n{"score": 7, "emoji": "😄", "verdict": "one-line verdict", "tip": "improvement tip"}`,
        "Joke analyst. Output pure JSON only. score 1-10. emoji, verdict, tip required.",
        { model: "claude-sonnet-4-5", timeout: 35000 }
      );
      if (!text) return;
      const result = extractJson(text);
      if (!result.score && result.score !== 0) result.score = 5;
      setAnalyzeResult(result);
    } catch (e) {
      showToast(`Analysis failed 😅 ${e.message || "Try again"}`);
      setAnalyzeResult({ score: 5, emoji: "🤔", verdict: "Analysis failed", tip: e.message || "Try again" });
    } finally {
      setAnalyzing(false);
    }
  };

  const practiceJokeFn = async () => {
    const input = practiceJoke.trim();
    if (!input) return;
    setPracticingLoading(true);
    setPracticeResult(null);
    try {
      let content = input;
      const videoId = extractYoutubeVideoId(input);
      if (videoId) {
        let transcript = await fetchYoutubeTranscript(videoId);
        if (!transcript) {
          const meta = await fetchYoutubeMetadata(videoId);
          if (meta?.title) {
            content = `[YouTube video info]\nTitle: ${meta.title}\nChannel: ${meta.author}\n${meta.description ? `Description: ${meta.description}` : ""}\n\n※ Predicting from title/description (no transcript available).`;
          } else {
            showToast("Could not fetch video info. Please enter joke text directly.");
            return;
          }
        } else {
          content = transcript;
        }
      }
      const text = await callClaude(
        `Joke/humor content. Output JSON only.\n\nContent:\n"""${content.slice(0, 6000)}"""\n\nResponse format:\n{"reactions": [{"name": "Member A", "reaction": "lol", "hearts": 1}, {"name": "Member B", "reaction": "haha", "hearts": 0}, ...], "totalHearts": 4, "advice": "advice"}`,
        "Reaction predictor. Output pure JSON only. reactions array of 5, totalHearts number, advice string required.",
        { model: "claude-sonnet-4-5", timeout: 35000 }
      );
      if (!text) return;
      const result = extractJson(text);
      if (!result.reactions) result.reactions = [];
      if (result.totalHearts == null) result.totalHearts = 0;
      if (!result.advice) result.advice = "";
      setPracticeResult(result);
    } catch (e) {
      showToast(`Prediction failed 😅 ${e.message || "Try again"}`);
      setPracticeResult({ reactions: [], totalHearts: 0, advice: e.message || "Try again" });
    } finally {
      setPracticingLoading(false);
    }
  };

  const addJoke = () => {
    if (!newJoke.trim()) return;
    const joke = { id: Date.now(), text: newJoke, author: newAuthor, hearts: 0, predicted: 0 };
    setJokes((prev) => [joke, ...prev]);
    setNewJoke("");
    showToast("Joke added! 🎉");
  };

  const addHeart = (id) => {
    setJokes((prev) => prev.map((j) => (j.id === id ? { ...j, hearts: j.hearts + 1 } : j)));
  };

  const fetchFromWeb = async () => {
    setLoadingFetch(true);
    try {
      const [qRes, aRes] = await Promise.all([
        fetch(AZ_GAG_QUESTION),
        fetch(AZ_GAG_ANSWER),
      ]);
      const qText = await qRes.text();
      const aText = await aRes.text();
      const questions = qText.trim().split("\n").map((s) => s.replace(/^"|"$/g, "").trim()).filter(Boolean);
      const answers = aText.trim().split("\n").map((s) => s.replace(/^"|"$/g, "").trim()).filter(Boolean);
      const pairs = questions.slice(0, Math.min(questions.length, answers.length)).map((q, i) => ({
        text: `${q} ${answers[i]}`,
        author: "Web",
        hearts: 0,
        predicted: 0,
      }));
      const existing = new Set(jokes.map((j) => j.text));
      const toAdd = pairs.filter((p) => !existing.has(p.text));
      if (toAdd.length === 0) {
        showToast("Already have them all! 🌐");
      } else {
        const newJokes = toAdd.map((j) => ({ ...j, id: Date.now() + Math.random() }));
        setJokes((prev) => [...newJokes, ...prev]);
        showToast(`Added ${toAdd.length} jokes! 🌐`);
      }
    } catch (e) {
      showToast(`Fetch failed 😅 ${e.message || "Try again"}`);
    }
    setLoadingFetch(false);
  };

  const [shortsRecs, setShortsRecs] = useState([]);
  const [loadingShorts, setLoadingShorts] = useState(false);
  const [shortsSearch, setShortsSearch] = useState("");
  const [collectionView, setCollectionView] = useState("shorts");
  const [shortsIndex, setShortsIndex] = useState(0);

  const fetchShortsRecommendations = async () => {
    const q = shortsSearch.trim() || "funny shorts";
    setLoadingShorts(true);
    setShortsRecs([]);
    try {
      const text = await callClaude(
        `Recommend 5 funny YouTube shorts for search: "${q}".
Each item: {"title":"video title","channel":"channel name","keyword":"YouTube search term"}
keyword = specific search term to find the video on YouTube.
Output JSON array only.`,
        "YouTube shorts recommender. Recommend funny shorts matching the search. Output JSON array only.",
        { model: "claude-sonnet-4-5", timeout: 30000 }
      );
      if (!text) return;
      const clean = text.replace(/```json|```/g, "").trim();
      const arr = JSON.parse(clean);
      const items = Array.isArray(arr) ? arr : [arr];
      setShortsRecs(items.map((r) => ({ title: r.title || "", channel: r.channel || "", keyword: r.keyword || r.title || "" })));
    } catch (e) {
      showToast(`Recommendation failed 😅 ${e.message || "Try again"}`);
    }
    setLoadingShorts(false);
  };

  const sorted = [...jokes].sort((a, b) => b.hearts - a.hearts);
  const topJoke = sorted[0];
  const bottomJoke = sorted[sorted.length - 1];
  const mostActive = DEFAULT_MEMBERS.reduce((acc, m) => {
    const count = jokes.filter((j) => j.author === m).length;
    return count > (acc.count || 0) ? { name: m, count } : acc;
  }, {});

  const tabs = [
    { id: "generate", label: "🤖 Generator" },
    { id: "collection", label: "📚 Collection" },
    { id: "shorts", label: "🎬 Shorts" },
    { id: "analyze", label: "🎯 Analyze" },
    { id: "practice", label: "🎪 Practice" },
    { id: "board", label: "🏆 Hall of Fame" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0A0A",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#F0F0F0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background:
            "radial-gradient(ellipse at 20% 20%, #1a0a00 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, #001a0a 0%, transparent 60%)",
          pointerEvents: "none",
        }}
      />

      {toastMsg && (
        <div
          style={{
            position: "fixed",
            top: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#FF6B00",
            color: "#fff",
            padding: "10px 24px",
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 14,
            zIndex: 9999,
            boxShadow: "0 4px 24px rgba(255,107,0,0.4)",
          }}
        >
          {toastMsg}
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1, maxWidth: 680, margin: "0 auto", padding: "0 16px 80px" }}>
        <div style={{ textAlign: "center", padding: "40px 0 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>😂</div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 900,
              margin: 0,
              background: "linear-gradient(90deg, #FF6B00, #FFB300)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Dad Joke Club
          </h1>
          <p style={{ color: "#666", fontSize: 13, margin: "6px 0 0" }}>All-in-one joke management</p>
          <button
            onClick={() => setShowSettings(true)}
            style={{
              marginTop: 12,
              padding: "6px 14px",
              background: "transparent",
              border: "1px solid #333",
              borderRadius: 8,
              color: "#666",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            ⚙️ API Key
          </button>
        </div>

        {showSettings && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9998,
              background: "rgba(0,0,0,0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
            onClick={() => setShowSettings(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#111",
                border: "1px solid #333",
                borderRadius: 16,
                padding: 24,
                maxWidth: 400,
                width: "100%",
              }}
            >
              <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>🔑 Anthropic API Key</h3>
              <p style={{ fontSize: 12, color: "#888", margin: "0 0 12px" }}>
                API key from Anthropic Console. Stored in browser only.
              </p>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                style={inputStyle}
                autoComplete="off"
              />
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <OrangeButton onClick={() => setShowSettings(false)}>Save</OrangeButton>
                <button
                  onClick={() => setShowSettings(false)}
                  style={{
                    background: "#333",
                    color: "#888",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 20px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 4,
            marginBottom: 24,
            scrollbarWidth: "none",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontSize: 13,
                fontWeight: tab === t.id ? 700 : 400,
                background: tab === t.id ? "#FF6B00" : "#1A1A1A",
                color: tab === t.id ? "#fff" : "#888",
                transition: "all 0.2s",
                boxShadow: tab === t.id ? "0 0 16px rgba(255,107,0,0.4)" : "none",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "generate" && (
          <div>
            <Card>
              <Label>Joke Style</Label>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button
                  onClick={() => setJokeMode("general")}
                  style={{
                    flex: 1,
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: `1px solid ${jokeMode === "general" ? "#FF6B00" : "#333"}`,
                    background: jokeMode === "general" ? "rgba(255,107,0,0.15)" : "transparent",
                    color: jokeMode === "general" ? "#FF6B00" : "#888",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: jokeMode === "general" ? 700 : 400,
                  }}
                >
                  😂 General
                </button>
                <button
                  onClick={() => setJokeMode("ajaegaeg")}
                  style={{
                    flex: 1,
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: `1px solid ${jokeMode === "ajaegaeg" ? "#FF6B00" : "#333"}`,
                    background: jokeMode === "ajaegaeg" ? "rgba(255,107,0,0.15)" : "transparent",
                    color: jokeMode === "ajaegaeg" ? "#FF6B00" : "#888",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: jokeMode === "ajaegaeg" ? 700 : 400,
                  }}
                >
                  🧓 Dad Jokes
                </button>
              </div>
              <Label>Generate by Keyword</Label>
              <p style={{ fontSize: 12, color: "#555", margin: "0 0 12px" }}>
                💡 Top-hearted jokes improve generation quality
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {KEYWORDS.map((k) => (
                  <button
                    key={k}
                    onClick={() => setKeyword(k)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 999,
                      border: `1px solid ${keyword === k ? "#FF6B00" : "#333"}`,
                      background: keyword === k ? "rgba(255,107,0,0.15)" : "transparent",
                      color: keyword === k ? "#FF6B00" : "#888",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && generateJokes()}
                  placeholder="Type or select above"
                  style={inputStyle}
                />
                <OrangeButton onClick={generateJokes} disabled={loadingGenerate}>
                  {loadingGenerate ? "Generating..." : "Generate"}
                </OrangeButton>
              </div>
            </Card>

            {loadingGenerate && <LoadingDots />}

            {generatedJokes.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
                {generatedJokes.map((joke, i) => (
                  <Card
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <p style={{ margin: 0, lineHeight: 1.6, fontSize: 15 }}>
                      {typeof joke === "string" ? joke : joke.text || JSON.stringify(joke)}
                    </p>
                    {typeof joke === "string" && !joke.includes("failed") && (
                      <button
                        onClick={() => {
                          setNewJoke(joke);
                          setTab("collection");
                          showToast("Added to collection!");
                        }}
                        style={{
                          background: "none",
                          border: "1px solid #333",
                          borderRadius: 8,
                          color: "#888",
                          cursor: "pointer",
                          fontSize: 11,
                          padding: "4px 8px",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        Save
                      </button>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "collection" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => setCollectionView("shorts")}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  border: `1px solid ${collectionView === "shorts" ? "#FF6B00" : "#333"}`,
                  background: collectionView === "shorts" ? "rgba(255,107,0,0.15)" : "transparent",
                  color: collectionView === "shorts" ? "#FF6B00" : "#888",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                🎬 Shorts View
              </button>
              <button
                onClick={() => setCollectionView("list")}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  border: `1px solid ${collectionView === "list" ? "#FF6B00" : "#333"}`,
                  background: collectionView === "list" ? "rgba(255,107,0,0.15)" : "transparent",
                  color: collectionView === "list" ? "#FF6B00" : "#888",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                📋 List
              </button>
            </div>

            {collectionView === "shorts" ? (
              jokes.length > 0 ? (
                <div
                  style={{
                    minHeight: "60vh",
                    background: "#111",
                    border: "1px solid #222",
                    borderRadius: 16,
                    padding: "32px 24px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <p style={{ fontSize: 22, lineHeight: 1.6, textAlign: "center", margin: 0, flex: 1, display: "flex", alignItems: "center" }}>
                    {jokes[shortsIndex % jokes.length]?.text}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 24 }}>
                    <button
                      onClick={() => addHeart(jokes[shortsIndex % jokes.length]?.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 32 }}
                    >
                      ❤️
                    </button>
                    <span style={{ fontSize: 24, fontWeight: 900, color: "#FF6B00" }}>
                      {jokes[shortsIndex % jokes.length]?.hearts || 0}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                    <button
                      onClick={() => setShortsIndex((i) => Math.max(0, i - 1))}
                      style={{
                        padding: "8px 20px",
                        background: "#333",
                        border: "none",
                        borderRadius: 8,
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      ← Prev
                    </button>
                    <span style={{ padding: "8px 16px", color: "#666", fontSize: 13 }}>
                      {shortsIndex % jokes.length + 1} / {jokes.length}
                    </span>
                    <button
                      onClick={() => setShortsIndex((i) => i + 1)}
                      style={{
                        padding: "8px 20px",
                        background: "#FF6B00",
                        border: "none",
                        borderRadius: 8,
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      Next →
                    </button>
                  </div>
                  <button
                    onClick={() => setCollectionView("list")}
                    style={{
                      marginTop: 12,
                      padding: "6px 12px",
                      background: "transparent",
                      border: "1px solid #333",
                      borderRadius: 8,
                      color: "#666",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    + Add Data
                  </button>
                </div>
              ) : (
                <Card>
                  <p style={{ textAlign: "center", color: "#666", marginBottom: 12 }}>No jokes yet</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <OrangeButton onClick={fetchFromWeb} disabled={loadingFetch} style={{ flex: 1 }}>
                      Load Dataset
                    </OrangeButton>
                    <button
                      onClick={() => setCollectionView("list")}
                      style={{
                        flex: 1,
                        padding: "10px",
                        background: "#333",
                        border: "none",
                        borderRadius: 10,
                        color: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Add Joke
                    </button>
                  </div>
                </Card>
              )
            ) : (
              <>
                <Card>
                  <Label>Load from Dataset</Label>
                  <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px" }}>
                    AZ-GAG dad joke dataset. Read & react in shorts style
                  </p>
                  <OrangeButton onClick={fetchFromWeb} disabled={loadingFetch} style={{ width: "100%" }}>
                    {loadingFetch ? "Loading..." : "🌐 Load Dataset"}
                  </OrangeButton>
                </Card>
                <Card>
                  <Label>Add Joke</Label>
              <textarea
                value={newJoke}
                onChange={(e) => setNewJoke(e.target.value)}
                placeholder="Enter your joke..."
                rows={3}
                style={{
                  ...inputStyle,
                  resize: "none",
                  width: "100%",
                  boxSizing: "border-box",
                  marginBottom: 8,
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  {DEFAULT_MEMBERS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <OrangeButton onClick={addJoke}>Add</OrangeButton>
              </div>
            </Card>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
              {jokes.map((j) => (
                <Card key={j.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: "0 0 8px", lineHeight: 1.6, fontSize: 15 }}>{j.text}</p>
                      <span style={{ fontSize: 12, color: "#666" }}>by {j.author}</span>
                    </div>
                    <button
                      onClick={() => addHeart(j.id)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 20,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                        flexShrink: 0,
                      }}
                    >
                      ❤️
                      <span style={{ fontSize: 12, color: "#FF6B00", fontWeight: 700 }}>{j.hearts}</span>
                    </button>
                  </div>
                </Card>
              ))}
            </div>
              </>
            )}
          </div>
        )}

        {tab === "shorts" && (
          <div>
            <Card style={{ border: "1px solid rgba(255,107,0,0.4)", background: "rgba(255,107,0,0.05)" }}>
              <Label>🔥 Top Pick (Verified)</Label>
              <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px" }}>
                Club-approved funny shorts
              </p>
              <a
                href="https://www.youtube.com/shorts/E1UqgRKd1Uc"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  background: "#fff",
                  color: "#0A0A0A",
                  borderRadius: 12,
                  textDecoration: "none",
                  border: "1px solid #333",
                }}
              >
                <span style={{ fontSize: 28 }}>😂</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Dad Jokes Compilation</div>
                  <div style={{ fontSize: 12, color: "#666" }}>Click to watch</div>
                </div>
                <span style={{ marginLeft: "auto", fontSize: 20 }}>▶</span>
              </a>
            </Card>
            <Card>
              <Label>Search & Recommend</Label>
              <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px" }}>
                Search → AI recommends → Find on YouTube
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  value={shortsSearch}
                  onChange={(e) => setShortsSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchShortsRecommendations()}
                  placeholder="e.g. funny shorts, dad jokes..."
                  style={{ ...inputStyle, flex: 1 }}
                />
                <OrangeButton onClick={fetchShortsRecommendations} disabled={loadingShorts}>
                  {loadingShorts ? "Searching..." : "🔍 Search"}
                </OrangeButton>
              </div>
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(shortsSearch || "funny shorts")}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: "#FF6B00", textDecoration: "none" }}
              >
                Search on YouTube →
              </a>
            </Card>

            {loadingShorts && <LoadingDots />}

            {shortsRecs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
                {shortsRecs.map((r, i) => (
                  <Card key={i}>
                    <div style={{ marginBottom: 8 }}>
                      <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>
                        {r.title || r.keyword || "Recommended"}
                      </p>
                      {r.channel && (
                        <span style={{ fontSize: 12, color: "#666" }}>{r.channel}</span>
                      )}
                    </div>
                    <a
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(r.keyword || r.title || "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 16px",
                        background: "#FF0000",
                        color: "#fff",
                        borderRadius: 8,
                        textDecoration: "none",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      ▶ Search on YouTube
                    </a>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "analyze" && (
          <div>
            <Card>
              <Label>Video Analysis · Reaction Prediction</Label>
              <p style={{ fontSize: 12, color: "#666", margin: "0 0 8px" }}>
                YouTube URL → analyze from transcript/title. Or paste joke text
              </p>
              <textarea
                value={analyzeInput}
                onChange={(e) => setAnalyzeInput(e.target.value)}
                placeholder="https://youtube.com/shorts/... or joke text"
                rows={3}
                style={{
                  ...inputStyle,
                  resize: "none",
                  width: "100%",
                  boxSizing: "border-box",
                  marginBottom: 8,
                }}
              />
              <OrangeButton onClick={analyzeJoke} disabled={analyzing} style={{ width: "100%" }}>
                {analyzing ? "Analyzing... 🤔" : "Predict Reaction"}
              </OrangeButton>
            </Card>

            {analyzing && <LoadingDots />}

            {analyzeResult && (
              <Card style={{ marginTop: 16 }}>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 48 }}>{analyzeResult.emoji}</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: "#FF6B00" }}>
                    {analyzeResult.score}
                    <span style={{ fontSize: 16, color: "#666" }}>/10</span>
                  </div>
                  <StarRating score={analyzeResult.score} />
                  <p style={{ margin: "8px 0 0", color: "#ccc", fontSize: 15 }}>{analyzeResult.verdict}</p>
                </div>
                <div style={{ background: "#1A1A1A", borderRadius: 10, padding: "12px 16px" }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#888" }}>💡 {analyzeResult.tip}</p>
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === "practice" && (
          <div>
            <Card>
              <Label>Video Analysis · Reaction Simulation</Label>
              <p style={{ fontSize: 12, color: "#666", margin: "0 0 8px" }}>
                YouTube URL → predict from transcript/title. Or paste joke text
              </p>
              <textarea
                value={practiceJoke}
                onChange={(e) => setPracticeJoke(e.target.value)}
                placeholder="https://youtube.com/shorts/... or joke text"
                rows={3}
                style={{
                  ...inputStyle,
                  resize: "none",
                  width: "100%",
                  boxSizing: "border-box",
                  marginBottom: 8,
                }}
              />
              <OrangeButton onClick={practiceJokeFn} disabled={practicingLoading} style={{ width: "100%" }}>
                {practicingLoading ? "Predicting... 😅" : "Simulate Reaction"}
              </OrangeButton>
            </Card>

            {practicingLoading && <LoadingDots />}

            {practiceResult && (
              <Card style={{ marginTop: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                  {practiceResult.reactions?.map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</span>
                        <span style={{ fontSize: 13, color: "#888", marginLeft: 8 }}>{r.reaction}</span>
                      </div>
                      <span>{Array(r.hearts || 0).fill("❤️").join("")}</span>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: "1px solid #222", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: "#888" }}>Expected total hearts</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: "#FF6B00" }}>❤️ {practiceResult.totalHearts}</span>
                </div>
                <div style={{ background: "#1A1A1A", borderRadius: 10, padding: "12px 16px" }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#888" }}>💡 {practiceResult.advice}</p>
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === "board" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <p style={{ color: "#666", fontSize: 13, margin: 0 }}>This Month Top 3</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {topJoke && (
                <Card style={{ border: "1px solid rgba(255,215,0,0.3)", background: "rgba(255,215,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 24 }}>👑</span>
                      <div>
                        <div style={{ fontSize: 12, color: "#FFD700", fontWeight: 700 }}>Dad of the Month</div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{topJoke.author}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 900, color: "#FF6B00" }}>❤️ {topJoke.hearts}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: "#ccc", lineHeight: 1.5 }}>{topJoke.text}</p>
                </Card>
              )}

              {bottomJoke && bottomJoke.id !== topJoke?.id && (
                <Card style={{ border: "1px solid rgba(100,150,255,0.3)", background: "rgba(100,150,255,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 24 }}>🎖️</span>
                      <div>
                        <div style={{ fontSize: 12, color: "#6496FF", fontWeight: 700 }}>Brave Dad of the Month</div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{bottomJoke.author}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 900, color: "#6496FF" }}>❤️ {bottomJoke.hearts}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: "#ccc", lineHeight: 1.5 }}>{bottomJoke.text}</p>
                </Card>
              )}

              {mostActive.name && (
                <Card style={{ border: "1px solid rgba(100,255,150,0.3)", background: "rgba(100,255,150,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 24 }}>🫡</span>
                      <div>
                        <div style={{ fontSize: 12, color: "#64FF96", fontWeight: 700 }}>Dad Spirit Award</div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{mostActive.name}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 14, color: "#64FF96", fontWeight: 700 }}>{mostActive.count} registered</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: "#888" }}>Never missed a week 🫡</p>
                </Card>
              )}
            </div>

            <Card style={{ marginTop: 24 }}>
              <Label>Full Rankings</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sorted.map((j, i) => (
                  <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "#666", width: 20, textAlign: "center" }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.text}</p>
                      <span style={{ fontSize: 11, color: "#666" }}>{j.author}</span>
                    </div>
                    <span style={{ fontSize: 13, color: "#FF6B00", fontWeight: 700, flexShrink: 0 }}>❤️ {j.hearts}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: "#111", border: "1px solid #222", borderRadius: 16, padding: "16px", ...style }}>
      {children}
    </div>
  );
}

function Label({ children }) {
  return (
    <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>
      {children}
    </p>
  );
}

function OrangeButton({ children, onClick, disabled, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#333" : "linear-gradient(135deg, #FF6B00, #FFB300)",
        color: disabled ? "#666" : "#fff",
        border: "none",
        borderRadius: 10,
        padding: "10px 20px",
        fontWeight: 700,
        fontSize: 14,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.2s",
        boxShadow: disabled ? "none" : "0 4px 16px rgba(255,107,0,0.3)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function LoadingDots() {
  return (
    <div style={{ textAlign: "center", padding: "24px 0", color: "#666", fontSize: 13 }}>
      <span>Loading</span>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ display: "inline-block", animation: "bounce 1s infinite", animationDelay: `${i * 0.2}s`, marginLeft: 2 }}>.</span>
      ))}
      <style>{`@keyframes bounce { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }`}</style>
    </div>
  );
}

const inputStyle = {
  background: "#1A1A1A",
  border: "1px solid #333",
  borderRadius: 10,
  padding: "10px 14px",
  color: "#F0F0F0",
  fontSize: 14,
  outline: "none",
  fontFamily: "system-ui, sans-serif",
  width: "100%",
};
