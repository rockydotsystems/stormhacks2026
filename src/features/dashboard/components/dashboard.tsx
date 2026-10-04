"use client";

import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CaretDownIcon,
  CaretUpDownIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  GitBranchIcon,
  HouseIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  UsersIcon,
  UserIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AccountMenu } from "@/features/account/components/account-menu";
import type { SettingsSection } from "@/features/account/components/account-settings";
import { useSession } from "@/features/auth/client/queries";
import { useDefaultDocumentSort } from "@/features/account/preferences";
const AccountSettings = dynamic(
  () => import("@/features/account/components/account-settings"),
);
import { useRef, useState, type FormEvent } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Combobox,
  ComboboxTrigger,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxValue,
  ComboboxPopup,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  filterDecisions,
  initialDecisions,
  initialProjects,
  type Project,
  people,
  type Decision,
  type DecisionStatus,
} from "@/features/dashboard/preview-data";
import { cn } from "@/lib/utils";

const repositoryOptions: Record<string, string[]> = {
  "Rocky Dot Systems": [
    "rockydotsystems/stormhacks2026",
    "rockydotsystems/incident-search",
    "rockydotsystems/platform",
  ],
  "Rocky Dot Labs": [
    "rockydotsystems/experiments",
    "rockydotsystems/model-evaluations",
  ],
};
const statuses = ["Draft", "In review", "Bound"];
function documentCount(count: number) {
  return `${count} ${count === 1 ? "document" : "documents"}`;
}

function PersonAvatar({ id, className }: { id: string; className?: string }) {
  const person = people[id];
  return (
    <Avatar
      className={cn("size-6 ring-2 ring-background", className)}
      title={person.name}
    >
      <AvatarImage
        src={`https://i.pravatar.cc/80?img=${person.photo}`}
        alt={person.name}
      />
      <AvatarFallback>{person.initials}</AvatarFallback>
    </Avatar>
  );
}

function Status({ status }: { status: DecisionStatus }) {
  return (
    <Badge
      variant={
        status === "Bound"
          ? "success"
          : status === "In review"
            ? "warning"
            : "secondary"
      }
      className="decision-status"
    >
      {status === "Bound" ? (
        <CheckCircleIcon aria-hidden="true" />
      ) : status === "In review" ? (
        <ClockIcon aria-hidden="true" />
      ) : (
        <span className="draft-dot" aria-hidden="true" />
      )}
      {status}
    </Badge>
  );
}

function FilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="outline" className="filter-button" />}
        aria-label={`${label}: ${value}`}
      >
        {value === options[0] && label !== "Sort" ? label : value}
        <CaretDownIcon aria-hidden="true" />
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuGroup>
          <MenuGroupLabel>{label}</MenuGroupLabel>
          <MenuRadioGroup value={value} onValueChange={onChange}>
            {options.map((option) => (
              <MenuRadioItem key={option} value={option} closeOnClick>
                {option}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

function MultiFilter({
  compact = false,
  label,
  values,
  options,
  onChange,
}: {
  compact?: boolean;
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <Combobox multiple items={options} value={values} onValueChange={onChange}>
      <ComboboxChips
        className={cn("dashboard-multi-select", compact && "compact-filter")}
      >
        <ComboboxValue>
          {(selected: string[]) => (
            <>
              {selected.map((value) => (
                <ComboboxChip
                  key={value}
                  aria-label={value}
                  removeProps={{ "aria-label": `Remove ${value}` }}
                >
                  {value}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={`dashboard-${label.toLowerCase().replaceAll(" ", "-")}`}
                aria-label={label}
                placeholder={selected.length ? undefined : label}
                size={compact ? (selected.length ? 2 : label.length) : "sm"}
              />
            </>
          )}
        </ComboboxValue>
        {compact && (
          <ComboboxTrigger
            className="filter-picker-trigger"
            aria-label={`Show ${label.toLowerCase()} options`}
          >
            <CaretDownIcon aria-hidden="true" />
          </ComboboxTrigger>
        )}
      </ComboboxChips>
      <ComboboxPopup
        className={compact ? "compact-filter-popup" : undefined}
        aria-label={`Select ${label.toLowerCase().replaceAll(" ", "-")}`}
      >
        <ComboboxEmpty>No matching options.</ComboboxEmpty>
        <ComboboxList>
          {(option: string) => (
            <ComboboxItem key={option} value={option}>
              {option}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}

export function Dashboard({
  settingsSection,
}: {
  settingsSection?: SettingsSection;
}) {
  const session = useSession();
  const [defaultSort] = useDefaultDocumentSort(session.data?.user?.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [projectRecords, setProjectRecords] = useState(initialProjects);
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const [projectRepositories, setProjectRepositories] = useState<string[]>([]);
  const [creationProject, setCreationProject] = useState("Engineering");
  const [decisions, setDecisions] = useState(initialDecisions);
  const [organization, setOrganization] = useState("Rocky Dot Systems");
  const [view, setView] = useState("Overview");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [project, setProject] = useState<string[]>([]);
  const [sortOverride, setSort] = useState<string | null>(null);
  const sort = sortOverride || defaultSort;
  const [recent, setRecent] = useState(["adr-008", "adr-007", "adr-006"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [myReviews, setMyReviews] = useState(false);
  const selected = decisions.find((decision) => decision.id === selectedId);
  const orgDocuments = decisions.filter(
    (decision) => decision.organization === organization,
  );
  const orgProjects = projectRecords.filter(
    (item) => item.organization === organization,
  );
  const projects = orgProjects.map((item) => item.name);
  const projectItems = projects.map((name) => ({ label: name, value: name }));
  const currentProject = orgProjects.find(
    (item) => item.name === activeProject,
  );
  const projectIsEmpty =
    Boolean(activeProject) &&
    !orgDocuments.some((document) => document.project === activeProject);
  const selectedRepositories =
    selected?.repositories ??
    orgProjects.find((item) => item.name === selected?.project)?.repositories ??
    [];
  const recentDocuments = recent
    .map((id) => orgDocuments.find((decision) => decision.id === id))
    .filter((decision): decision is Decision => Boolean(decision));
  const frequentProjects = [...projects].sort(
    (a, b) =>
      recentDocuments.filter((document) => document.project === b).length -
      recentDocuments.filter((document) => document.project === a).length,
  );
  const filtered = filterDecisions(decisions, {
    organization,
    query,
    status,
    project,
    myReviews,
    scope: activeProject,
    sort,
  });

  function startDocument() {
    const name = activeProject || project[0] || projects[0];
    setCreationProject(name);
    setCreateOpen(true);
  }
  function navigate(nextView: string) {
    scrollRef.current?.scrollTo({ top: 0 });
    setView(nextView);
    setActiveProject(null);
    setMyReviews(false);
    setSelectedId(null);
    setQuery("");
    setStatus([]);
    setProject([]);
    setMobileOpen(false);
  }
  function openProject(name: string) {
    navigate("Projects");
    setActiveProject(name);
  }
  function openDocument(id: string) {
    scrollRef.current?.scrollTo({ top: 0 });
    setSelectedId(id);
    setRecent((ids) => [id, ...ids.filter((item) => item !== id)].slice(0, 5));
    setMobileOpen(false);
  }
  function resetFilters() {
    setMyReviews(false);
    setQuery("");
    setStatus([]);
    setProject([]);
  }
  function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const title = String(fields.get("title")).trim();
    if (!title) {
      event.currentTarget
        .querySelector<HTMLInputElement>("input")
        ?.setCustomValidity("Enter a document name.");
      event.currentTarget.reportValidity();
      return;
    }
    const decision: Decision = {
      id: crypto.randomUUID(),
      title,
      description: String(fields.get("description")).trim(),
      project: String(fields.get("project")),
      creator: "matthew",
      reviewers: [],
      status: "Draft",
      updated: new Date().toISOString(),
      organization,
    };
    setDecisions((items) => [decision, ...items]);
    setCreateOpen(false);
    openProject(decision.project);
    openDocument(decision.id);
  }

  function startProject() {
    setProjectRepositories([]);
    setProjectCreateOpen(true);
  }
  function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get("name")).trim();
    const input = event.currentTarget.querySelector<HTMLInputElement>("input");
    if (
      !name ||
      projects.some((existing) => existing.toLowerCase() === name.toLowerCase())
    ) {
      input?.setCustomValidity(
        name
          ? "A project with this name already exists."
          : "Enter a project name.",
      );
      event.currentTarget.reportValidity();
      return;
    }
    const next: Project = {
      name,
      description: String(fields.get("description")).trim(),
      repositories: projectRepositories,
      organization,
    };
    setProjectRecords((items) => [...items, next]);
    setProjectCreateOpen(false);
    openProject(name);
  }

  const sidebar = (
    <div className="dashboard-sidebar-content">
      <div className="org-row">
        <Menu>
          <MenuTrigger
            render={<Button variant="ghost" className="org-switcher" />}
            aria-label="Switch organization"
          >
            <span className="org-mark" aria-hidden="true">
              r<span>•</span>
            </span>
            <span className="truncate">{organization}</span>
            <CaretUpDownIcon aria-hidden="true" />
          </MenuTrigger>
          <MenuPopup align="start" className="w-60">
            <MenuGroup>
              <MenuGroupLabel>Organizations</MenuGroupLabel>
              {["Rocky Dot Systems", "Rocky Dot Labs"].map((org) => (
                <MenuItem
                  key={org}
                  onClick={() => {
                    setOrganization(org);
                    navigate("Overview");
                  }}
                >
                  <span className="flex-1">{org}</span>
                  {organization === org && <CheckIcon aria-hidden="true" />}
                </MenuItem>
              ))}
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </div>
      {settingsSection ? (
        <>
          <Button
            variant="ghost"
            className="sidebar-item back-to-app"
            render={<Link href="/" />}
          >
            <ArrowLeftIcon aria-hidden="true" />
            Back to app
          </Button>
          <nav
            aria-label="Account settings"
            className="sidebar-navigation settings-navigation"
          >
            {[
              { section: "profile", label: "Profile", icon: UserIcon },
              { section: "security", label: "Security", icon: ShieldCheckIcon },
              {
                section: "preferences",
                label: "Preferences",
                icon: SlidersHorizontalIcon,
              },
            ].map(({ section, label, icon: Icon }) => (
              <Button
                key={section}
                variant="ghost"
                className={cn(
                  "sidebar-item",
                  settingsSection === section && "sidebar-item-active",
                )}
                render={<Link href={`/settings/${section}`} />}
                aria-current={settingsSection === section ? "page" : undefined}
              >
                <Icon aria-hidden="true" />
                {label}
              </Button>
            ))}
            {settingsSection === "team" && (
              <Button
                variant="ghost"
                className="sidebar-item sidebar-item-active"
                render={<Link href="/settings/team" />}
                aria-current="page"
              >
                <UsersIcon aria-hidden="true" />
                Team settings
              </Button>
            )}
          </nav>
        </>
      ) : (
        <>
          <nav aria-label="Workspace" className="sidebar-navigation">
            {[
              { name: "Overview", icon: HouseIcon },
              { name: "Projects", icon: FolderIcon },
              { name: "Documents", icon: FileTextIcon },
            ].map(({ name, icon: Icon }) => (
              <Button
                key={name}
                variant="ghost"
                className={cn(
                  "sidebar-item",
                  view === name && "sidebar-item-active",
                )}
                onClick={() => navigate(name)}
                aria-current={
                  view === name && !selected && !activeProject
                    ? "page"
                    : undefined
                }
              >
                <Icon
                  aria-hidden="true"
                  weight={view === name ? "fill" : "regular"}
                />
                <span>{name}</span>
              </Button>
            ))}
          </nav>
          <div className="sidebar-section">
            <h2>Projects</h2>
            <nav aria-label="Projects">
              {projects.map((name) => (
                <Button
                  key={name}
                  variant="ghost"
                  className={cn(
                    "sidebar-item",
                    activeProject === name && "sidebar-item-active",
                  )}
                  onClick={() => openProject(name)}
                >
                  <FolderIcon aria-hidden="true" />
                  <span className="truncate">{name}</span>
                  <span className="sidebar-count">
                    {
                      orgDocuments.filter(
                        (decision) => decision.project === name,
                      ).length
                    }
                  </span>
                </Button>
              ))}
            </nav>
          </div>
          <div className="sidebar-section sidebar-recents">
            <h2>Recently viewed</h2>
            <nav aria-label="Recently viewed documents">
              {recentDocuments.length ? (
                recentDocuments.map((decision) => (
                  <Button
                    key={decision.id}
                    variant="ghost"
                    className={cn(
                      "sidebar-item",
                      selectedId === decision.id && "sidebar-item-active",
                    )}
                    onClick={() => openDocument(decision.id)}
                    title={decision.title}
                  >
                    <FileTextIcon aria-hidden="true" />
                    <span className="truncate">{decision.title}</span>
                  </Button>
                ))
              ) : (
                <p className="sidebar-empty">Documents you open appear here.</p>
              )}
            </nav>
          </div>
        </>
      )}
      <div className="sidebar-bottom">
        <p className="product-wordmark">
          WhyDidWeChooseThis<span>.Tech</span>
        </p>
        <AccountMenu />
      </div>
    </div>
  );

  return (
    <div className="dashboard-shell">
      <a className="dashboard-skip" href="#dashboard-main">
        Skip to content
      </a>
      <aside className="dashboard-sidebar">{sidebar}</aside>
      <main id="dashboard-main" className="dashboard-main">
        <header className="dashboard-topbar">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-nav-toggle"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <ListIcon />
          </Button>
          {settingsSection ? (
            <nav aria-label="Breadcrumb">
              <ol className="dashboard-breadcrumb">
                <li>
                  <Link href="/">Workspace</Link>
                </li>
                <li className="breadcrumb-divider" aria-hidden="true">
                  /
                </li>
                <li>Settings</li>
                <li className="breadcrumb-divider" aria-hidden="true">
                  /
                </li>
                <li className="breadcrumb-current" aria-current="page">
                  {settingsSection === "team"
                    ? "Team settings"
                    : settingsSection.charAt(0).toUpperCase() +
                      settingsSection.slice(1)}
                </li>
              </ol>
            </nav>
          ) : (
            <nav aria-label="Breadcrumb">
              <ol className="dashboard-breadcrumb">
                <li>
                  <button type="button" onClick={() => navigate("Overview")}>
                    Workspace
                  </button>
                </li>
                {activeProject || selected ? (
                  <>
                    <li className="breadcrumb-divider" aria-hidden="true">
                      /
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => navigate("Projects")}
                      >
                        Projects
                      </button>
                    </li>
                    <li className="breadcrumb-divider" aria-hidden="true">
                      /
                    </li>
                    <li>
                      {selected ? (
                        <button
                          type="button"
                          onClick={() => openProject(selected.project)}
                        >
                          {selected.project}
                        </button>
                      ) : (
                        <span
                          className="breadcrumb-current"
                          aria-current="page"
                        >
                          {activeProject}
                        </span>
                      )}
                    </li>
                    {selected && (
                      <>
                        <li className="breadcrumb-divider" aria-hidden="true">
                          /
                        </li>
                        <li
                          className="breadcrumb-current breadcrumb-document"
                          aria-current="page"
                        >
                          {selected.title}
                        </li>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <li className="breadcrumb-divider" aria-hidden="true">
                      /
                    </li>
                    <li className="breadcrumb-current" aria-current="page">
                      {view}
                    </li>
                  </>
                )}
              </ol>
            </nav>
          )}
        </header>
        <div className="dashboard-scroll" ref={scrollRef}>
          {settingsSection ? (
            <AccountSettings section={settingsSection} />
          ) : selected ? (
            <div className="decision-detail">
              <Button
                variant="ghost"
                className="back-button"
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeftIcon aria-hidden="true" />
                Back to {activeProject || view.toLowerCase()}
              </Button>
              <div className="detail-meta">
                <span>{selected.project}</span>
                <Status status={selected.status} />
              </div>
              <h1>{selected.title}</h1>
              <p className="detail-description">
                {selected.description ||
                  "Start a planning session to develop this decision with your team."}
              </p>
              <dl className="detail-properties">
                <div>
                  <dt>Created by</dt>
                  <dd>
                    <PersonAvatar id={selected.creator} />
                    {people[selected.creator].name}
                  </dd>
                </div>
                <div>
                  <dt>Reviewers</dt>
                  <dd>
                    {selected.reviewers.length
                      ? selected.reviewers.map((id) => (
                          <PersonAvatar key={id} id={id} />
                        ))
                      : "No reviewers requested"}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    {selected.status === "Bound"
                      ? "Immutable agreement"
                      : "Mutable draft"}
                  </dd>
                </div>
                <div>
                  <dt>Repositories</dt>
                  <dd className="repository-details">
                    {selectedRepositories.length
                      ? selectedRepositories.map((repository) => (
                          <span key={repository}>{repository}</span>
                        ))
                      : "No repositories linked"}
                  </dd>
                </div>
              </dl>
              <div className="detail-note">
                <h2>
                  {selected.status === "Bound"
                    ? "Bound agreement"
                    : "Planning session"}
                </h2>
                <p>
                  {selected.status === "Bound"
                    ? "This document represents a bound decision. Draft amendments must be reviewed and explicitly bound as a new version."
                    : "Discuss the context, consider alternatives, and agree on the constraints before binding a version."}
                </p>
                <Button variant="outline" render={<Link href="/workspace" />}>
                  Open document workspace
                  <ArrowUpRightIcon aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="dashboard-content">
              <div className="dashboard-heading">
                <h1>{activeProject || view}</h1>
                <Button
                  onClick={
                    view === "Projects" && !activeProject
                      ? startProject
                      : startDocument
                  }
                  className="new-document-button"
                >
                  <PlusIcon aria-hidden="true" />
                  {view === "Projects" && !activeProject
                    ? "New project"
                    : "New document"}
                </Button>
              </div>
              {currentProject && (
                <div className="project-context">
                  {currentProject.description && (
                    <p>{currentProject.description}</p>
                  )}
                  <div className="project-repository-metadata">
                    <span className="project-repository-label">
                      <GitBranchIcon aria-hidden="true" />
                      Repositories
                    </span>
                    <div
                      className="project-repositories"
                      aria-label="Project repositories"
                    >
                      {currentProject.repositories.map((repository) => (
                        <a
                          key={repository}
                          href={`https://github.com/${repository}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {repository}
                          <ArrowUpRightIcon aria-hidden="true" />
                        </a>
                      ))}
                      {!currentProject.repositories.length && (
                        <span>No repositories linked</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {(view === "Overview" ||
                (view === "Projects" && !activeProject)) && (
                <section
                  className="projects-section"
                  aria-labelledby="projects-heading"
                >
                  <div className="overview-section-heading">
                    <h2
                      id="projects-heading"
                      className={view === "Overview" ? "" : "sr-only"}
                    >
                      Projects
                    </h2>
                    {view === "Overview" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("Projects")}
                      >
                        View all
                        <ArrowUpRightIcon aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                  <div className="project-grid">
                    {(view === "Overview" ? frequentProjects : projects).map(
                      (name) => (
                        <button
                          key={name}
                          type="button"
                          className={cn(
                            "project-card",
                            activeProject === name && "project-selected",
                          )}

                          onClick={() => openProject(name)}
                        >
                          <div
                            className={cn(
                              "folder-art",
                              `folder-tone-${projects.indexOf(name) % 3}`,
                            )}
                            aria-hidden="true"
                          >
                            <div className="folder-back" />
                            <div className="folder-paper paper-back">
                              <i />
                              <i />
                              <i />
                            </div>
                            <div className="folder-paper paper-front">
                              <i />
                              <i />
                              <i />
                            </div>
                            <div className="folder-flap">
                              <span className="folder-seam" />
                            </div>
                          </div>
                          <div className="project-card-label">
                            <span>
                              <strong>{name}</strong>
                              <small className="project-description">
                                {
                                  orgProjects.find((item) => item.name === name)
                                    ?.description
                                }
                              </small>
                              <small className="project-document-count">
                                {documentCount(
                                  orgDocuments.filter(
                                    (decision) => decision.project === name,
                                  ).length,
                                )}
                              </small>
                            </span>
                            <ArrowUpRightIcon aria-hidden="true" />
                          </div>
                        </button>
                      ),
                    )}
                  </div>
                </section>
              )}
              {(view === "Overview" ||
                view === "Documents" ||
                activeProject) && (
                <section
                  className="documents-section"
                  aria-labelledby="documents-heading"
                >
                  <div className="overview-section-heading">
                    <h2
                      id="documents-heading"
                      className={view === "Overview" ? "" : "sr-only"}
                    >
                      {view === "Overview" ? "Recently viewed" : "Documents"}
                    </h2>
                    {view === "Overview" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("Documents")}
                      >
                        View all documents
                        <ArrowUpRightIcon aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                  {view !== "Overview" && (
                    <div className="document-toolbar">
                      <div className="document-search">
                        <MagnifyingGlassIcon aria-hidden="true" />
                        <Input
                          type="search"
                          aria-label="Search documents"
                          placeholder="Search documents…"
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                        />
                      </div>
                      <div className="document-filters">
                        <Button
                          variant={myReviews ? "secondary" : "outline"}
                          className="filter-button"
                          aria-pressed={myReviews}
                          onClick={() => setMyReviews(!myReviews)}
                        >
                          <CheckCircleIcon aria-hidden="true" />
                          My reviews
                        </Button>
                        <MultiFilter
                          compact
                          label="Status"
                          values={status}
                          options={statuses}
                          onChange={setStatus}
                        />
                        {!activeProject && (
                          <MultiFilter
                            compact
                            label="Project"
                            values={project}
                            options={projects}
                            onChange={setProject}
                          />
                        )}
                        <FilterMenu
                          label="Sort"
                          value={sort}
                          options={["Last updated", "Name"]}
                          onChange={setSort}
                        />
                      </div>
                    </div>
                  )}
                  <div className="document-list">
                    <div className="document-table-heading" aria-hidden="true">
                      <span>Document</span>
                      <span>Status</span>
                      <span>Created by</span>
                      <span>Reviewers</span>
                      <span>Updated</span>
                    </div>
                    {(view === "Overview" ? recentDocuments : filtered).map(
                      (decision) => (
                        <div className="document-row" key={decision.id}>
                          <button
                            type="button"
                            className="document-title-cell"
                            onClick={() => openDocument(decision.id)}
                          >
                            <FileTextIcon aria-hidden="true" />
                            <span>
                              <strong>{decision.title}</strong>
                              <small>
                                {decision.description || "No description yet"}
                              </small>
                            </span>
                          </button>
                          <div className="document-status-cell">
                            <Status status={decision.status} />
                          </div>
                          <div className="document-creator-cell">
                            <PersonAvatar id={decision.creator} />
                            <span>
                              {people[decision.creator].name.split(" ")[0]}
                            </span>
                          </div>
                          <div
                            className="document-reviewers-cell"
                            aria-label={`Requested reviewers: ${decision.reviewers.map((id) => people[id].name).join(", ") || "None"}`}
                          >
                            {decision.reviewers.length ? (
                              <div className="reviewer-stack">
                                {decision.reviewers.map((id) => (
                                  <PersonAvatar key={id} id={id} />
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                          <time
                            className="document-updated-cell"
                            dateTime={decision.updated}
                          >
                            {new Intl.DateTimeFormat("en", {
                              month: "short",
                              day: "numeric",
                              timeZone: "America/Edmonton",
                            }).format(new Date(decision.updated))}
                          </time>
                        </div>
                      ),
                    )}
                    {(view === "Overview"
                      ? recentDocuments.length
                      : filtered.length) === 0 && (
                      <div className="documents-empty">
                        <FileTextIcon aria-hidden="true" />
                        <h3>
                          {view === "Overview"
                            ? "No recently viewed documents"
                            : projectIsEmpty
                              ? "No documents yet"
                              : "No matching documents"}
                        </h3>
                        <p>
                          {view === "Overview"
                            ? "Open a document to pick up your work here."
                            : projectIsEmpty
                              ? "Create the first decision for this project."
                              : "Try another search or clear the filters."}
                        </p>
                        <Button
                          variant="outline"
                          onClick={
                            view === "Overview"
                              ? () => navigate("Documents")
                              : projectIsEmpty
                                ? startDocument
                                : resetFilters
                          }
                        >
                          {view === "Overview"
                            ? "Browse documents"
                            : projectIsEmpty
                              ? "New document"
                              : "Clear search & filters"}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="document-list-footer">
                    <span role="status">
                      {view === "Overview" ? (
                        `${recentDocuments.length} recently viewed documents`
                      ) : (
                        <>
                          {filtered.length} of{" "}
                          {activeProject
                            ? orgDocuments.filter(
                                (decision) =>
                                  decision.project === activeProject,
                              ).length
                            : orgDocuments.length}{" "}
                          documents
                        </>
                      )}
                    </span>
                    <span>
                      <UsersIcon aria-hidden="true" />
                      Shared with your team
                    </span>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPopup className="dashboard-mobile-popup">
          <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
          {sidebar}
        </DialogPopup>
      </Dialog>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>New document</DialogTitle>
            <DialogDescription>
              Create a draft in {organization}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createDocument}>
            <DialogPanel className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="document-name">Name</Label>
                <Input
                  id="document-name"
                  name="title"
                  required
                  maxLength={180}
                  placeholder="e.g. PostgreSQL as our primary datastore"
                  onChange={(event) =>
                    event.currentTarget.setCustomValidity("")
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="document-description">Description</Label>
                <Textarea
                  id="document-description"
                  name="description"
                  placeholder="What decision is the team making?"
                  maxLength={1000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="document-project">Project</Label>
                <Select
                  name="project"
                  items={projectItems}
                  value={creationProject}
                  onValueChange={(name) => {
                    if (!name) return;
                    setCreationProject(name);
                  }}
                  required
                >
                  <SelectTrigger id="document-project">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {projects.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit">Create document</Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
      <Dialog open={projectCreateOpen} onOpenChange={setProjectCreateOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Group related decisions and their repositories in {organization}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createProject}>
            <DialogPanel className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  name="name"
                  required
                  maxLength={80}
                  placeholder="e.g. Frontend or Billing"
                  onChange={(event) =>
                    event.currentTarget.setCustomValidity("")
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-description">Description</Label>
                <Textarea
                  id="project-description"
                  name="description"
                  maxLength={1000}
                  placeholder="What does this project cover?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dashboard-project-repositories">
                  Repositories
                </Label>
                <MultiFilter
                  label="Project repositories"
                  values={projectRepositories}
                  options={repositoryOptions[organization]}
                  onChange={setProjectRepositories}
                />
                <p className="text-xs text-muted-foreground">
                  Repositories can belong to more than one project.
                </p>
              </div>
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit">Create project</Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
