import {
  ArrowRightIcon,
  CheckCircleIcon,
  CodeIcon,
  FileTextIcon,
  FolderIcon,
  GitBranchIcon,
  HouseIcon,
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
      <div className={styles.workspace}>
        <div className={styles.sidebar} aria-hidden="true">
          <div className={styles.organization}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/symbol-dark.svg" width="19" height="21" alt="" />
            Acme Engineering
          </div>
          <div>
            <HouseIcon /> Overview
          </div>
          <div>
            <FolderIcon /> Projects
          </div>
          <div>
            <FileTextIcon /> Documents
          </div>
          <hr />
          <small>Projects</small>
          <div className={styles.selectedProject}>
            <FolderIcon /> Incident search
          </div>
        </div>
        <div className={styles.workspaceMain}>
          <div className={styles.breadcrumb}>
            <span>
              Projects <span aria-hidden="true">/</span> Incident search{" "}
              <span aria-hidden="true">/</span>{" "}
              <strong>Search architecture</strong>
            </span>
            <span className={styles.version}>Published v1</span>
          </div>
          <div className={styles.workspaceBody}>
            <article className={styles.document} aria-label="Example plan">
              <h2>Search architecture</h2>
              <p className={styles.byline}>Published by the team · Version 1</p>
              <h3>Problem and goals</h3>
              <p>
                We need a fast, reliable search experience for incident data to
                help engineers find relevant context during on-call and
                investigation.
              </p>
              <p>
                The system should be accurate, performant, and respect our
                security requirements.
              </p>
              <h3>Data handling</h3>
              <p>
                Incident text, metadata, and embeddings must be processed and
                stored within our infrastructure. We will not send incident
                content to external services or third-party providers.
              </p>
              <blockquote>
                Incident text must remain inside company-managed infrastructure.
              </blockquote>
              <p>
                We may use open source models and self-hosted infrastructure,
                provided they meet our security requirements.
              </p>
            </article>
            <aside
              className={styles.discussion}
              aria-label="Example team discussion"
            >
              <h3>Discussion</h3>
              <div className={styles.discussionSummary}>
                <span>3 comments</span>
                <span>1 resolved</span>
              </div>
              <div className={styles.comment}>
                <span className={styles.avatar} aria-hidden="true">
                  JL
                </span>
                <div>
                  <p>
                    <strong>Jamie Lee</strong>
                    <small>Oct 3</small>
                  </p>
                  <p>Should external services receive incident content?</p>
                </div>
              </div>
              <div className={styles.comment}>
                <span
                  className={`${styles.avatar} ${styles.tealAvatar}`}
                  aria-hidden="true"
                >
                  MH
                </span>
                <div>
                  <p>
                    <strong>Matthew H.</strong>
                    <small>Oct 3</small>
                  </p>
                  <p>
                    No. Keep storage and processing inside our infrastructure.
                  </p>
                </div>
              </div>
              <div className={styles.comment}>
                <span
                  className={`${styles.avatar} ${styles.grayAvatar}`}
                  aria-hidden="true"
                >
                  SC
                </span>
                <div>
                  <p>
                    <strong>Sarah Chen</strong>
                    <small>Oct 4</small>
                  </p>
                  <p>Are there any exceptions for model evaluation?</p>
                </div>
              </div>
              <div className={styles.discussionFooter}>
                <CheckCircleIcon aria-hidden="true" /> A shared record of the
                decision
              </div>
            </aside>
          </div>
        </div>
      </div>
      <figcaption>
        Illustrative workspace · example plan and discussion
      </figcaption>
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
          aria-label="Example code evidence, horizontally scrollable"
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
      <figcaption>
        Illustrative review · planned workflow, not yet available
      </figcaption>
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
                <strong>
                  GitHub review <small>Planned</small>
                </strong>
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
              <p className={styles.eyebrow}>
                From plan to pull request · planned workflow
              </p>
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
              <h3>
                Keep reviews grounded <small>Planned</small>
              </h3>
              <p>
                Connect pull request findings to exact plan citations and
                evidence from the code.
              </p>
            </li>
          </ol>
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
