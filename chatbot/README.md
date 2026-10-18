<div align="center">

# Krishi Sahayak

### AI Agriculture Assistant for Indian Farmers

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.1-000000?style=flat-square&logo=flask&logoColor=white)](https://flask.palletsprojects.com)
[![OpenAI](https://img.shields.io/badge/OpenAI-LLM-412991?style=flat-square&logo=openai&logoColor=white)](https://platform.openai.com)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](LICENSE)
[![Deploy](https://img.shields.io/badge/Deploy-Render-41E065?style=flat-square&logo=render&logoColor=white)](https://llm-agri-bot.onrender.com)
[![uv](https://img.shields.io/badge/uv-Package_Manager-DE5FE9?style=flat-square&logo=uv&logoColor=white)](https://docs.astral.sh/uv/)

**Live Demo → [llm-agri-bot.onrender.com](https://llm-agri-bot.onrender.com)**

An AI-powered agriculture chatbot that helps Indian farmers with crop advice, pest control, soil health, weather, and government schemes — using text, voice, and image analysis.

<br/>

![Krishi Sahayak — Web Interface](Sample_image/chat-interface.png)

</div>

---

## Features

| Feature | Description |
|---------|-------------|
| Text Chat | Ask any agriculture question and get expert answers |
| Image Diagnosis | Upload a crop photo → AI identifies diseases, pests & deficiencies |
| Voice Input | Speak in English, Hindi, or Hinglish via OpenAI Whisper |
| Voice Output | Bot reads answers aloud using OpenAI TTS |
| Conversation Memory | Remembers your chat context (Redis, with in-memory fallback) |
| Prompt Caching | 50% cost savings — cached prefixes across requests |
| Dark/Light Theme | Glassmorphism UI with one-click theme toggle |
| Multilingual | Responds in English, Hindi, or Hinglish |

![Krishi Sahayak — Voice Chat on Mobile](Sample_image/chat-2.png)

---

## Tech Stack

<table>
<tr>
<td><strong>Backend</strong></td>
<td>Python 3.11+, Flask, OpenAI SDK</td>
</tr>
<tr>
<td><strong>Frontend</strong></td>
<td>HTML5, CSS3 (Glassmorphism), jQuery</td>
</tr>
<tr>
<td><strong>LLM</strong></td>
<td><code>gpt-4o-mini</code> (text + vision, configurable)</td>
</tr>
<tr>
<td><strong>Speech</strong></td>
<td>OpenAI Whisper <code>whisper-1</code> (STT), OpenAI <code>gpt-4o-mini-tts</code> (TTS)</td>
</tr>
<tr>
<td><strong>Memory</strong></td>
<td>Redis (with automatic in-memory fallback)</td>
</tr>
<tr>
<td><strong>Deploy</strong></td>
<td>Render, Docker, Gunicorn</td>
</tr>
</table>

---

## Quick Start

### Prerequisites

- **Python 3.11+**
- **[uv](https://docs.astral.sh/uv/getting-started/installation/)** package manager
- **[OpenAI API key](https://platform.openai.com/api-keys)** (with billing enabled — Whisper/TTS/vision are paid endpoints)

### 1. Clone & Install

```bash
git clone https://github.com/mohammed97ashraf/LLM_Agri_Bot.git
cd LLM_Agri_Bot
uv sync
```

### 2. Configure

```bash
cp .env.example LLM_Agri_Bot/.env
```

Edit `LLM_Agri_Bot/.env` and add your OpenAI API key:

```env
OPENAI_API_KEY=sk-your_key_here
```

### 3. Run

```bash
uv run python LLM_Agri_Bot/run.py
```

Open **[http://127.0.0.1:5000](http://127.0.0.1:5000)**

---

## Environment Variables

Copy `.env.example` to `LLM_Agri_Bot/.env` and configure:

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | Your OpenAI API key ([get one](https://platform.openai.com/api-keys)) |
| `LLM_MODEL` | No | `gpt-4o-mini` | Text LLM model |
| `LLM_VISION_MODEL` | No | `gpt-4o-mini` | Vision LLM model (any multimodal OpenAI model) |
| `LLM_TEMPERATURE` | No | `0.3` | Model temperature (0–2) |
| `LLM_MAX_TOKENS` | No | `1024` | Max response tokens |
| `STT_MODEL` | No | `whisper-1` | Speech-to-text model (`whisper-1`, `gpt-4o-mini-transcribe`, ...) |
| `TTS_MODEL` | No | `gpt-4o-mini-tts` | Text-to-speech model (`tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`) |
| `VOICE` | No | `alloy` | TTS voice (`alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage`, `shimmer`, `verse`, `marin`, `cedar`) |
| `REDIS_HOST` | No | `localhost` | Redis host (optional — falls back to memory) |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_SSL` | No | `false` | Enable Redis SSL |
| `FLASK_SECRET_KEY` | Yes* | `dev-secret-key` | Flask session secret (*required in production) |
| `FLASK_DEBUG` | No | `true` | Enable debug mode |

---

## Project Structure

```
LLM_Agri_Bot/
├── app/
│   ├── __init__.py             # App factory (create_app)
│   ├── config.py               # Environment-based configuration
│   ├── routes/
│   │   ├── main.py             # Index page, robots.txt, sitemap, llms.txt
│   │   └── chat.py             # Chat API (text, voice, image)
│   ├── services/
│   │   ├── llm_service.py      # OpenAI LLM + vision + prompt caching
│   │   ├── memory_service.py   # Redis + in-memory fallback
│   │   ├── stt_service.py      # OpenAI Whisper STT
│   │   ├── tts_service.py      # OpenAI TTS
│   │   └── prompt_manager.py   # XML + CoT system prompt
│   ├── static/
│   │   ├── css/style.css       # Glassmorphism UI (dark/light)
│   │   ├── js/chat.js          # Chat logic, image upload, voice
│   │   └── images/             # Favicon
│   └── templates/
│       └── index.html          # Main template (SEO + JSON-LD)
├── Sample_image/               # Screenshots for README
├── llms.txt                    # AI crawler disclosure
├── .env.example                # Environment template
├── gunicorn.conf.py            # Production Gunicorn config
├── Dockerfile                  # Docker deployment
├── render.yaml                 # Render blueprint
├── run.py                      # Dev entry point
├── pyproject.toml              # uv / project config
└── requirements.txt            # pip fallback
```

---

## Deployment

### Render (Recommended)

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → **New** → **Web Service**
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` and `Dockerfile`
5. Add your `OPENAI_API_KEY` (and other env vars) in the Render dashboard
6. Click **Deploy**

### Docker

```bash
docker build -t krishi-sahayak .
docker run -p 10000:10000 --env-file LLM_Agri_Bot/.env krishi-sahayak
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Chat interface |
| `POST` | `/chat` | Send text, image, or audio — returns AI response |
| `POST` | `/chat/clear` | Clear conversation history |
| `GET` | `/health` | Health check (Redis status) |
| `GET` | `/robots.txt` | Search engine crawl rules |
| `GET` | `/sitemap.xml` | XML sitemap |
| `GET` | `/llms.txt` | AI crawler disclosure |
| `GET` | `/.well-known/llms.txt` | AI crawler disclosure (well-known path) |

---

## How It Works

```
User sends message (text / image / voice)
        │
        ▼
┌─────────────────────────────────────────┐
│  Flask Backend                          │
│  ├── Text? → OpenAI LLM (gpt-4o-mini)  │
│  ├── Image? → OpenAI vision (gpt-4o-mini)│
│  └── Voice? → Whisper STT → LLM → TTS  │
│                                         │
│  Memory: Redis (or in-memory fallback)  │
│  Cache:  OpenAI automatic prompt caching│
└─────────────────────────────────────────┘
        │
        ▼
Response with text + optional voice audio
```

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
git checkout -b feature/your-feature
uv sync
# make changes
git commit -m "Add your feature"
git push origin feature/your-feature
```

---

## License

MIT License — see [LICENSE](LICENSE)

---

<div align="center">

**Built with care for Indian farmers**

By [Mohammed Ashraf](https://www.linkedin.com/in/mohammed97ashraf) · [GitHub](https://github.com/mohammed97ashraf) · [LinkedIn](https://www.linkedin.com/in/mohammed97ashraf)

</div>