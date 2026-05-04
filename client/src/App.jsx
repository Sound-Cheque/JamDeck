export function App() {
  return (
    <div className="app">
      <header className="top-bar">
        <h1>Jam Deck</h1>
      </header>
      <main className="layout">
        <aside className="deck-panel" aria-label="Decks" />
        <aside className="slide-panel" aria-label="Slides" />
        <section className="main-panel" aria-label="Slide editor" />
      </main>
    </div>
  );
}
