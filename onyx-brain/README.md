# OnyxBrain | Local Setup & Integration

OnyxBrain is a specialized utility designed to bridge the gap between your conversation history ("The Brain") and your active development in the Onyx.mx application.

## 🚀 Getting Started

### 1. Extract Data & Launch
Run the miner script from the root of your repository:
```bash
node onyx-brain/miner.cjs
```
This will:
- Scan `c:/Users/ramse/.gemini/antigravity/brain`.
- Extract granular keywords from binary Protobuf logs.
- **Auto-Launch**: Starts a local server at `http://localhost:3000`.

### 2. Manual Launch (Optional)
If you prefer not to use the server, open `onyx-brain/OnyxBrain_Viewer.html` directly in a browser that allows local file access.

## 🧠 Core Features
- **3D Proximity Map**: Visualizes the relationship between coding sessions, technical artifacts, and visual media.
- **Knowledge Inspector**: Click any node to see its high-level summary, status, and last modified date.
- **Context Prompt Generator**: Use the generator tool in the sidebar to create specialized JSON prompts. These are designed to be pasted into new AI sessions to provide the agent with deep context of past work.

## 🛠 Integration with Onyx.mx
OnyxBrain is designed to be linked to your dev environment. You can use the generated JSON context to:
1. Restore complex state from long-dormant features.
2. Cross-reference UI screenshots with implementation plans.
3. Audit the evolution of specific modules (e.g., Logistics, Inventory).

---
*Created for the Onyx.mx Application Suite*
