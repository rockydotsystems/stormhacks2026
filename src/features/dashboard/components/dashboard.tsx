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
  HouseIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
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
  ComboboxPopup,
  ComboboxInput,
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
  MenuLinkItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Textarea } from "@/components/ui/textarea";
import {
  filterDecisions,
  initialDecisions,
  people,
  type Decision,
  type DecisionStatus,
} from "@/features/dashboard/preview-data";
import { cn } from "@/lib/utils";

const collections = ["Engineering", "Infrastructure", "Product"];
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
        {label === "Status" && <SlidersHorizontalIcon aria-hidden="true" />}
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
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <Combobox multiple items={options} value={values} onValueChange={onChange}>
      <ComboboxTrigger
        render={<Button variant="outline" className="filter-button" />}
        aria-label={`${label}: ${values.join(", ") || "All"}`}
      >
        {label === "Status" && <SlidersHorizontalIcon aria-hidden="true" />}
        {values.length === 1 ? values[0] : label}
        {values.length > 1 && (
          <Badge variant="secondary">{values.length}</Badge>
        )}
        <CaretDownIcon aria-hidden="true" />
      </ComboboxTrigger>
      <ComboboxPopup
        className="w-60"
        aria-label={`Select ${label.toLowerCase()}`}
      >
        <div className="border-b p-2">
          <ComboboxInput
            aria-label={`Search ${label.toLowerCase()}`}
            placeholder={`Search ${label.toLowerCase()}…`}
            showTrigger={false}
          />
        </div>
        <ComboboxEmpty>No matching options.</ComboboxEmpty>
        <ComboboxList>
          {(option: string) => (
            <ComboboxItem key={option} value={option}>
              {option}
            </ComboboxItem>
          )}
        </ComboboxList>
        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => onChange([])}
          >
            Clear selection
          </Button>
        </div>
      </ComboboxPopup>
    </Combobox>
  );
}

export function Dashboard() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [decisions, setDecisions] = useState(initialDecisions);
  const [organization, setOrganization] = useState("Rocky Dot Systems");
  const [view, setView] = useState("Documents");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [collection, setCollection] = useState<string[]>([]);
  const [sort, setSort] = useState("Last updated");
  const [recent, setRecent] = useState(["adr-008", "adr-007", "adr-006"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [myReviews, setMyReviews] = useState(false);
  const selected = decisions.find((decision) => decision.id === selectedId);
  const orgDocuments = decisions.filter(
    (decision) => decision.organization === organization,
  );
  const recentDocuments = recent
    .map((id) => orgDocuments.find((decision) => decision.id === id))
    .filter((decision): decision is Decision => Boolean(decision));
  const filtered = filterDecisions(decisions, {
    organization,
    query,
    status,
    collection,
    myReviews,
    scope: activeCollection,
    sort,
  });

  function navigate(nextView: string) {
    scrollRef.current?.scrollTo({ top: 0 });
    setView(nextView);
    setActiveCollection(null);
    setMyReviews(false);
    setSelectedId(null);
    setQuery("");
    setStatus([]);
    setCollection([]);
    setMobileOpen(false);
  }
  function openCollection(name: string) {
    navigate("Collections");
    setActiveCollection(name);
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
    setCollection([]);
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
      collection: String(fields.get("collection")),
      creator: "matthew",
      reviewers: fields.getAll("reviewers").map(String),
      status: "Draft",
      updated: new Date().toISOString(),
      organization,
    };
    setDecisions((items) => [decision, ...items]);
    setCreateOpen(false);
    resetFilters();
    openDocument(decision.id);
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
                    navigate("Documents");
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
      <nav aria-label="Workspace" className="sidebar-navigation">
        {[
          { name: "Documents", icon: HouseIcon },
          { name: "Collections", icon: FolderIcon },
        ].map(({ name, icon: Icon }) => (
          <Button
            key={name}
            variant="ghost"
            className={cn(
              "sidebar-item",
              view === name && "sidebar-item-active",
            )}
            onClick={() => navigate(name)}
            aria-current={view === name && !selected ? "page" : undefined}
          >
            <Icon
              aria-hidden="true"
              weight={view === name ? "fill" : "regular"}
            />
            <span>{name}</span>
          </Button>
        ))}
      </nav>
      {view === "Collections" && (
        <div className="sidebar-collection-children">
          <nav aria-label="Collections">
            {collections.map((name) => (
              <Button
                key={name}
                variant="ghost"
                className={cn(
                  "sidebar-item",
                  activeCollection === name && "sidebar-item-active",
                )}
                onClick={() => openCollection(name)}
              >
                <FolderIcon aria-hidden="true" />
                <span>{name}</span>
                <span className="sidebar-count">
                  {
                    orgDocuments.filter(
                      (decision) => decision.collection === name,
                    ).length
                  }
                </span>
              </Button>
            ))}
          </nav>
        </div>
      )}
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
      <div className="sidebar-bottom">
        <p className="product-wordmark">
          WhyDidWeChooseThis<span>.Tech</span>
        </p>
        <Menu>
          <MenuTrigger
            render={<Button variant="ghost" className="profile-button" />}
            aria-label="Open profile menu"
          >
            <PersonAvatar id="matthew" className="size-8" />
            <span>
              <strong>Matthew</strong>
              <small>Team workspace</small>
            </span>
            <CaretUpDownIcon aria-hidden="true" />
          </MenuTrigger>
          <MenuPopup side="top" align="start" className="w-56">
            <MenuGroup>
              <MenuGroupLabel>Matthew</MenuGroupLabel>
              <MenuItem onClick={() => setProfileOpen(true)}>
                View profile
              </MenuItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuLinkItem render={<Link href="/starter" />}>
              Account & sign in
              <ArrowUpRightIcon aria-hidden="true" />
            </MenuLinkItem>
          </MenuPopup>
        </Menu>
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
          <span>Workspace</span>
          <span className="breadcrumb-divider">/</span>
          <span className="breadcrumb-current">
            {selected
              ? selected.collection
              : activeCollection
                ? `Collections / ${activeCollection}`
                : view}
          </span>
        </header>
        <div className="dashboard-scroll" ref={scrollRef}>
          {selected ? (
            <div className="decision-detail">
              <Button
                variant="ghost"
                className="back-button"
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeftIcon aria-hidden="true" />
                Back to {activeCollection || view.toLowerCase()}
              </Button>
              <div className="detail-meta">
                <span>{selected.collection}</span>
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
                <h1>{activeCollection || view}</h1>
                <Button
                  onClick={() => setCreateOpen(true)}
                  className="new-document-button"
                >
                  <PlusIcon aria-hidden="true" />
                  New document
                </Button>
              </div>
              {view === "Collections" && !activeCollection && (
                <section
                  className="collections-section"
                  aria-labelledby="collections-heading"
                >
                  <h2 id="collections-heading" className="sr-only">
                    Collections
                  </h2>
                  <div className="collection-grid">
                    {collections.map((name, index) => (
                      <button
                        key={name}
                        type="button"
                        className={cn(
                          "collection-card",
                          activeCollection === name && "collection-selected",
                        )}

                        onClick={() => openCollection(name)}
                      >
                        <div
                          className={cn("folder-art", `folder-tone-${index}`)}
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
                        <div className="collection-card-label">
                          <span>
                            <strong>{name}</strong>
                            <small>
                              {documentCount(
                                orgDocuments.filter(
                                  (decision) => decision.collection === name,
                                ).length,
                              )}
                            </small>
                          </span>
                          <ArrowUpRightIcon aria-hidden="true" />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {(view === "Documents" || activeCollection) && (
                <section
                  className="documents-section"
                  aria-labelledby="documents-heading"
                >
                  <h2 id="documents-heading" className="sr-only">
                    Documents
                  </h2>
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
                        label="Status"
                        values={status}
                        options={statuses}
                        onChange={setStatus}
                      />
                      {!activeCollection && (
                        <MultiFilter
                          label="Collection"
                          values={collection}
                          options={collections}
                          onChange={setCollection}
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
                  <div className="document-list">
                    <div className="document-table-heading" aria-hidden="true">
                      <span>Document</span>
                      <span>Status</span>
                      <span>Created by</span>
                      <span>Reviewers</span>
                      <span>Updated</span>
                    </div>
                    {filtered.map((decision) => (
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
                    ))}
                    {filtered.length === 0 && (
                      <div className="documents-empty">
                        <FileTextIcon aria-hidden="true" />
                        <h3>No matching documents</h3>
                        <p>Try another search or clear the filters.</p>
                        <Button variant="outline" onClick={resetFilters}>
                          Clear search & filters
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="document-list-footer">
                    <span role="status">
                      {filtered.length} of{" "}
                      {activeCollection
                        ? orgDocuments.filter(
                            (decision) =>
                              decision.collection === activeCollection,
                          ).length
                        : orgDocuments.length}{" "}
                      documents
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
                <Label htmlFor="document-collection">Collection</Label>
                <select
                  className="dashboard-select"
                  id="document-collection"
                  name="collection"
                  defaultValue={
                    activeCollection || collection[0] || "Engineering"
                  }
                >
                  {collections.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </div>
              <fieldset className="reviewer-fields">
                <legend>Requested reviewers</legend>
                {Object.entries(people)
                  .filter(([id]) => id !== "matthew")
                  .map(([id, person]) => (
                    <label key={id}>
                      <input type="checkbox" name="reviewers" value={id} />
                      <PersonAvatar id={id} />
                      {person.name}
                    </label>
                  ))}
              </fieldset>
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
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
            <DialogDescription>
              Manage your account and team workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex items-center gap-3 py-3">
              <PersonAvatar id="matthew" className="size-12" />
              <div>
                <p className="font-medium">Matthew</p>
                <p className="text-sm text-muted-foreground">
                  {organization} · Member
                </p>
              </div>
            </div>
            <Button render={<Link href="/starter" />} variant="outline">
              Open account & sign in
              <ArrowUpRightIcon aria-hidden="true" />
            </Button>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
