import {
  ArrowRightIcon,
  CodeIcon,
  FileTextIcon,
  GitBranchIcon,
  InfoIcon,
  UsersIcon,
} from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import styles from "./landing-page.module.css";

function StartPlan() {
  return (
    <Button size="xl" className={styles.action} render={<a href="/login" />}>
      Start a plan <ArrowRightIcon aria-hidden="true" />
    </Button>
  );
}

function WorkspacePreview() {
  return (
    <figure className={styles.previewFigure}>
      <picture>
        <source
          media="(max-width: 650px)"
          srcSet="/product/workspace-mobile.webp"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.productScreenshot}
          src="/product/workspace-desktop.webp"
          width="1440"
          height="900"
          alt="Search architecture in the rocky.systems workspace, with the published plan alongside the team's discussion."
          fetchPriority="high"
        />
      </picture>
    </figure>
  );
}

function ReviewPreview() {
  return (
    <figure className={styles.reviewFigure}>
      <div className={styles.reviewCard}>
        <div className={styles.reviewHeader}>
          <h3>PR #42 · Add semantic search</h3>
          <span className={styles.conflict}>Conflicts with plan</span>
        </div>
        <div className={styles.reviewVersion}>
          <GitBranchIcon aria-hidden="true" />
          <span>
            Reviewed against <strong>Search architecture · v1</strong>
            <br />
            PR revision <code>8f3c2a1</code>
          </span>
        </div>
        <h4>Plan conflict</h4>
        <p>
          This change sends incident content to an external service, which
          conflicts with the agreed data handling policy.
        </p>
        <h4 className={styles.evidenceLabel}>Cited from plan</h4>
        <blockquote>
          “Incident text must remain inside company-managed infrastructure.”
          <cite>Search architecture · v1 · Data handling</cite>
        </blockquote>
        <h4 className={styles.evidenceLabel}>
          Code evidence <span>src/search.ts · line 12</span>
        </h4>
        <pre
          tabIndex={0}
          role="region"
          aria-label="Code evidence, horizontally scrollable"
        >
          <code>
            <span className={styles.conflictingLine}>
              <span className={styles.lineNumber}>12</span> const embedding =
              await externalClient.embed(incident.text);
            </span>
            {"\n"}
            <span className={styles.lineNumber}>13</span> const results = await
            index.query(embedding);{"\n"}
            <span className={styles.lineNumber}>14</span> return results;
          </code>
        </pre>
        <div className={styles.advisory}>
          <InfoIcon aria-hidden="true" /> Advisory review · your team chooses
          the resolution
        </div>
      </div>
    </figure>
  );
}

const reviewFeatures = [
  {
    icon: FileTextIcon,
    title: "Exact plan citations",
    text: "See precisely which part of the agreement is relevant.",
  },
  {
    icon: GitBranchIcon,
    title: "Version-specific findings",
    text: "Review against the version your team agreed to.",
  },
  {
    icon: UsersIcon,
    title: "Human-led resolution",
    text: "Keep engineers in control of how to handle findings.",
  },
];

export function LandingPage() {
  return (
    <div className={styles.landing}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>
      <header className={`${styles.container} ${styles.header}`}>
        <Link
          className={styles.brand}
          href="/"
          aria-label="why did we choose this home"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-dark.svg"
            width="263"
            height="24"
            alt="why did we choose this"
          />
        </Link>
        <nav className={styles.navigation} aria-label="Main navigation">
          <a href="#product">Product</a>
          <a href="#workflow">How it works</a>
          <a href="#review">GitHub review</a>
        </nav>
        <div className={styles.headerActions}>
          <a href="/login">Log in</a>
          <Button className={styles.headerButton} render={<a href="/login" />}>
            Get started
          </Button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <section
          className={`${styles.container} ${styles.hero}`}
          aria-labelledby="hero-title"
        >
          <p className={styles.eyebrow}>Engineering planning &amp; review</p>
          <h1 id="hero-title">
            Engineering decisions.
            <br />
            Shared context.
          </h1>
          <p className={styles.introduction}>
            Bring plans, team discussions, and pull request reviews into one
            place. Preserve what you agreed to build—and why.
          </p>
          <div className={styles.actions}>
            <StartPlan />
            <Button
              variant="outline"
              size="xl"
              className={styles.action}
              render={<a href="#workflow" />}
            >
              Explore the workflow
            </Button>
          </div>
        </section>
        <section
          id="product"
          className={styles.container}
          aria-label="Product workspace"
        >
          <WorkspacePreview />
          <div className={styles.capabilities}>
            <div>
              <FileTextIcon aria-hidden="true" />
              <p>
                <strong>Collaborative planning</strong>
                <span>Turn discussions into structured plans.</span>
              </p>
            </div>
            <div>
              <GitBranchIcon aria-hidden="true" />
              <p>
                <strong>Versioned agreements</strong>
                <span>Capture what you agreed to build.</span>
              </p>
            </div>
            <div>
              <CodeIcon aria-hidden="true" />
              <p>
                <strong>GitHub review</strong>
                <span>Connect code review to the plan.</span>
              </p>
            </div>
          </div>
        </section>
        <section
          id="review"
          className={styles.reviewSection}
          aria-labelledby="review-title"
        >
          <div className={`${styles.container} ${styles.reviewGrid}`}>
            <div className={styles.reviewCopy}>
              <p className={styles.eyebrow}>From plan to pull request</p>
              <h2 id="review-title">
                Review against
                <br />
                the agreement.
              </h2>
              <p className={styles.sectionIntroduction}>
                Find consequential departures with citations to the plan and
                evidence from the code. Your team decides how to resolve them.
              </p>
              <ul className={styles.features}>
                {reviewFeatures.map(({ icon: Icon, title, text }) => (
                  <li key={title}>
                    <Icon aria-hidden="true" />
                    <div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <ReviewPreview />
          </div>
        </section>
        <section
          id="workflow"
          className={`${styles.container} ${styles.workflow}`}
          aria-labelledby="workflow-title"
        >
          <h2 id="workflow-title">A clear path from discussion to delivery.</h2>
          <ol className={styles.steps}>
            <li>
              <h3>Plan together</h3>
              <p>
                Capture problems, goals, and options in a shared document.
                Invite the right people to the discussion.
              </p>
            </li>
            <li>
              <h3>Agree on a version</h3>
              <p>
                Publish a clear, versioned record of the decision that your team
                can reference during implementation.
              </p>
            </li>
            <li>
              <h3>Keep reviews grounded</h3>
              <p>
                Connect pull request findings to exact plan citations and
                evidence from the code.
              </p>
            </li>
          </ol>
          <figure className={styles.workflowScreenshot}>
            <picture>
              <source
                media="(max-width: 650px)"
                srcSet="/product/decisions-mobile.webp"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.productScreenshot}
                src="/product/decisions-desktop.webp"
                width="1440"
                height="900"
                alt="The workspace decision library, showing published and draft plans for incident search, developer platform, and workspace security."
                loading="lazy"
              />
            </picture>
          </figure>
        </section>
        <section
          className={`${styles.container} ${styles.closing}`}
          aria-labelledby="closing-title"
        >
          <h2 id="closing-title">Build with shared context.</h2>
          <StartPlan />
        </section>
      </main>
      <footer className={`${styles.container} ${styles.footer}`}>
        <Link
          className={styles.brand}
          href="/"
          aria-label="why did we choose this home"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-dark.svg"
            width="219"
            height="20"
            alt="why did we choose this"
          />
        </Link>
        <span>whydidwechoosethis.tech</span>
      </footer>
    </div>
  );
}
