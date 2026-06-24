# NL2App Compiler: Natural Language to App Config Compiler

NL2App Compiler is a multi-stage visual AI compiler pipeline that translates natural language prompts into fully validated, structured, and executable application configurations (consisting of database schemas, API endpoints, page views, and authorization rules).

The project features a sleek, developer-oriented **Tech-Nordic IDE theme** frontend (React/Vite) and an asynchronous **FastAPI backend** powered by Gemini.

---

## 🚀 Key Features

* **Multi-Stage AI Pipeline**: 
  - **Intent Mapping**: Parses prompts into core entities, access roles, and premium configurations.
  - **Layout Design**: Automatically mocks routes and visual page flows.
  - **Schema Synthesis**: Generates strict relational database tables and REST API endpoints.
  - **Layer Verification & Self-Repair**: Performs cross-layer checks (e.g. database schema matching API fields) and auto-repairs validation errors.
  - **Runtime Assembly**: Packs structural models into a single deployment configuration.
* **Interactive IDE Workspace**:
  - **Dual-Column Prompt Editor**: Prompt textarea with markdown tags and compiler logs.
  - **IDE Project Explorer Tree**: Interactive tree listing generated SQL databases, Javascript endpoints, and React views.
  - **Simulated Browser Sandbox**: Interactive dashboard preview with live route triggers.
* **Responsive Layouts**: Desktop, Tablet, and a **dedicated Mobile UX preview** featuring custom headers, bottom tab navigation bars, and slide drawer navigation.
* **App Persistence**: Side navigation displaying built apps with inline confirmation deletion (`Delete? ✓ ✕`) and factory reset restoration (`Restore defaults? ✓ ✕`), backed by `localStorage`.
* **Project Export**: Streams compile packages as fully structured, in-memory generated ZIP files containing database schemas (`database/*.sql`), route controllers (`endpoints/*.js`), and view pages (`views/*.jsx`).

---

## 🛠️ Technology Stack

* **Backend**:
  - Python 3.10+
  - FastAPI (Asynchronous REST API + SSE Event Streams)
  - Uvicorn (ASGI server)
  - Pydantic v2 (Schema validation)
  - Google Generative AI (`gemini-3.1-flash-lite` / `gemini-1.5-flash`)
  - Zipfile (In-memory buffer packaging)
* **Frontend**:
  - React (SPA)
  - Vite (Build tool)
  - Vanilla CSS (Glassmorphic variables, dark-slate IDE grids, responsive layouts)

---

## 📁 Repository Structure

```text
nl2app-compiler/
├── backend/
│   ├── app/
│   │   ├── core/         # Logger, settings, Gemini client wrappers
│   │   ├── eval/         # Evaluation harness scripts
│   │   ├── pipeline/     # Multi-stage compiler logic (intent, design, schemas, repair)
│   │   ├── runtime/      # Sandbox assembly simulator
│   │   ├── validation/   # Cross-layer verification checks
│   │   └── main.py       # FastAPI application endpoints
│   ├── .env              # Environment config (API keys)
│   ├── requirements.txt  # Python packages
│   └── test_pipeline.py  # Local end-to-end integration test
├── frontend/
│   ├── src/
│   │   ├── components/   # IDE panels, Browser Preview, Eval Dashboard
│   │   ├── App.jsx       # Main layout and app list container
│   │   ├── index.css     # Styling sheet (Tech-Nordic tokens)
│   │   └── mockData.js   # Mock presets (NexusCRM, KDS, E-Shop API)
│   ├── vite.config.js    # Dev proxy config
│   └── package.json      # NPM packages
└── README.md             # Project documentation
```

---

## ⚙️ Setup & Installation

### 1. Backend Setup

1. Navigate to the `backend/` folder:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file based on `.env.example` and insert your Gemini API Key:
   ```env
   GEMINI_API_KEY=your-gemini-api-key-here
   GEMINI_MODEL=gemini-3.1-flash-lite
   PIPELINE_MODE=balanced
   LOG_LEVEL=INFO
   FRONTEND_URL=http://localhost:5173
   ```
5. Start the FastAPI development server:
   ```bash
   python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

### 2. Frontend Setup

1. Navigate to the `frontend/` folder:
   ```bash
   cd ../frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:5173/`.

---

## 🧪 Verification & Testing

### End-to-End Pipeline Test
You can test the compiler backend execution pipeline locally outside the web UI by running:
```bash
cd backend
python test_pipeline.py
```
This will compile a task manager configuration, simulate the database tables, and print the runtime performance metrics directly to your terminal.
