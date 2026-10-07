import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f5f6fa', color: '#14123b' }}>
      <section style={{ maxWidth: 480, textAlign: 'center' }}>
        <p>404</p>
        <h1>Page not found</h1>
        <p>This address does not exist. Check the URL or choose a page below.</p>
        <nav aria-label="Available pages" style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 24 }}>
          <Link to="/">Voting</Link>
          <Link to="/admin">Admin console</Link>
          <Link to="/display">Live results</Link>
        </nav>
      </section>
    </main>
  );
}
