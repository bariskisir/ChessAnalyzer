# Chess Analyzer

![Chess Analyzer Screenshot](public/screenshot.png)

Chess Analyzer is a modern TypeScript React chess analysis tool powered by Stockfish. It provides deep move evaluations, saved sessions, hover previews, and a polished analysis workflow for serious chess study.

## Features

- **Deep Engine Evaluation**: Powered by Stockfish 17 via the chess-api.com
- **Move History & Sessions**: Robust session management to save and review your games.
- **Hover Peek**: Instantly preview positions in the engine lines by hovering over moves.
- **Interactive Board**: High-quality chess board with custom pieces and smooth animations.
- **Live Evaluation Bar**: Visual feedback on the current position's balance.
- **Resilient API**: Built-in retry logic, exponential backoff, and usage limit handling.

## Live Demo

<a href="https://chess-analyzer-white.vercel.app/" target="_blank">Visit the Live Demo</a>


## Getting Started

### Prerequisites

- Node.js (v16.x or later)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/bariskisir/ChessAnalyzer.git
   ```

2. Navigate to the project directory:
   ```bash
   cd ChessAnalyzer
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally

To start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

### Building for Production

To create a production build:

```bash
npm run build
```

## Technologies Used

- **React + TypeScript**: Typed frontend application architecture.
- **chess.js**: Move validation and game logic.
- **react-chessboard**: Interactive chess board component.
- **Lucide React**: Premium iconography.
- **Vite**: Ultra-fast build tool.
- **ESLint**: Static analysis for TypeScript and React code.


## License

This project is licensed under the MIT License - see the <a href="LICENSE" target="_blank">LICENSE</a> file for details.
