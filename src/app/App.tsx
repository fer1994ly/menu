import { BrowserRouter } from 'react-router-dom';

export function App() {
  return (
    <BrowserRouter>
      <header className="bg-navy px-4 py-3 text-white">
        <h1 className="text-xl font-bold">Privee Food</h1>
      </header>
      <main className="p-4" />
    </BrowserRouter>
  );
}
