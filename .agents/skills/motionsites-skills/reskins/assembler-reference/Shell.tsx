import { Link, Outlet } from 'react-router-dom';

// Shared brand shell — the single nav/chrome every page-body mounts inside (the Philosophy fix,
// generalized). Built from brand :root tokens, so it stays coherent across heterogeneous bodies.
export default function Shell() {
  const pill: React.CSSProperties = { background: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' };
  return (
    <div className="relative min-h-screen" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      <header className="fixed top-5 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2">
        <Link to="/" className="h-11 px-5 flex items-center rounded-[14px]" style={pill}>
          <span className="font-serif text-lg" style={{ color: 'var(--fg)' }}>Thoughtseed</span>
        </Link>
        <nav className="h-11 px-5 flex items-center gap-5 rounded-[14px] font-sans text-sm" style={pill}>
          <Link to="/" className="opacity-80 hover:opacity-100 transition-opacity">Home</Link>
          <Link to="/manifesto" className="opacity-80 hover:opacity-100 transition-opacity">Manifesto</Link>
          <Link to="/" style={{ color: 'var(--accent)' }} className="font-medium">Enter the system →</Link>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
