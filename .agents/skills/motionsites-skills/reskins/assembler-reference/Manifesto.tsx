// A second page-body — a different "template/section" stacked under the same shell + brand skin.
export default function Manifesto() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-8 text-center" style={{ background: 'var(--bg)' }}>
      <p className="font-sans text-xs uppercase tracking-[0.32em] mb-7" style={{ color: 'var(--accent)' }}>Thoughtseed — Manifesto</p>
      <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl leading-[0.98] max-w-4xl" style={{ color: 'var(--fg)' }}>
        Systems that think in centuries, not quarters.
      </h1>
      <p className="font-sans text-lg md:text-xl mt-10 max-w-xl" style={{ color: 'var(--fg)', opacity: 0.62 }}>
        At the edge of intelligence, ecology, and craft — every product a seed for what comes next.
      </p>
    </section>
  );
}
