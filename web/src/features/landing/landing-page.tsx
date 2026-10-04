import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../landing.css';

const FAQ: [string, string][] = [
  [
    'Is ActionBridge a dentist or an insurer?',
    'No. ActionBridge doesn’t provide dental care or insurance coverage. It helps you understand the estimate and benefits information you already have.',
  ],
  [
    'Are the numbers guaranteed?',
    'No. Every figure is an estimate. Your dentist and insurer determine final treatment and costs.',
  ],
  [
    'What should I bring?',
    'A treatment estimate, a benefits summary or statement, or simply what you remember about your treatment. You can add more later.',
  ],
  [
    'Can I come back to a plan later?',
    'Yes. Save a plan, return to it, and review its history whenever you sign in.',
  ],
];

const GET_STARTED = '/sign-in?mode=create';
const HERO_ALT =
  'White tooth model beside a dental mirror and probe on a bright clinical surface';

function Brand() {
  return (
    <>
      <span className="lp-brand-name">ActionBridge</span>
      <span className="lp-brand-rule" />
      <span className="lp-brand-sub">Dental</span>
    </>
  );
}

function Arrow() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#146B4D"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Check() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#5FD39A"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

const STARTS = [
  {
    title: 'Speak',
    detail: 'Describe your treatment in your own words',
    icon: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
      </>
    ),
  },
  {
    title: 'Upload document',
    detail: 'An estimate, statement, or benefits PDF',
    icon: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M12 17v-6M9.5 13.5L12 11l2.5 2.5" />
      </>
    ),
  },
  {
    title: 'Take photo',
    detail: 'Capture a paper estimate or statement',
    icon: (
      <>
        <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
  },
  {
    title: 'Type details',
    detail: 'Enter what you already know',
    icon: <path d="M4 6h16M4 12h10M4 18h7M18 15v6" />,
  },
];

const SOURCES = [
  {
    label: 'FROM YOUR DOCUMENTS',
    swatch: 'lp-swatch-doc',
    text: 'Information extracted from the documents you provide.',
    example: 'e.g. Annual maximum — Benefits, p.2',
  },
  {
    label: 'PROVIDED BY YOU',
    swatch: 'lp-swatch-you',
    text: 'Details you entered or confirmed yourself.',
    example: 'e.g. Deductible already met',
  },
  {
    label: 'ASSUMED FOR COMPARISON',
    swatch: 'lp-swatch-assumed',
    text: 'Information used only to help model an estimated scenario.',
    example: 'e.g. Next year’s fee unchanged',
  },
];

/** Public landing page (design: ActionBridge Landing v2). */
export function LandingPage() {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [faq, setFaq] = useState(0);

  useEffect(() => {
    document.title = 'ActionBridge Dental — Dental cost clarity';
  }, []);

  // Solid header after scrolling; gentle parallax on the phone screenshots.
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const parallax = () => {
      frame = 0;
      const vh = window.innerHeight;
      document
        .querySelectorAll<HTMLElement>('.lp [data-parallax]')
        .forEach((el) => {
          const amount = Number(el.dataset.parallax) || 8;
          const box = el.parentElement!.getBoundingClientRect();
          const p = Math.max(
            -1,
            Math.min(1, (box.top + box.height / 2 - vh / 2) / vh),
          );
          el.style.transform = `translateY(${(p * amount).toFixed(1)}px)`;
        });
    };
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      if (!reduce && !frame) frame = requestAnimationFrame(parallax);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Sections below the fold fade up as they enter the viewport.
  useEffect(() => {
    if (
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    )
      return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }),
      { rootMargin: '0px 0px -8% 0px' },
    );
    document.querySelectorAll('.lp [data-reveal]').forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      el.classList.add('is-hidden');
      observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const closeMenu = () => setMenu(false);

  return (
    <div className="lp">
      <header className={`lp-header${scrolled || menu ? ' is-solid' : ''}`}>
        <div className="lp-header-bar">
          <a
            href="#top"
            className="lp-brand"
            aria-label="ActionBridge Dental home"
          >
            <Brand />
          </a>
          <nav className="lp-nav" aria-label="Primary">
            <div className="lp-nav-links">
              <a href="#how" className="lp-nav-link">
                How it works
              </a>
              <a href="#product" className="lp-nav-link">
                Product
              </a>
              <a href="#privacy" className="lp-nav-link">
                Privacy
              </a>
              <a href="#faq" className="lp-nav-link">
                FAQ
              </a>
            </div>
            <span className="lp-nav-rule" />
            <div className="lp-nav-actions">
              <Link to="/sign-in" className="lp-nav-link">
                Sign in
              </Link>
              <Link to={GET_STARTED} className="lp-btn lp-btn-sm">
                Get started
              </Link>
            </div>
          </nav>
          <div className="lp-nav-compact">
            <Link to={GET_STARTED} className="lp-btn lp-btn-sm lp-btn-compact">
              Get started
            </Link>
            <button
              type="button"
              className="lp-menu-button"
              onClick={() => setMenu((open) => !open)}
              aria-expanded={menu}
              aria-controls="mobile-menu"
              aria-label={menu ? 'Close menu' : 'Open menu'}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d={menu ? 'M6 6l12 12M18 6L6 18' : 'M4 8h16M4 16h16'} />
              </svg>
            </button>
          </div>
        </div>
        {menu && (
          <nav id="mobile-menu" className="lp-mobile-menu" aria-label="Mobile">
            <a href="#how" onClick={closeMenu}>
              How it works
            </a>
            <a href="#product" onClick={closeMenu}>
              Product
            </a>
            <a href="#privacy" onClick={closeMenu}>
              Privacy
            </a>
            <a href="#faq" onClick={closeMenu}>
              FAQ
            </a>
            <Link to="/sign-in" className="lp-mobile-signin">
              Sign in
            </Link>
          </nav>
        )}
      </header>

      <main id="top">
        <section className="lp-hero" aria-labelledby="hero-h">
          <div className="lp-hero-media">
            <img src="/assets/welcome.jpg" alt={HERO_ALT} />
          </div>
          <div className="lp-hero-shade" aria-hidden="true" />
          <div className="lp-hero-inner">
            <div className="lp-hero-text">
              <div className="lp-eyebrow">DENTAL COST CLARITY</div>
              <h1 id="hero-h" className="lp-hero-title">
                Turn a confusing dental estimate into a clear plan.
              </h1>
              <p className="lp-hero-lead">
                Understand your treatment estimate, see how your benefits may
                apply, and compare your next steps with greater clarity.
              </p>
              <div className="lp-hero-cta lp-only-full">
                <Link to={GET_STARTED} className="lp-btn lp-btn-lg">
                  Get started
                </Link>
                <a href="#how" className="lp-link-arrow">
                  See how it works<span aria-hidden="true">→</span>
                </a>
              </div>
              <p className="lp-hero-note lp-only-full">
                Estimates only. Your dentist and insurer determine final
                treatment and costs.
              </p>
            </div>
            <div className="lp-hero-stacked lp-below-full">
              <div className="lp-hero-cta">
                <Link to={GET_STARTED} className="lp-btn lp-btn-lg">
                  Get started
                </Link>
                <a href="#how" className="lp-link-arrow">
                  See how it works<span aria-hidden="true">→</span>
                </a>
              </div>
              <p className="lp-hero-note-stacked">
                Estimates only. Your dentist and insurer determine final
                treatment and costs.
              </p>
            </div>
          </div>
          <a
            href="#idea"
            className="lp-scroll lp-only-full"
            aria-label="Scroll to next section"
          >
            SCROLL
            <svg
              width="12"
              height="20"
              viewBox="0 0 12 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 1v17M1.5 13.5L6 18l4.5-4.5" />
            </svg>
          </a>
        </section>

        <section id="idea" className="lp-section lp-white lp-anchor">
          <div className="lp-wrap lp-grid lp-gap-32">
            <div className="lp-label lp-idea-label c-1-4">01 — The idea</div>
            <div data-reveal className="c-4-13">
              <p className="lp-statement">
                Dental paperwork gives you numbers.{' '}
                <span>
                  ActionBridge helps you understand what they mean together.
                </span>
              </p>
            </div>
            <div data-reveal className="lp-statement-body c-7-13">
              <p className="lp-body lp-body-flush lp-max-520">
                Bring the treatment information you know, an estimate, or your
                benefits information. ActionBridge organizes the important
                details before presenting estimated options.
              </p>
            </div>
          </div>
        </section>

        <section id="product" className="lp-section lp-paper lp-anchor lp-clip">
          <div className="lp-wrap lp-grid lp-gap-56 lp-align-center">
            <div data-reveal className="lp-stack c-1-6">
              <div className="lp-label">02 — The product</div>
              <h2 className="lp-h2">Everything important, in one place.</h2>
              <p className="lp-body lp-max-440">
                Review treatment details, benefits, estimated costs, timing, and
                the information behind your plan without jumping between
                documents.
              </p>
              <div className="lp-facts">
                <div>
                  <span>Your plan</span>
                  <span>Estimated options by timing</span>
                </div>
                <div>
                  <span>Review</span>
                  <span>Facts confirmed before calculating</span>
                </div>
                <div>
                  <span>History</span>
                  <span>Saved plans to return to</span>
                </div>
              </div>
            </div>
            <div className="c-7-13">
              <div className="lp-phones">
                <div className="lp-phone-left" data-parallax="14">
                  <img
                    src="/assets/landing/s2.jpg"
                    alt="ActionBridge recording screen: Tell us about your treatment"
                  />
                </div>
                <div className="lp-phone-right" data-parallax="10">
                  <img
                    src="/assets/landing/s3.jpg"
                    alt="ActionBridge photo check screen flagging a blurry estimate photo"
                  />
                </div>
                <div className="lp-phone-center">
                  <img
                    src="/assets/landing/s5.jpg"
                    alt="ActionBridge home screen: Let's make sense of your dental costs"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="lp-section lp-white lp-anchor">
          <div className="lp-wrap lp-grid lp-gap-64">
            <div data-reveal className="lp-stack c-1-8">
              <div className="lp-label">03 — How it works</div>
              <h2 className="lp-h2">Three steps from paperwork to a plan.</h2>
            </div>
            <ol data-reveal className="lp-steps c-all">
              <li>
                <span className="lp-step-number">01</span>
                <h3>Bring what you have</h3>
                <p>
                  Speak, type, upload an estimate, or photograph a document.
                </p>
              </li>
              <li>
                <span className="lp-step-number">02</span>
                <h3>Review the details</h3>
                <p>
                  Check treatment information, benefits, and anything that still
                  needs confirmation.
                </p>
              </li>
              <li>
                <span className="lp-step-number">03</span>
                <h3>Understand your options</h3>
                <p>
                  Compare estimated costs and timing before saving your plan.
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section className="lp-section lp-paper">
          <div className="lp-wrap lp-grid lp-gap-48 lp-align-start">
            <div data-reveal className="lp-stack lp-sticky c-1-6">
              <div className="lp-label">04 — Getting started</div>
              <h2 className="lp-h2">Start with whatever you have.</h2>
              <p className="lp-body lp-max-420">
                Whether the details are in your head, on paper, or inside a PDF,
                there’s a simple place to begin.
              </p>
            </div>
            <div data-reveal className="c-7-13">
              <div className="lp-starts">
                {STARTS.map((start) => (
                  <Link key={start.title} to={GET_STARTED} className="lp-start">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {start.icon}
                    </svg>
                    <span className="lp-start-text">
                      <span className="lp-start-title">{start.title}</span>
                      <span className="lp-start-detail">{start.detail}</span>
                    </span>
                    <Arrow />
                  </Link>
                ))}
              </div>
              <p className="lp-starts-note">
                Documents are for estimates, statements, and benefits
                information—not photos of your teeth.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-section lp-white lp-clip">
          <div className="lp-wrap lp-grid lp-gap-64 lp-align-center">
            <div className="lp-numbers-media c-1-6">
              <div className="lp-phone-solo" data-parallax="10">
                <img
                  src="/assets/landing/s1.jpg"
                  alt="ActionBridge screen calculating estimated costs step by step"
                />
              </div>
              <span className="lp-caption">Sample data · Estimates only</span>
            </div>
            <div data-reveal className="lp-stack c-7-13">
              <div className="lp-label">05 — Your estimate</div>
              <h2 className="lp-h2">
                See the numbers with the context behind them.
              </h2>
              <p className="lp-body lp-max-480">
                Each estimate is shown alongside the benefits, timing, and
                sources that shaped it—so a number never stands on its own.
              </p>
              <dl className="lp-terms">
                <div>
                  <dt>Estimated out-of-pocket</dt>
                  <dd>What you may pay for each option</dd>
                </div>
                <div>
                  <dt>Plan contribution</dt>
                  <dd>What your benefits may cover</dd>
                </div>
                <div>
                  <dt>Benefits remaining</dt>
                  <dd>What’s left of your annual maximum</dd>
                </div>
                <div>
                  <dt>Treatment timing</dt>
                  <dd>How plan-year timing changes costs</dd>
                </div>
                <div>
                  <dt>Sources</dt>
                  <dd>Where each important figure came from</dd>
                </div>
                <div>
                  <dt>What could change</dt>
                  <dd>Open questions that may move the estimate</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="lp-section lp-paper">
          <div className="lp-wrap lp-grid lp-gap-64">
            <div data-reveal className="lp-stack c-1-8">
              <div className="lp-label">06 — Transparency</div>
              <h2 className="lp-h2">Know where the information came from.</h2>
            </div>
            <div data-reveal className="lp-sources c-all">
              {SOURCES.map((source) => (
                <div key={source.label} className="lp-grid lp-source">
                  <div className="lp-source-label c-1-5">
                    <span className={`lp-swatch ${source.swatch}`} />
                    {source.label}
                  </div>
                  <p className="lp-source-text c-5-10">{source.text}</p>
                  <span className="lp-source-example c-10-13">
                    {source.example}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="privacy" className="lp-section lp-ink lp-anchor">
          <div className="lp-wrap lp-grid lp-gap-40 lp-align-end">
            <div data-reveal className="lp-stack c-1-8">
              <div className="lp-label lp-label-inverse">07 — Privacy</div>
              <h2 className="lp-h2 lp-h2-privacy">
                Your information stays under your control.
              </h2>
            </div>
            <p data-reveal className="lp-privacy-text c-9-13">
              Your documents and answers help build your plan. ActionBridge does
              not automatically send them to your dentist, insurer, or employer.
            </p>
            <div data-reveal className="lp-privacy-points c-all">
              <div>
                <Check />
                <span>You review before calculation</span>
              </div>
              <div>
                <Check />
                <span>You decide what gets saved</span>
              </div>
              <div>
                <Check />
                <span>You control what gets shared</span>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="lp-section lp-paper lp-anchor lp-faq">
          <div className="lp-wrap lp-grid lp-gap-40 lp-align-start">
            <div data-reveal className="lp-stack c-1-5">
              <div className="lp-label">08 — Questions</div>
              <h2 className="lp-h2 lp-h2-faq">Good to know.</h2>
            </div>
            <div data-reveal className="lp-faq-list c-5-13">
              {FAQ.map(([question, answer], index) => {
                const open = faq === index;
                return (
                  <div key={question} className="lp-faq-item">
                    <button
                      type="button"
                      className="lp-faq-question"
                      aria-expanded={open}
                      aria-controls={`faq-${index}`}
                      onClick={() => setFaq(open ? -1 : index)}
                    >
                      <span>{question}</span>
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d={open ? 'M5 12h14' : 'M12 5v14M5 12h14'} />
                      </svg>
                    </button>
                    {open && (
                      <p id={`faq-${index}`} className="lp-faq-answer">
                        {answer}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="lp-closing">
          <div data-reveal className="lp-wrap lp-stack">
            <h2 className="lp-closing-title">
              Dental costs are complicated.{' '}
              <span>Your next step shouldn’t be.</span>
            </h2>
            <div className="lp-closing-row">
              <p>Bring what you know and build a clearer plan.</p>
              <div className="lp-closing-actions">
                <Link to={GET_STARTED} className="lp-btn lp-btn-lg lp-btn-wide">
                  Get started
                </Link>
                <Link to="/sign-in" className="lp-btn-outline">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer-top">
            <div className="lp-footer-about">
              <div className="lp-footer-brand">
                <Brand />
              </div>
              <p>
                Clearer dental cost planning, built around the information you
                already have.
              </p>
            </div>
            <nav aria-label="Footer" className="lp-footer-nav">
              <a href="#how">How it works</a>
              <a href="#privacy">Privacy</a>
              <a href="#faq">Help</a>
              <Link to="/sign-in">Sign in</Link>
            </nav>
          </div>
          <div className="lp-footer-bottom">
            <span>© 2026 ActionBridge</span>
            <span>
              Estimates only. Your dentist and insurer determine final treatment
              and costs.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
