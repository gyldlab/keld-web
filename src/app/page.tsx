import Image from "next/image";
import Link from "next/link";

import { FooterBrandLockup } from "@/components/brand/footer-brand-lockup";
import { CinematicHero } from "@/components/hero/cinematic-hero";

const pillars = [
  {
    index: "01",
    name: "A native foundation.",
    detail:
      "Rust hosts the windows and native platform integration. Your interface belongs on the desktop.",
    label: "RUST HOST",
  },
  {
    index: "02",
    name: "Your language. Your logic.",
    detail: "Write application logic in JavaScript or TypeScript, with Bun in the main process.",
    label: "BUN MAIN",
  },
  {
    index: "03",
    name: "The web, at home.",
    detail:
      "Build your interface with the web. Present it through the operating system’s native webview.",
    label: "NATIVE WEBVIEWS",
  },
];

const githubRepositories = [
  {
    number: "01",
    name: "KELD",
    description: "Core framework",
    href: "https://github.com/gyldlab/keld",
  },
  {
    number: "02",
    name: "KELD Benches",
    description: "Benchmarks & measurements",
    href: "https://github.com/gyldlab/keld-benches",
  },
  {
    number: "03",
    name: "KELD Patched Apps",
    description: "Application compatibility work",
    href: "https://github.com/gyldlab/keld-patched-apps",
  },
] as const;

export default function Home() {
  // eslint-disable-next-line no-restricted-properties -- Next.js replaces this server-side build constant.
  const development = process.env.NODE_ENV === "development";
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <main id="main">
        <section className="hero-section" aria-labelledby="hero-heading">
          <CinematicHero controls={development} />
          <div className="hero-scrim" aria-hidden="true" />
          <div className="hero-content">
            <h1 id="hero-heading">
              Same Web.
              <br />A Brighter
              <br />
              Desktop.
            </h1>
            <p className="hero-description">
              KELD is a modern desktop runtime
              <br className="desktop-break" /> for the web software ecosystem.
              <br />
              Keep what you know.
              <br />
              Build beyond what’s possible.
            </p>
            <div className="hero-actions">
              <a
                className="button-primary"
                href="https://github.com/gyldlab/keld"
                target="_blank"
                rel="noopener noreferrer"
              >
                Build with KELD <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
          <div className="hero-baseline" aria-hidden="true">
            <span>RUN BEYOND LIMITS</span>
            <span>
              BUILT
              <br />
              FOR WHAT’S
              <br />
              NEXT.
            </span>
          </div>
        </section>

        <header className="site-header">
          <Link href="/" className="brand" aria-label="KELD home">
            <Image src="/brand/keld-symbol-white.svg" width={37} height={28} alt="" unoptimized />
            <span>KELD</span>
          </Link>
          <nav aria-label="Main navigation">
            <a href="#foundation">Foundation</a>
            <a href="#repositories">
              GitHub <span aria-hidden="true">↗</span>
            </a>
          </nav>
        </header>

        <section
          id="foundation"
          className="foundation-section"
          aria-labelledby="foundation-heading"
        >
          <p className="eyebrow">
            <span className="section-line" /> ENGINEERED FROM THE FOUNDATION
          </p>
          <div className="section-intro">
            <h2 id="foundation-heading">
              Power, without
              <br />
              <span>the unnecessary.</span>
            </h2>
            <p>
              The tools you know, with a different foundation beneath them. Explore the
              architecture, follow the work, and see what KELD is becoming.
            </p>
          </div>
          <div className="pillar-grid">
            {pillars.map((pillar) => (
              <article className="pillar" key={pillar.index}>
                <div className="pillar-top">
                  <span>{pillar.index}</span>
                  <span>{pillar.label}</span>
                </div>
                <h3>{pillar.name}</h3>
                <p>{pillar.detail}</p>
              </article>
            ))}
          </div>
          <div className="source-callout" id="repositories">
            <div className="source-intro">
              <span className="eyebrow">BUILT IN THE OPEN</span>
              <h3>
                Go beyond
                <br />
                the surface.
              </h3>
              <p>Explore the framework, the measurements, and the application work behind KELD.</p>
            </div>
            <nav className="repository-links" aria-label="KELD GitHub repositories">
              {githubRepositories.map((repository) => (
                <a
                  className="repository-link"
                  key={repository.href}
                  href={repository.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${repository.name} on GitHub — ${repository.description}`}
                >
                  <span className="repository-index">{repository.number}</span>
                  <span className="repository-text">
                    <strong>{repository.name}</strong>
                    <span>{repository.description}</span>
                  </span>
                  <span className="repository-arrow" aria-hidden="true">
                    ↗
                  </span>
                </a>
              ))}
            </nav>
          </div>
        </section>
      </main>
      <footer aria-label="Engineered and designed by GYLDLAB">
        <FooterBrandLockup />
        {development && (
          <nav
            aria-label="Development tools"
            className="mx-6 flex justify-end border-t border-white/10 py-6 min-[901px]:mx-14"
          >
            <Link
              href="/lab/motion"
              className="inline-flex min-h-11 items-center gap-3 text-[10px] font-semibold tracking-[0.16em] text-[#a8c4d5] uppercase hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c6e8ff]"
            >
              Scene Lab <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        )}
      </footer>
    </div>
  );
}
